import ffmpegTSParams
import urlparse
import operator
import tempfile
import commands
import memcache
import hashlib
import random
import base64
import urllib
import struct
import time
import json
import sys
import os

TS_PREPARER_PATH = 'node %s' % os.path.join(os.path.dirname(__file__), '../../native/node_addons/TsPreparer/TsPreparer.js')
FFPROBE_PATH = '/web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh'
FFMPEG_PATH = '/web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh'

MEMCACHE_HOST = 'localhost'
MEMCACHE_PORT = 11211

MAX_DVR_LENGTH = 35 * 60		# XXXX TODO should be per entry

RESULT_MANIFEST_EXPIRY = 20
EXTRA_DELAY = 5				# measured in segments
DISABLE_DVR = True
MINIMUM_RUN_PERIOD = 60
CYCLE_INTERVAL = 2

def writeOutput(msg):
	global lastTimestamp
	curTimestamp = time.time()
	duration = curTimestamp - lastTimestamp
	lastTimestamp = curTimestamp
	for curLine in msg.split('\n'):
		sys.stdout.write('%s [%s] [%s] %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), duration, sessionId, curLine))
		sys.stdout.flush()

def md5(buf):
	m = hashlib.md5()
	m.update(buf)
	return m.digest().encode('hex')

def getUrl(url, fileExt):
	path = os.path.join(tempDownloadPath, md5(url) + fileExt)
	if not os.path.exists(path):
		writeOutput("downloading %s to %s" % (url, path))
		startTime = time.time()
		urllib.urlretrieve(url, path)
		writeOutput("download took %s" % (time.time() - startTime))
	return path
	
def executeCommand(cmdLine):
	writeOutput(cmdLine)
	startTime = time.time()
  	writeOutput(commands.getoutput(cmdLine))
	writeOutput('command took %s' % (time.time() - startTime))

def videoExistsInMemcache(memcache, key):
	metadata = memcache.get('%s-metadata' % key)
	if metadata == None:
		return False
	chunkCount = struct.unpack('=L', metadata[:4])[0]
	for curChunk in xrange(chunkCount):
		if not memcache.touch('%s-%s' % (key, curChunk)):
			return False
	return True
	
def cutTsFiles(videoKey, buffer, position, portion):
	# parse buffer
	(segment1, segment2, segment3) = buffer
	url1 = segment1['URL']
	url2 = segment2['URL']
	url3 = segment3['URL']
	position = '%d' % position
	
	# get the 3 segments
	path1 = getUrl(url1, '.ts')
	path2 = getUrl(url2, '.ts')
	path3 = getUrl(url3, '.ts')
	
	commandLine = ' '.join(map(lambda x: str(x), [TS_PREPARER_PATH, MEMCACHE_HOST, MEMCACHE_PORT, MAX_DVR_LENGTH, videoKey, FFMPEG_PATH, FFPROBE_PATH, portion, position, path1, path2, path3]))
	executeCommand(commandLine)
	
def parseM3U8(manifestUrl, streamData):
	header = {}
	segments = []
	footer = {}
	segmentInfo = {}
	lastSequenceNum = None
	streamData = streamData.strip()
	if not streamData.startswith('#EXTM3U'):
		return (None, None, None)
	m3u8Lines = streamData.split("\n")
	for m3u8Line in m3u8Lines:
		m3u8Line = m3u8Line.strip()
		if len(m3u8Line) == 0:
			continue
		if m3u8Line[0] != '#':
			if lastSequenceNum == None:
				if header.has_key('EXT-X-MEDIA-SEQUENCE'):
					lastSequenceNum = int(header['EXT-X-MEDIA-SEQUENCE'])			# live
				else:
					lastSequenceNum = 1												# vod
			segmentInfo['URL'] = urlparse.urljoin(manifestUrl, m3u8Line)
			segmentInfo['SEQ'] = lastSequenceNum
			segments.append(segmentInfo)
			segmentInfo = {}
			lastSequenceNum += 1
			continue
			
		splittedLine = m3u8Line[1:].split(':', 1)
		if len(splittedLine) < 2:
			splittedLine.append('')
		(key, value) = splittedLine
		if key in ['EXT-X-ENDLIST']:
			footer[key] = value
			
		elif key in ['EXTINF', 'EXT-X-DISCONTINUITY']:
			value = value.split(',')[0]
			if key in ['EXTINF']:
				value = float(value)
			segmentInfo[key] = value
			
		else:
			header[key] = value
			
		
	return (header, segments, footer)
	
def buildM3U8(header, segments, footer):
	result = ''
	for (key, value) in header.items():
		result += "#%s" % (key)
		if len(value) != 0:
			result += ":%s" % (value)
		result += "\n"
		
	for segment in segments:
		url = segment['URL']
		result += "#EXTINF:%.3f\n" % segment['EXTINF']
		result += url+"\n"
			
		
	for (key, value) in footer.items():
		result += "#%s" % (key)
		if len(value) != 0:
			result += ":%s" % (value)
		result += "\n"
		
	return result
	
class ManifestStitcher:
	def __init__(self):
		self.urlTranslations = {}
		self.inAdSlot = False
		self.cuePointId = ''
		self.adStartOffset = 0
		self.adEndOffset = 0
		self.adCurOffset = 0
		self.adStartSegment = 0
		self.lastUsedSegment = None

	def getUpdatedManifest(self, liveStreamUrl, adPositionsKey):
		# get and parse source stream
		streamData = urllib.urlopen(liveStreamUrl).read()
		(header, segments, footer) = parseM3U8(liveStreamUrl, streamData)
		if segments == None:
			return (None, None)
		
		# parse ad positions
		adPositions = memcache.gets(adPositionsKey)
		if adPositions != None:
			adPositions = json.loads(adPositions)
		else:
			adPositions = []
			
		writeOutput('read ad positions ' + repr(adPositions));
			
		# process the segments
		newResult = []
		buffer = []
		usedCuePoints = set([])
		
		# XXX TODO use the extra delay to process segments before they are needed
		segCount = len(segments) - EXTRA_DELAY
		for segIndex in xrange(segCount):
			# hold a buffer of 3 segments
			buffer.append(segments[segIndex])
			if len(buffer) < 3:
				continue
			buffer = buffer[-3:]
			
			# load buffer
			(segment1, segment2, segment3) = buffer
			url1 = segment1['URL']
			seg1 = segment1['SEQ']
			
			# check whether we already mapped this buffer
			if self.urlTranslations.has_key(url1):
				(cuePointId, newSegment) = self.urlTranslations[url1]
				newResult.append(newSegment)
				usedCuePoints.add(cuePointId)
				continue

			if self.lastUsedSegment == None or seg1 > self.lastUsedSegment:
				# update the last used segment
				self.lastUsedSegment = seg1
				# check whether we should start an ad
				if not self.inAdSlot:
					for adPosition in adPositions:
						if seg1 + 1 == adPosition['startSegmentId']:
							self.inAdSlot = True
							self.cuePointId = str(adPosition['cuePointId'])
							self.adStartOffset = int((segment1['EXTINF'] + adPosition['startSegmentOffset']) * 90000)
							self.adEndOffset = self.adStartOffset + int(adPosition['adSlotDuration'] * 90000)
							self.adCurOffset = 0
							self.adStartSegment = seg1
							
							writeOutput('ad started - cuePoint=%s, adStartOffset=%s, adEndOffset=%s' % (self.cuePointId, self.adStartOffset, self.adEndOffset))
							break

			# not part of ad -> just output it
			if not self.inAdSlot or seg1 < self.adStartSegment:
				newResult.append(segment1)
				continue

			curSegmentDuration = int(segment1['EXTINF'] * 90000)
			nextSegmentDuration = int(segment2['EXTINF'] * 90000)
				
			if self.adCurOffset == 0:
				# create pre ad ts
				videoKey = 'preAd-%s-%s' % (liveStreamUrlHash, self.cuePointId)
				if not videoExistsInMemcache(memcache, videoKey):
					cutTsFiles(videoKey, buffer, self.adStartOffset, 'leftcut')
			
			if (self.adCurOffset + curSegmentDuration <= self.adEndOffset and 
				self.adCurOffset + curSegmentDuration + nextSegmentDuration > self.adEndOffset):
				# create post ad ts
				videoKey = 'postAd-%s-%s' % (liveStreamUrlHash, self.cuePointId)
				if not videoExistsInMemcache(memcache, videoKey):
					cutTsFiles(videoKey, buffer, self.adEndOffset - self.adCurOffset, 'rightcut')

			if self.adCurOffset > self.adEndOffset:
				outputEnd = 0		# last segment
			else:
				outputEnd = self.adCurOffset + curSegmentDuration
			
			stitchSegmentParams = {
				'streamHash': liveStreamUrlHash,
				'encodingParamsId': encodingParamsId,
				'cuePointId': self.cuePointId,
				'segmentIndex': seg1 - self.adStartSegment,
				'outputStart': self.adCurOffset,
				'outputEnd': outputEnd,
				'entryId': entryId
				}
			segment1['URL'] = '%s?%s' % (adSegmentRedirectUrl, urllib.urlencode(stitchSegmentParams))
			writeOutput('translating %s to %s' % (url1, repr(segment1)))
			self.urlTranslations[url1] = (self.cuePointId, segment1)
			newResult.append(segment1)
			usedCuePoints.add(self.cuePointId)

			if self.adCurOffset > self.adEndOffset:
				self.inAdSlot = False
				writeOutput('ad ended - cuePoint=%s, adCurOffset=%s, adEndOffset=%s' % (self.cuePointId, self.adCurOffset, self.adEndOffset))
			else:
				self.adCurOffset += curSegmentDuration

		# remove unused ad positions from memcache
		requiredAdPositions = filter(lambda x: x['startSegmentId'] >= segments[0]['SEQ'] or str(x['cuePointId']) in usedCuePoints, adPositions)
		if len(requiredAdPositions) < len(adPositions):
			currentCuePoints = set(map(operator.itemgetter('cuePointId'), adPositions))
			requiredCuePoints = set(map(operator.itemgetter('cuePointId'), requiredAdPositions))
			writeOutput('Removing unneeded cue points %s' % ','.join(currentCuePoints - requiredCuePoints))
			requiredAdPositions = json.dumps(requiredAdPositions)
			memcache.cas(adPositionsKey, requiredAdPositions)
			
		# XXXX remove unused urlTranslations
		
		if DISABLE_DVR:
			newResult = newResult[-3:]
			header['EXT-X-MEDIA-SEQUENCE'] = str(newResult[0]['SEQ'])
		
		# build the final manifest
		return buildM3U8(header, newResult, footer)
	
sessionId = random.getrandbits(32)
lastTimestamp = time.time()

# parse the command line
if len(sys.argv) != 2:
	writeOutput("Usage:\n\tstreamTracker.py <json params>")
	sys.exit(1)

writeOutput('Started %s' % sys.argv[1])

# parse the json params
try:
	params = json.loads(base64.b64decode(sys.argv[1]))
except (ValueError, TypeError):
	writeOutput("Failed to decode params")
	sys.exit(1)

writeOutput('Params %s' % repr(params))

liveStreamUrl = str(params['url'])
outputMemcacheKey = str(params['trackerOutputKey'])
trackerRequiredKey = str(params['trackerRequiredKey'])
adPositionsKey = str(params['adPositionsKey'])
lastUsedSegmentKey = str(params['lastUsedSegmentKey'])
ffmpegParamsKey = str(params['ffmpegParamsKey'])
adSegmentRedirectUrl = str(params['adSegmentRedirectUrl'])
entryId = str(params['entryId'])

liveStreamUrlHash = md5(liveStreamUrl)

# create required folders
tempDownloadPath = os.path.join(tempfile.gettempdir(), 'downloadedTS')
try:
	os.mkdir(tempDownloadPath)
except OSError:
	pass

# connect to memcache
memcache = memcache.Client(['%s:%s' % (MEMCACHE_HOST, MEMCACHE_PORT)], cache_cas=True)

# get the M3U8
streamData = urllib.urlopen(liveStreamUrl).read()
(header, segments, footer) = parseM3U8(liveStreamUrl, streamData)
if segments == None or len(segments) == 0:
	writeOutput('failed to get any TS segments')
	sys.exit(1)
	
# get the encoding params
lastSegmentPath = getUrl(segments[-1]['URL'], '.ts')
tsEncodingParams, blackTSEncodingParams = ffmpegTSParams.getMpegTSEncodingParams(lastSegmentPath)
if tsEncodingParams == None:
	writeOutput('failed to get the media info of the last segment')
	sys.exit(1)

encodingParamsId = md5(tsEncodingParams)
writeOutput('Encoding params id=%s: %s' % (encodingParamsId, tsEncodingParams))
memcache.append(ffmpegParamsKey, '%s\n' % tsEncodingParams, RESULT_MANIFEST_EXPIRY)

# generate black video if needed
blackVideoKey = 'black-%s' % encodingParamsId
if not videoExistsInMemcache(memcache, blackVideoKey):
	# TODO: implement the video metadata extraction natively (required for ad & black)
	tempFileName = os.path.join(tempDownloadPath, blackVideoKey + '.ts')
	cmdLine = ' '.join([FFMPEG_PATH, blackTSEncodingParams, ' -y %s' % tempFileName])
	executeCommand(cmdLine)
	cmdLine = ' '.join(map(lambda x: str(x), [TS_PREPARER_PATH, MEMCACHE_HOST, MEMCACHE_PORT, 0, blackVideoKey, FFMPEG_PATH, FFPROBE_PATH, 'nocut', tempFileName]))
	executeCommand(cmdLine)
	

# main loop
manifestStitcher = ManifestStitcher()
startTime = time.time()
while time.time() < startTime + MINIMUM_RUN_PERIOD or memcache.get(trackerRequiredKey):
	cycleStartTime = time.time()
	# build stitched manifest
	manifest = manifestStitcher.getUpdatedManifest(liveStreamUrl, adPositionsKey)
	# update the last used segment in memcache
	if manifestStitcher.lastUsedSegment != None:
		# Note: there is a race here between the get & set, but it shouldn't be a problem since trackers
		#		working on the same entry will more or less synchronized, if they aren't it's a problem anyway...
		savedLastUsedSegment = memcache.get(lastUsedSegmentKey)
		if savedLastUsedSegment == None or manifestStitcher.lastUsedSegment > int(savedLastUsedSegment):
			writeOutput('setting last used segment to %s' % manifestStitcher.lastUsedSegment);
			memcache.set(lastUsedSegmentKey, str(manifestStitcher.lastUsedSegment), RESULT_MANIFEST_EXPIRY)
		
	# save the result to memcache
	memcache.set(outputMemcacheKey, manifest, RESULT_MANIFEST_EXPIRY)
	memcache.touch(ffmpegParamsKey, RESULT_MANIFEST_EXPIRY)
	
	# sleep until next cycle
	curTime = time.time()
	sleepTime = cycleStartTime + CYCLE_INTERVAL - curTime
	if sleepTime > 0:
		time.sleep(sleepTime)

writeOutput('Quitting...')
