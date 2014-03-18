import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '../../tracker'))

from mpegTsDefs import *
import videoMemcache
import subprocess
import operator
import tempfile
import commands
import urllib2
import time
import re

FFPROBE_PATH = '/web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh'

def writeOutput(msg):
	sys.stdout.write('[%s] %s\n' % (uniqueId, msg))
	sys.stdout.flush()

def getUrlData(url, requestHeaders={}):
	request = urllib2.Request(url, headers=requestHeaders)
	f = urllib2.urlopen(request)
	cookies = []
	for curHeader in f.info().headers:
		splittedHeader = curHeader.split(':', 1)
		if splittedHeader[0].strip().lower() == 'set-cookie':
			cookies.append(splittedHeader[1].strip())
	return (cookies, f.read())

ALLOWED_TIMESTAMP_DIFF = 6006		# 2 frames

class TsValidator:
	def __init__(self):
		self.nextTimestamps = {'video':{}, 'audio':{}}
		self.continuityCounters = {}
		self.lastCheckedTs = None
		
	def processSegment(self, tsData):
		fi, tsFilePath = tempfile.mkstemp()
		f = os.fdopen(fi, "w")
		f.write(tsData)
		f.close()
		frames = videoMemcache.getTSFrames(tsFilePath)
		os.remove(tsFilePath)
		
		# validate timestamps
		okTimestamps = 0
		for frame in frames:
			curPacket = tsData[frame['pos']:(frame['pos'] + TS_PACKET_LENGTH)]			
			expectedTimestamps = self.nextTimestamps[frame['codec_type']]
			packetTimestamps = videoMemcache.getTimestamps(curPacket)
			for timestampType, timestampValue in packetTimestamps.items():
				if expectedTimestamps.has_key(timestampType):
					if abs(expectedTimestamps[timestampType] - timestampValue) > ALLOWED_TIMESTAMP_DIFF:
						writeOutput('Error: codec=%s pos=%s timestamp-type=%s value=%s expected=%s (%s)' % 
							(frame['codec_type'], frame['pos'], timestampType, timestampValue, 
							expectedTimestamps[timestampType], expectedTimestamps[timestampType] - timestampValue))
					else:
						okTimestamps += 1

			expectedTimestamps.update(packetTimestamps)
			for timestampType in expectedTimestamps:
				expectedTimestamps[timestampType] += frame['duration']
				expectedTimestamps[timestampType] &= ((1 << 33) - 1)

		# validate continuity counters
		if self.continuityCounters.has_key(0):
			self.continuityCounters = {0: self.continuityCounters[0]}
		self.continuityCounters[256] = 15
		self.continuityCounters[257] = 15
		
		okCounters = 0
		curPos = 0
		while curPos < len(tsData):
			packetHeader = mpegTsHeader.parse(tsData[curPos:(curPos + TS_PACKET_LENGTH)])
			if self.continuityCounters.has_key(packetHeader.PID):
				lastValue = self.continuityCounters[packetHeader.PID]
				expectedValue = (lastValue + 1) % 16
				if packetHeader.continuityCounter != expectedValue:
					writeOutput('Error: bad continuity counter - pos=%s pid=%d exp=%s actual=%s' % 
						(curPos, packetHeader.PID, expectedValue, packetHeader.continuityCounter))
				else:
					okCounters += 1
			self.continuityCounters[packetHeader.PID] = packetHeader.continuityCounter			
			curPos += TS_PACKET_LENGTH
			
		writeOutput('Done, okTimestamps %s okCounters %s' % (okTimestamps, okCounters))

	def processFlavorManifest(self, curManifest, requestHeaders):
		tsUrls = filter(lambda x: len(x) > 0 and not x.startswith('#'), curManifest.split('\n'))
		if self.lastCheckedTs == None:
			tsSegmentsToValidate = tsUrls[-1:]
		else:
			try:
				lastCheckedIndex = tsUrls.index(self.lastCheckedTs)
				tsSegmentsToValidate = tsUrls[(lastCheckedIndex + 1):]
			except ValueError:
				writeOutput('Error: failed to location the last checked TS in the flavor manifest')
				tsSegmentsToValidate = tsUrls[-1:]
		
		for tsSegmentToValidate in tsSegmentsToValidate:
			writeOutput('validating %s' % tsSegmentToValidate)
			_, tsData = getUrlData(tsSegmentToValidate, requestHeaders)
			self.processSegment(tsData)
			self.lastCheckedTs = tsSegmentToValidate

def processMasterManifest(curManifest):
	childProcesses = []
	m3u8Urls = filter(lambda x: len(x) > 0 and not x.startswith('#'), curManifest.split('\n'))
	for m3u8Url in m3u8Urls:
		cmdLine = ['python', sys.argv[0], m3u8Url]
		writeOutput('spawning %s' % cmdLine)
		childProcesses.append(subprocess.Popen(cmdLine))
	if len(childProcesses) == 0:
		return
	try:
		while True:
			time.sleep(3600)
	except KeyboardInterrupt:
		writeOutput('killing all child processes')
		for childProcess in childProcesses:
			childProcess.kill()

if len(sys.argv) < 2:
	print 'Usage: %s <stream url>' % os.path.basename(sys.argv[0])
	sys.exit(1)

streamUrl = sys.argv[1]
uniqueId = os.getpid()
writeOutput('watching %s' % streamUrl)
			
requestHeaders = {}
cookies, curManifest = getUrlData(streamUrl, requestHeaders)
requestHeaders = {'Cookie': '; '.join(cookies)}

if '#EXT-X-STREAM-INF:' in curManifest:		# master manifest
	processMasterManifest(curManifest)
	sys.exit(1)
			
tsValidator = TsValidator()
try:
	while True:		
		tsValidator.processFlavorManifest(curManifest, requestHeaders)
		time.sleep(1)
		cookies, curManifest = getUrlData(streamUrl, requestHeaders)
		requestHeaders = {'Cookie': '; '.join(cookies)}
except KeyboardInterrupt:
	pass
