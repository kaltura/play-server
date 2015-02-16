from mpegTsDefs import *
import subprocess
import commands
import sys
import os

def printTable(row):
	result = ''
	for curElem in row:
		curElem = '%s' % curElem
		result += curElem + ' ' * max(1, 12 - len(curElem))
	print result

def getFileIndex(offset, sizes):
	curOffset = 0
	for index in xrange(len(sizes)):
		nextOffset = curOffset + sizes[index]
		if offset >= curOffset and offset < nextOffset:
			return index
		curOffset = nextOffset
	
def getTSTimestamps(inputFilenames, filterStreamId):
	# read all files
	inputData = ''
	inputSizes = []
	for inputFilename in inputFilenames:
		curBuffer = file(inputFilename, 'rb').read()
		inputData += curBuffer
		inputSizes.append(len(curBuffer))
	
	elementaryStreamIds = []
	programPID = None
	pcrPID = None
	filePos = 0
	
	prevPcrValue = {}
	prevPtsValue = {}
	prevDtsValue = {}

	# print the header
	printTable(['fileIdx', 'pos', 'packetIdx', 'streamId', 'pcr', 'pts', 'dts', 'pcrdiff', 'ptsdiff', 'dtsdiff'])
	
	result = []
	for curPos in xrange(0, len(inputData), TS_PACKET_LENGTH):
		curPacket = inputData[curPos:(curPos + TS_PACKET_LENGTH)]
		# skip the TS header
		packetHeader = mpegTsHeader.parse(curPacket)
		curPos = mpegTsHeader.sizeof()
		# skip the adaptation field
		adaptationField = None
		if packetHeader.adaptationFieldExist:
			adaptationField = mpegTsAdaptationField.parse(curPacket[curPos:])
			adaptationFieldDataPos = curPos + mpegTsAdaptationField.sizeof()
			curPos += 1 + adaptationField.adaptationFieldLength
		if packetHeader.PID == PAT_PID:
			# get the PMT PID
			thePat = pat.parse(curPacket[curPos:])
			curPos += pat.sizeof()
			entryCount = (thePat.sectionLength - 9) / patEntry.sizeof()
			for i in range(entryCount):
				curEntry = patEntry.parse(curPacket[curPos:])
				curPos += patEntry.sizeof()
				if curEntry.programNumber == 1:
					programPID = curEntry.programPID
		elif packetHeader.PID == programPID:
			# get the elementary stream ids
			thePmt = pmt.parse(curPacket[curPos:])
			curPos += pmt.sizeof()
			curPos += thePmt.programInfoLength
			endPos = curPos + thePmt.sectionLength - 13
			pcrPID = thePmt.pcrPID
			elementaryStreamIds = []
			while curPos < endPos:
				curEntry = pmtEntry.parse(curPacket[curPos:])
				curPos += pmtEntry.sizeof() + curEntry.esInfoLength
				elementaryStreamIds.append(curEntry.elementaryPID)
		else:
			# get the pcr value
			pcrValue = None
			if (packetHeader.PID == pcrPID and packetHeader.adaptationFieldExist and adaptationField.pcrFlag and 
				adaptationField.adaptationFieldLength >= mpegTsAdaptationField.sizeof() + pcr.sizeof() - 1):
				thePcr = pcr.parse(curPacket[adaptationFieldDataPos:])
				pcrValue = thePcr.pcr90kHz

			# get the pts / dts
			ptsValue = None
			dtsValue = None
			if packetHeader.PID in elementaryStreamIds:
				if curPacket[curPos:].startswith(PES_MARKER) and \
					len(curPacket) >= curPos + 6 + pesOptionalHeader.sizeof():
					thePesHeader = pesHeader.parse(curPacket[curPos:])
					curPos += 6 # pesHeader.sizeof()
					thePesOptHeader = pesOptionalHeader.parse(curPacket[curPos:])
					curPos += pesOptionalHeader.sizeof()
					if thePesOptHeader.ptsFlag:
						ptsStruct = pts.parse(curPacket[curPos:])
						ptsValue = getPts(ptsStruct)
						curPos += pts.sizeof()
						if thePesOptHeader.dtsFlag:
							ptsStruct = pts.parse(curPacket[curPos:])
							dtsValue = getPts(ptsStruct)
							curPos += pts.sizeof()
						else:
							dtsValue = ptsValue
			
			if (pcrValue != None or ptsValue != None or dtsValue != None) and \
				(filterStreamId == None or thePesHeader.streamId == filterStreamId):
				row = [getFileIndex(filePos, inputSizes), filePos, filePos / 188 + 1, thePesHeader.streamId, pcrValue, ptsValue, dtsValue]
				
				# pcr diff
				if pcrValue != None:
					if prevPcrValue.has_key(thePesHeader.streamId):
						row.append(pcrValue - prevPcrValue[thePesHeader.streamId])
					else:
						row.append(None)
					prevPcrValue[thePesHeader.streamId] = pcrValue
				else:
					row.append(None)

				# pts diff
				if ptsValue != None:
					if prevPtsValue.has_key(thePesHeader.streamId):
						row.append(ptsValue - prevPtsValue[thePesHeader.streamId])
					else:
						row.append(None)
					prevPtsValue[thePesHeader.streamId] = ptsValue
				else:
					row.append(None)

				# dts diff
				if dtsValue != None:
					if prevDtsValue.has_key(thePesHeader.streamId):
						row.append(dtsValue - prevDtsValue[thePesHeader.streamId])
					else:
						row.append(None)
					prevDtsValue[thePesHeader.streamId] = dtsValue
				else:
					row.append(None)
					
				printTable(row)
				
		filePos += len(curPacket)
	return result

if len(sys.argv) < 2:
	print 'Usage:\n\t%s [-f<stream id to filter>] <input file1> <input file2> ...' % os.path.basename(__file__)
	sys.exit(1)

if sys.argv[1].startswith('-f'):
	filterStreamId = int(sys.argv[1][2:])
	fileNames = sys.argv[2:]
else:
	filterStreamId = None
	fileNames = sys.argv[1:]
timestamps = getTSTimestamps(fileNames, filterStreamId)
