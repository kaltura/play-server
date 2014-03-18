from mpegTsDefs import *
import subprocess
import commands
import sys
import os

FFPROBE_BIN = '/web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh'			# LINUX
DEV_NULL = '/dev/null'															# LINUX
#FFPROBE_BIN = r'c:\temp\ffprobe.exe'											# WINDOWS
#DEV_NULL = 'NUL'																# WINDOWS

ET_PCR = 1
ET_PTS = 2
ET_DTS = 3

class getPacketDurations:
	@staticmethod
	def getMap(inputFileName):
		inst = getPacketDurations(inputFileName)
		return inst.result

	def __init__(self, inputFileName):
		self.result = {}
		walkFrames(inputFileName, self.callback)
		
	def callback(self, curFrame):
		if (curFrame.has_key('pkt_pos') and curFrame['pkt_pos'] != 'N/A' and 
			curFrame.has_key('pkt_duration')):
			self.result[int(curFrame['pkt_pos'])] = int(curFrame['pkt_duration'])

def walkFrames(inputFileName, callback):
	cmdLine = '%s -show_frames -i %s 2> %s' % (FFPROBE_BIN, inputFileName, DEV_NULL)
	output = commands.getoutput(cmdLine)								# LINUX
	#output = subprocess.check_output(cmdLine, shell=True)				# WINDOWS
	for curLine in output.split('\n'):
		curLine = curLine.strip()
		if curLine == '[FRAME]':
			curFrame = {}
		elif curLine == '[/FRAME]':
			callback(curFrame)
		else:
			splittedLine = curLine.split('=', 1)
			if len(splittedLine) == 2:
				curFrame[splittedLine[0]] = splittedLine[1]

def getTSTimestamps(inputFilename):
	inputFile = file(inputFilename, 'rb')
	elementaryStreamIds = []
	programPID = None
	pcrPID = None
	index = 0
	filePos = 0
	result = []
	while True:
		index += 1
		curPacket = inputFile.read(TS_PACKET_LENGTH)
		if len(curPacket) < TS_PACKET_LENGTH:
			break
		packetHeader = mpegTsHeader.parse(curPacket)
		curPos = mpegTsHeader.sizeof()
		adaptationField = None
		if packetHeader.adaptationFieldExist:
			adaptationField = mpegTsAdaptationField.parse(curPacket[curPos:])
			adaptationFieldDataPos = curPos + mpegTsAdaptationField.sizeof()
			curPos += 1 + adaptationField.adaptationFieldLength
		if packetHeader.PID == PAT_PID:
			thePat = pat.parse(curPacket[curPos:])
			curPos += pat.sizeof()
			entryCount = (thePat.sectionLength - 9) / patEntry.sizeof()
			for i in range(entryCount):
				curEntry = patEntry.parse(curPacket[curPos:])
				curPos += patEntry.sizeof()
				if curEntry.programNumber == 1:
					programPID = curEntry.programPID
		elif packetHeader.PID == programPID:
			thePmt = pmt.parse(curPacket[curPos:])
			curPos += pmt.sizeof()
			curPos += thePmt.programInfoLength
			#entryCount = (thePmt.sectionLength - 13) / pmtEntry.sizeof()
			endPos = curPos + thePmt.sectionLength - 13
			pcrPID = thePmt.pcrPID
			elementaryStreamIds = []
			#for i in range(entryCount):		# XXX TODO: not all records have to be pmtEntry in size, use esInfoLength to get extra data size
			while curPos < endPos:
				curEntry = pmtEntry.parse(curPacket[curPos:])
				curPos += pmtEntry.sizeof() + curEntry.esInfoLength
				elementaryStreamIds.append(curEntry.elementaryPID)
		else:
			if (packetHeader.PID == pcrPID and packetHeader.adaptationFieldExist and adaptationField.pcrFlag and 
				adaptationField.adaptationFieldLength >= mpegTsAdaptationField.sizeof() + pcr.sizeof() - 1):
				thePcr = pcr.parse(curPacket[adaptationFieldDataPos:])
				result.append((ET_PCR, None, thePcr.pcr90kHz, thePcr, filePos + adaptationFieldDataPos))
			
			if packetHeader.PID in elementaryStreamIds:
				if curPacket[curPos:].startswith(PES_MARKER) and \
					len(curPacket) >= curPos + 6 + pesOptionalHeader.sizeof():
					thePesHeader = pesHeader.parse(curPacket[curPos:])
					curPos += 6 # pesHeader.sizeof()
					thePesOptHeader = pesOptionalHeader.parse(curPacket[curPos:])
					curPos += pesOptionalHeader.sizeof()
					if thePesOptHeader.ptsFlag:
						ptsStruct = pts.parse(curPacket[curPos:])
						result.append((ET_PTS, thePesHeader.streamId, getPts(ptsStruct), ptsStruct, filePos + curPos))
						curPos += pts.sizeof()
						if thePesOptHeader.dtsFlag:
							ptsStruct = pts.parse(curPacket[curPos:])
							result.append((ET_DTS, thePesHeader.streamId, getPts(ptsStruct), ptsStruct, filePos + curPos))
							curPos += pts.sizeof()
		filePos += len(curPacket)
	return result

def classifyEvent(event):
	streamType = 'n'
	if event[1] >= MIN_VIDEO_STREAM_ID and event[1] <= MAX_VIDEO_STREAM_ID:
		streamType = 'v'
	elif event[1] >= MIN_AUDIO_STREAM_ID and event[1] <= MAX_AUDIO_STREAM_ID:
		streamType = 'a'
	return (event[0], streamType)
	
def getMinMaxTimestamps(timestamps, durations):
	groupedTimestamps = {}
	dtsOffset = 0
	for event in timestamps:	
		group = classifyEvent(event)
		curTimestamp = event[2]
		
		if event[0] == ET_DTS:
			dtsOffset = curTimestamp - lastTimestamp
			continue
		
		if durations == None:
			# take the start of the first timestamp
			groupedTimestamps.setdefault(group, curTimestamp)
		else:
			# take the end of the last timestamp
			packetPos = (event[-1] / TS_PACKET_LENGTH) * TS_PACKET_LENGTH
			groupedTimestamps[group] = (curTimestamp, packetPos)
		lastTimestamp = curTimestamp

	if durations != None:
		for group, (curTimestamp, packetPos) in groupedTimestamps.items():
			groupedTimestamps[group] = curTimestamp + durations[packetPos]
			
	return (groupedTimestamps, dtsOffset)
	
def seekAndWrite(fileHandle, offset, buffer):
	fileHandle.seek(offset, os.SEEK_SET)
	fileHandle.write(buffer)
	
def shiftTimestamps(outputFilename, timestamps, offsets, dtsOffset):
	#global lastPts
	
	outputFile = file(outputFilename, 'rb+')
	for eventType, streamId, value, struct, offset in timestamps:
		if eventType == ET_DTS:
			setPts(struct, lastPts + dtsOffset) #value + timeOffset)
			seekAndWrite(outputFile, offset, pts.build(struct))
			continue

		group = classifyEvent((eventType, streamId))
		if not offsets.has_key(group):
			continue
		timeOffset = offsets[group]
		#if streamId >= MIN_VIDEO_STREAM_ID and streamId < MAX_VIDEO_STREAM_ID:
		#	timeOffset = timeOffsetVideo
		#elif streamId >= MIN_AUDIO_STREAM_ID and streamId < MAX_AUDIO_STREAM_ID:
		#	timeOffset = timeOffsetAudio
		#else:
		#	continue
		if eventType == ET_PCR:
			struct.pcr90kHz += timeOffset
			seekAndWrite(outputFile, offset, pcr.build(struct))
		elif eventType == ET_PTS:
			lastPts = value + timeOffset
			setPts(struct, lastPts)
			seekAndWrite(outputFile, offset, pts.build(struct))
			#seekAndWrite(outputFile, offset, lastPts)	# force dts=pts
	outputFile.close()
		
targetFilename, refFilename, alignType = sys.argv[1:]

if alignType not in ['left', 'right']:
	print 'Invalid alignment type %s' % alignType
	sys.exit(1)	

refTimestamps = getTSTimestamps(refFilename)
targetTimestamps = getTSTimestamps(targetFilename)

refDurations = None
targetDurations = None
if alignType == 'right':
	refDurations = getPacketDurations.getMap(refFilename)
	targetDurations = getPacketDurations.getMap(targetFilename)

(refTimestampsMinMax, dtsOffset) = getMinMaxTimestamps(refTimestamps, refDurations)
(targetTimestampsMinMax, _) = getMinMaxTimestamps(targetTimestamps, targetDurations)	

#print refTimestampsMinMax
#print targetTimestampsMinMax
#print dtsOffset

#refTimestampsMinMax = getMinMaxTimestamps(refTimestamps, refDurations)
#targetTimestampsMinMax = getMinMaxTimestamps(targetTimestamps, targetDurations)	

offsets = {}
for group, curTarget in targetTimestampsMinMax.items():
	if not refTimestampsMinMax.has_key(group):
		continue
	curRef = refTimestampsMinMax[group]
	offsets[group] = curRef - curTarget

print 'Shifting by: %s' % offsets
print 'Dts offset: %s' % dtsOffset
shiftTimestamps(targetFilename, targetTimestamps, offsets, dtsOffset)


# consider using video for aligning the timestamps, also set DTS to PTS
