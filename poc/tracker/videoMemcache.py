from construct import *
from mpegTsDefs import *
import operator
import commands
import re
import os

FFPROBE_PATH = '/web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh'
FILE_CHUNK_SIZE = 2500 * TS_PACKET_LENGTH			# use a round number of TS packets
NO_OFFSET = 0xff
	
class EmptyClass:
	pass

MetadataHeader = Struct("MetadataHeader",
	ULInt32("tsHeaderSize"),
	ULInt32("tsFileSize"),
	ULInt32("chunkCount"),
	ULInt32("frameCount"),
	ULInt32("hasVideo"),
	ULInt32("hasAudio"),
	Struct("videoTimestamps",
		SLInt64("PCR"),
		SLInt64("PTS"),
		SLInt64("DTS"),
	),
	Struct("audioTimestamps",
		SLInt64("PCR"),
		SLInt64("PTS"),
		SLInt64("DTS"),
	),
)

FrameInfo = Struct("FrameInfo",
	ULInt32("pos"),
	ULInt32("size"),
	ULInt32("duration"),
	ULInt8("isVideo"),
	ULInt8("pcrOffset"),
	ULInt8("ptsOffset"),
	ULInt8("dtsOffset"),
)

def readFile(fileName):
	f = file(fileName, 'rb')
	result = f.read()
	f.close()
	return result

def parseValue(val):
	if re.match('^\d+$', val):
		return int(val)
	if re.match('^\d+\.\d+$', val):
		return float(val)
	return val

def filterRequiredFrameProps(frame):
	return dict(filter(lambda (x,y): x in ['codec_type', 'pos', 'size', 'duration'], frame.items()))

def incrementTimestamps(timestamps, offset):
	return dict(map(lambda (x, y): (x, y + offset), timestamps.items()))

def getTimestampOffsets(curPacket):
	pcrOffset = NO_OFFSET
	ptsOffset = NO_OFFSET
	dtsOffset = NO_OFFSET
	
	packetHeader = mpegTsHeader.parse(curPacket)
	curPos = mpegTsHeader.sizeof()
	adaptationField = None
	if packetHeader.adaptationFieldExist:
		adaptationField = mpegTsAdaptationField.parse(curPacket[curPos:])
		adaptationFieldDataPos = curPos + mpegTsAdaptationField.sizeof()
		curPos += 2
		if (adaptationField.pcrFlag and 
			adaptationField.adaptationFieldLength >= mpegTsAdaptationField.sizeof() + pcr.sizeof() - 1):
			pcrOffset = adaptationFieldDataPos
		curPos += adaptationField.adaptationFieldLength - 1
	if (curPacket[curPos:].startswith(PES_MARKER) and 
		len(curPacket) >= curPos + 6 + pesOptionalHeader.sizeof()):
		curPos += 6 # pesHeader.sizeof()
		thePesOptHeader = pesOptionalHeader.parse(curPacket[curPos:])
		curPos += pesOptionalHeader.sizeof()
		if thePesOptHeader.ptsFlag:
			ptsOffset = curPos
			curPos += pts.sizeof()
			if thePesOptHeader.dtsFlag:
				dtsOffset = curPos
	return (pcrOffset, ptsOffset, dtsOffset)

def getTimestamps(curPacket):
	result = {}
	(pcrOffset, ptsOffset, dtsOffset) = getTimestampOffsets(curPacket)
	if pcrOffset != NO_OFFSET:
		result['pcr'] = pcr.parse(curPacket[pcrOffset:]).pcr90kHz
	if ptsOffset != NO_OFFSET:
		result['pts'] = getPts(pts.parse(curPacket[ptsOffset:]))
	if dtsOffset != NO_OFFSET:
		result['dts'] = getPts(pts.parse(curPacket[dtsOffset:]))
	return result

def getInitialTimestamps(fileData, frames):
	result = {'video':{}, 'audio':{}}
	duration = {'video':0, 'audio':0}
	for curFrame in frames:
		curPacket = fileData[curFrame['pos']:(curFrame['pos'] + TS_PACKET_LENGTH)]
		codecType = curFrame['codec_type']
		result[codecType].update(incrementTimestamps(getTimestamps(curPacket), -duration[codecType]))
		duration[codecType] += curFrame['duration']
	for curTimestamps in result.values():
		if curTimestamps.has_key('pts') and not curTimestamps.has_key('dts'):
			curTimestamps['dts'] = curTimestamps['pts']
	return result

def getTSFrames(inputFileName):
	# get the frames using ffprobe
	cmdLine = '%s -show_packets -i %s 2> /dev/null' % (FFPROBE_PATH, inputFileName)
	output = commands.getoutput(cmdLine)
	frames = []
	for curLine in output.split('\n'):
		curLine = curLine.strip()
		if curLine == '[PACKET]':
			curFrame = {}
		elif curLine == '[/PACKET]':
			if curFrame['pos'] == 'N/A':
				frames[-1]['duration'] += curFrame['duration']
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
		
	return frames

def getVideoMetadata(inputFileName, fileData, perFrameTimestamps):
	frames = getTSFrames(inputFileName)
	
	header = EmptyClass()
	header.videoTimestamps = EmptyClass()
	header.audioTimestamps = EmptyClass()
	header.tsHeaderSize = frames[0]['pos']
	header.tsFileSize = os.path.getsize(inputFileName)
	header.chunkCount = (header.tsFileSize + FILE_CHUNK_SIZE - 1) / FILE_CHUNK_SIZE
	header.frameCount = len(frames)
	header.hasVideo = 0
	header.hasAudio = 0
	for frame in frames:
		if frame['codec_type'] == 'video':
			header.hasVideo = 1
		else:
			header.hasAudio = 1

	if perFrameTimestamps:
		header.videoTimestamps.PCR = -1
		header.videoTimestamps.PTS = -1
		header.videoTimestamps.DTS = -1
		header.audioTimestamps.PCR = -1
		header.audioTimestamps.PTS = -1
		header.audioTimestamps.DTS = -1
	else:
		timestamps = getInitialTimestamps(fileData, frames)
		header.videoTimestamps.PCR = timestamps['video'].get('pcr', -1)
		header.videoTimestamps.PTS = timestamps['video'].get('pts', -1)
		header.videoTimestamps.DTS = timestamps['video'].get('dts', -1)
		header.audioTimestamps.PCR = timestamps['audio'].get('pcr', -1)
		header.audioTimestamps.PTS = timestamps['audio'].get('pts', -1)
		header.audioTimestamps.DTS = timestamps['audio'].get('dts', -1)
	
	result = MetadataHeader.build(header)
	
	for frame in frames:
		curFrame = EmptyClass()
		curFrame.pos = frame['pos']
		curFrame.size = frame['size']
		curFrame.duration = frame['duration']
		curFrame.isVideo = (frame['codec_type'] == 'video')
		
		if perFrameTimestamps:
			curPacket = fileData[frame['pos']:(frame['pos'] + TS_PACKET_LENGTH)]
			(curFrame.pcrOffset, curFrame.ptsOffset, curFrame.dtsOffset) = getTimestampOffsets(curPacket)
		else:
			curFrame.pcrOffset = NO_OFFSET
			curFrame.ptsOffset = NO_OFFSET
			curFrame.dtsOffset = NO_OFFSET
		
		result += FrameInfo.build(curFrame)
		
	return (result, header.tsHeaderSize)
	
def videoExistsInMemcache(memcache, key):
	metadata = memcache.get('%s-metadata' % key)
	if metadata == None:
		return False
	header = MetadataHeader.parse(metadata)
	for curChunk in xrange(header.chunkCount):
		if not memcache.touch('%s-%s' % (key, curChunk)):
			return False
	return True

def addVideoToMemcache(memcache, key, inputFileName, perFrameTimestamps):
	fileData = readFile(inputFileName)

	(metadata, tsHeaderSize) = getVideoMetadata(inputFileName, fileData, perFrameTimestamps)
	memcache.set('%s-metadata' % key, metadata)	
	memcache.set('%s-header' % key, fileData[:tsHeaderSize])
	
	curPos = 0
	chunkIndex = 0
	while curPos < len(fileData):
		memcache.set('%s-%s' % (key, chunkIndex), fileData[curPos:curPos + FILE_CHUNK_SIZE])
		curPos += FILE_CHUNK_SIZE
		chunkIndex += 1
