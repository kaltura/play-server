from mpegTsDefs import *
import sys
import os

def cutTsFile(inputFilename, outputFilename, cutStart, cutEnd):
	inputFile = file(inputFilename, 'rb')
	programPID = None
	filePos = 0
	lastPmtPacket = None
	while lastPmtPacket == None or filePos < cutStart:
		curPacket = inputFile.read(TS_PACKET_LENGTH)
		if len(curPacket) < TS_PACKET_LENGTH:
			break
		packetHeader = mpegTsHeader.parse(curPacket)
		curPos = mpegTsHeader.sizeof()
		if packetHeader.adaptationFieldExist:
			adaptationField = mpegTsAdaptationField.parse(curPacket[curPos:])
			curPos += 1 + adaptationField.adaptationFieldLength
		if packetHeader.PID == PAT_PID:
			lastPatPacket = curPacket
			thePat = pat.parse(curPacket[curPos:])
			curPos += pat.sizeof()
			entryCount = (thePat.sectionLength - 9) / patEntry.sizeof()
			for i in range(entryCount):
				curEntry = patEntry.parse(curPacket[curPos:])
				curPos += patEntry.sizeof()
				if curEntry.programNumber == 1:
					programPID = curEntry.programPID
		elif packetHeader.PID == programPID:
			lastPmtPacket = curPacket
		filePos += len(curPacket)
	if cutEnd > filePos:
		cutPackets = inputFile.read(cutEnd - filePos)
	else:
		cutPackets = inputFile.read()
	inputFile.close()
	
	outputFile = file(outputFilename, 'wb')
	outputFile.write(lastPatPacket)
	outputFile.write(lastPmtPacket)	
	outputFile.write(cutPackets)
	outputFile.close()
	

inputFilename, outputFilename, cutStart, cutEnd = sys.argv[1:]
cutStart = int(cutStart)
cutEnd = int(cutEnd)

print 'Cutting %s to %s from offset %s..%s' % (inputFilename, outputFilename, cutStart, cutEnd)
cutTsFile(inputFilename, outputFilename, cutStart, cutEnd)
