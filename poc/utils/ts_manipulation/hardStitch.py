'''
/web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh -t 10 -s 640x360 -f rawvideo -pix_fmt rgb24 -r 29.97 -i /dev/zero -ar 48000 -t 10 -f s16le -acodec pcm_s16le -ac 2 -i /dev/zero -vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0 -coder 1 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0:force-cfr -vprofile main -level 3.1 -pix_fmt yuv420p -threads 4 -b:v 537k -vf scale="iw*min(640/iw\,360/ih):ih*min(640/iw\,360/ih),pad=640:360:(640-iw)/2:(360-ih)/2" -r 29.97 -refs 3 -acodec libfdk_aac -ar 48000 -ac 2 -bsf h264_mp4toannexb -f mpegts -y /tmp/black.ts


ffmpeg -t 60 -s qcif -f rawvideo -pix_fmt rgb24 -r 25 -i /dev/zero silence.mpeg
ffmpeg -t 10 -s 640x480 -f rawvideo -pix_fmt rgb24 -r 25 -i /dev/zero -bsf h264_mp4toannexb -f mpegts 


/web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh -i /web/content/r70v1/entry/data/47/783/1_zgcm79yf_0_9wmosyf3_1.mp4 -vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0 -coder 1 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0:force-cfr -vprofile main -level 3.1 -pix_fmt yuv420p -threads 4 -b:v 537k -vf scale="iw*min(640/iw\,360/ih):ih*min(640/iw\,360/ih),pad=640:360:(640-iw)/2:(360-ih)/2" -r 29.97 -refs 3 -acodec libfdk_aac -ar 48000 -ac 2 -bsf h264_mp4toannexb -f mpegts -y /tmp/alignVideo.ts


/web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh 
	-t 10 -s 640x360 -f rawvideo -pix_fmt rgb24 -r 29.97 -i /dev/zero 
	-t 10 -ar 48000 -ac 2 -f s16le -acodec pcm_s16le -i /dev/zero 
	-vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0 -coder 1 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0:force-cfr -vprofile main -level 3.1 -pix_fmt yuv420p -threads 4 -b:v 537k -vf scale="iw*min(640/iw\,360/ih):ih*min(640/iw\,360/ih),pad=640:360:(640-iw)/2:(360-ih)/2" -r 29.97 -refs 3 
	-acodec libfdk_aac -ar 48000 -ac 2 
	-bsf h264_mp4toannexb -f mpegts -y /tmp/black.ts


http://abclive.abcnews.com/i/abc_live4@136330/index_500_av-p.m3u8?sd=10&rebase=on

====================

<enter ad> <ad p1> | <ad p2> | <ad p3> <black> <leave ad>

	
'''

from mpegTsDefs import *
import operator
import commands
import time
import sys
import re
import os

FFPROBE_BIN = '/web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh'

def readFile(fileName, maxSize = -1, seekPos = None):
	f = file(fileName, 'rb')
	if seekPos != None:
		f.seek(seekPos)
	result = bytearray(os.path.getsize(fileName))
	f.readinto(result)
	f.close()
	return result

# prepare functions
def parseValue(val):
	if re.match('^\d+$', val):
		return int(val)
	if re.match('^\d+\.\d+$', val):
		return float(val)
	return val

def filterRequiredFrameProps(frame):
	return dict(filter(lambda (x,y): x in ['codec_type', 'pos', 'size', 'duration'], frame.items()))
	
def getTSDetails(inputFileName, needsTimestamps):
	# get the frames using ffprobe
	cmdLine = '%s -show_packets -i %s 2> /dev/null' % (FFPROBE_BIN, inputFileName)
	output = commands.getoutput(cmdLine)
	frames = []
	for curLine in output.split('\n'):
		curLine = curLine.strip()
		if curLine == '[PACKET]':
			curFrame = {}
		elif curLine == '[/PACKET]':
			if curFrame['pos'] == 'N/A':
				frames[-1]['duration'] += curFrame['duration']
				#frames[-1]['duration_time'] += curFrame['duration_time']
				#frames[-1]['size'] += curFrame['size']
			else:
				frames.append(curFrame)
		else:
			splittedLine = curLine.split('=', 1)
			if len(splittedLine) == 2:
				curFrame[splittedLine[0]] = parseValue(splittedLine[1])
	
	# order by position
	frames.sort(key=operator.itemgetter('pos'))
	
	# fix the frame size
	for i in xrange(len(frames)):
		if i + 1 < len(frames):
			frames[i]['size'] = frames[i + 1]['pos'] - frames[i]['pos']
		else:
			frames[i]['size'] = os.path.getsize(inputFileName) - frames[i]['pos']
		
	# leave only the details we need
	frames = map(filterRequiredFrameProps, frames)
	
	# get timestamps
	timestamps = None
	if needsTimestamps:
		inputData = readFile(inputFileName)
		timestamps = getInitialTimestamps(inputData, frames)
	
	return (frames[0]['pos'], frames, timestamps)

def getTimestamps(curPacket):
	result = {}
	packetHeader = mpegTsHeader.parse(curPacket)
	curPos = mpegTsHeader.sizeof()
	adaptationField = None
	if packetHeader.adaptationFieldExist:
		adaptationField = mpegTsAdaptationField.parse(curPacket[curPos:])
		adaptationFieldDataPos = curPos + mpegTsAdaptationField.sizeof()
		curPos += 2
		if (adaptationField.pcrFlag and 
			adaptationField.adaptationFieldLength >= mpegTsAdaptationField.sizeof() + pcr.sizeof() - 1):
			thePcr = pcr.parse(curPacket[adaptationFieldDataPos:])
			result['pcr'] = thePcr.pcr90kHz
		curPos += adaptationField.adaptationFieldLength - 1
	if (curPacket[curPos:].startswith(PES_MARKER) and 
		len(curPacket) >= curPos + 6 + pesOptionalHeader.sizeof()):
		thePesHeader = pesHeader.parse(curPacket[curPos:])
		curPos += 6 # pesHeader.sizeof()
		thePesOptHeader = pesOptionalHeader.parse(curPacket[curPos:])
		curPos += pesOptionalHeader.sizeof()
		if thePesOptHeader.ptsFlag:
			ptsStruct = pts.parse(curPacket[curPos:])
			result['pts'] = getPts(ptsStruct)
			curPos += pts.sizeof()
			if thePesOptHeader.dtsFlag:
				ptsStruct = pts.parse(curPacket[curPos:])
				result['dts'] = getPts(ptsStruct)
				curPos += pts.sizeof()
	return result
	
def getInitialTimestamps(fileData, frames):
	result = {'video':{}, 'audio':{}}
	duration = {'video':0, 'audio':0}
	for curFrame in frames:
		curPacket = fileData[curFrame['pos']:(curFrame['pos'] + 188)]
		codecType = curFrame['codec_type']
		result[codecType].update(incrementTimestamps(getTimestamps(curPacket), -duration[codecType]))
		duration[codecType] += curFrame['duration']
	for curTimestamps in result.values():
		if curTimestamps.has_key('pts') and not curTimestamps.has_key('dts'):
			curTimestamps['dts'] = curTimestamps['pts']
	return result

# stitching functions
def replaceBuffer(buffer, repl, pos):
	buffer[pos:(pos + len(repl))] = repl

def setTimestamps(curPacket, timestamps):
	packetHeader = mpegTsHeader.parse(curPacket)
	curPos = mpegTsHeader.sizeof()
	adaptationField = None
	if packetHeader.adaptationFieldExist:
		adaptationField = mpegTsAdaptationField.parse(curPacket[curPos:])
		adaptationFieldDataPos = curPos + mpegTsAdaptationField.sizeof()
		if (adaptationField.pcrFlag and 
			adaptationField.adaptationFieldLength >= mpegTsAdaptationField.sizeof() + pcr.sizeof() - 1):
			thePcr = pcr.parse(curPacket[adaptationFieldDataPos:])
			thePcr.pcr90kHz = timestamps['pcr']
			replaceBuffer(curPacket, pcr.build(thePcr), adaptationFieldDataPos)
		curPos += adaptationField.adaptationFieldLength + 1
	if (curPacket[curPos:].startswith(PES_MARKER) and 
		len(curPacket) >= curPos + 6 + pesOptionalHeader.sizeof()):
		thePesHeader = pesHeader.parse(curPacket[curPos:])
		curPos += 6 # pesHeader.sizeof()
		thePesOptHeader = pesOptionalHeader.parse(curPacket[curPos:])
		curPos += pesOptionalHeader.sizeof()
		if thePesOptHeader.ptsFlag:
			ptsStruct = pts.parse(curPacket[curPos:])
			setPts(ptsStruct, timestamps['pts'])
			replaceBuffer(curPacket, pts.build(ptsStruct), curPos)
			curPos += pts.sizeof()
			if thePesOptHeader.dtsFlag:
				ptsStruct = pts.parse(curPacket[curPos:])
				setPts(ptsStruct, timestamps['dts'])
				replaceBuffer(curPacket, pts.build(ptsStruct), curPos)
				curPos += pts.sizeof()
	return curPacket

def incrementTimestamps(timestamps, offset):
	return dict(map(lambda (x, y): (x, y + offset), timestamps.items()))

'''
inputs:
	for preAd, ad, pad, postAd:
		string TS file name
		int TS header size
		frames		struct frame - (int pos, int size, int duration, audio/video) ordered by position
		int64 initial video timestamps (PCR, PTS, DTS)
		int64 initial audio timestamps (PCR, PTS, DTS)
	int lastSegmentIndex - sequence number of postAd end - sequence number of preAd start
	int segmentDuration		(90 KHz)
'''

STATE_PRE_AD = 	0
STATE_AD = 		1
STATE_PAD = 	2
STATE_POST_AD = 3

# inputs
preAdTS = 'pre-ad.ts'
adTS = 'alignVideo.ts'
padTS = 'black.ts'
postAdTS = 'post-ad.ts'

lastSegmentIndex = 2
segmentDuration = 10 * 90000

segmentToOutput = int(sys.argv[1])

# XXXXX should be received as parameter - calculate after the TS is generated
startTime = time.time()
preAdTSHeaderSize, preAdTSFrames, preAdTimestamps = 	getTSDetails(preAdTS, True)
adTSHeaderSize, adTSFrames, _ = 						getTSDetails(adTS, False)
padTSHeaderSize, padTSFrames, _ = 						getTSDetails(padTS, False)
postAdTSHeaderSize, postAdTSFrames, postAdTimestamps = 	getTSDetails(postAdTS, True)
print 'prep took %s' % (time.time() - startTime)

startTime = time.time()

# prepare the header sizes
tsHeaderSize = {
	preAdTS: preAdTSHeaderSize,
	adTS: adTSHeaderSize,
	padTS: padTSHeaderSize,
	postAdTS: postAdTSHeaderSize,
}

videoAdSlotEndPos = (postAdTimestamps['video']['pts'] - preAdTimestamps['video']['pts']) & ((1 << 33) - 1)
audioAdSlotEndPos = (postAdTimestamps['audio']['pts'] - preAdTimestamps['audio']['pts']) & ((1 << 33) - 1)

# init state
curState = STATE_PRE_AD
curPos = {'video': 0, 'audio': 0}
frameIndex = 0
segmentIndex = 0
outputFrames = (segmentIndex == segmentToOutput)
timestamps = {'video': preAdTimestamps['video'], 'audio': preAdTimestamps['audio']}
wroteHeader = False

print timestamps

outputLayout = []

while True:	
	# update segmentIndex
	if segmentIndex < lastSegmentIndex and curPos['video'] > (segmentIndex + 1) * segmentDuration:
		segmentIndex += 1
		if segmentIndex > segmentToOutput:
			break
		outputFrames = (segmentIndex == segmentToOutput)

	# find next frame
	frameFile = None
	if curState == STATE_PRE_AD:
		if frameIndex < len(preAdTSFrames):
			nextFrame = preAdTSFrames[frameIndex]
			frameFile = preAdTS
		else:
			curState += 1
			frameIndex = 0
			
	if curState == STATE_AD:
		tryVideo = True
		tryAudio = True
		while frameIndex < len(adTSFrames) and (tryVideo or tryAudio):
			nextFrame = adTSFrames[frameIndex]
			if tryVideo and nextFrame['codec_type'] == 'video':
				if curPos['video'] + nextFrame['duration'] <= videoAdSlotEndPos:
					frameFile = adTS
					break
				tryVideo = False
			elif tryAudio and nextFrame['codec_type'] == 'audio':
				if curPos['audio'] + nextFrame['duration'] <= audioAdSlotEndPos:
					frameFile = adTS
					break
				tryAudio = False
			frameIndex += 1
		if frameFile == None:
			curState += 1
			frameIndex = 0
			
	if curState == STATE_PAD:
		tryVideo = True
		tryAudio = True
		while tryVideo or tryAudio:
			frameIndex = frameIndex % len(padTSFrames)
			nextFrame = padTSFrames[frameIndex]
			if tryVideo and nextFrame['codec_type'] == 'video':
				if curPos['video'] + nextFrame['duration'] <= videoAdSlotEndPos:
					frameFile = padTS
					break
				tryVideo = False
			elif tryAudio and nextFrame['codec_type'] == 'audio':
				if curPos['audio'] + nextFrame['duration'] <= audioAdSlotEndPos:
					frameFile = padTS
					break
				tryAudio = False
			frameIndex += 1
		if frameFile == None:
			curState += 1
			frameIndex = 0
			
	if curState == STATE_POST_AD:
		if frameIndex < len(postAdTSFrames):
			nextFrame = postAdTSFrames[frameIndex]
			frameFile = postAdTS
	
	# choose a frame to output
	if frameFile == None:
		break
		
	codecType = nextFrame['codec_type']
		
	if outputFrames:
		# output the ts header
		if not wroteHeader:
			outputLayout.append((frameFile, 0, tsHeaderSize[frameFile], None))
			wroteHeader = True
	
		# output the packet
		outputLayout.append((frameFile, nextFrame['pos'], nextFrame['size'], timestamps[codecType]))
		
	# update timestamps, pos and frame index
	timestamps[codecType] = incrementTimestamps(timestamps[codecType], nextFrame['duration'])
	curPos[codecType] += nextFrame['duration']
	frameIndex += 1

neededBuffers = {}
for fileName, pos, size, timestamps in outputLayout:
	neededBuffers.setdefault(fileName, [pos, pos + size])
	neededBuffers[fileName][0] = min(neededBuffers[fileName][0], pos)
	neededBuffers[fileName][1] = max(neededBuffers[fileName][1], pos + size)

print 'build layout took %s' % (time.time() - startTime)

startTime = time.time()

buffers = {}
for fileName, (startPos, endPos) in neededBuffers.items():
	buffers[fileName] = (startPos, readFile(fileName, endPos - startPos, startPos))

print 'read files took %s' % (time.time() - startTime)

startTime = time.time()

# init output file
outputFileName = 'res-%s.ts' % segmentToOutput
outputFile = file(outputFileName, 'wb')

for fileName, pos, size, timestamps in outputLayout:
	bufferOffset, fileBuffer = buffers[fileName]
	packet = fileBuffer[(pos - bufferOffset):(pos + size - bufferOffset)]
	if timestamps != None:
		packet = setTimestamps(packet, timestamps)
	# XXX TODO fix TS continuity counters
	outputFile.write(packet)	

# close output file
outputFile.close()

print 'output took %s' % (time.time() - startTime)
