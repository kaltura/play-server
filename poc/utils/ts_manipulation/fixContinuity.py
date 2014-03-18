from mpegTsDefs import *
import shutil
import sys
import os

# xxx consider adding the option to do it backwards (only if the continuity retained within separate TS files)

class PacketReader:
	def __init__(self, fileName, reverse):
		self.inputFile = file(inputFilename, 'rb')
		self.inputFile.seek(0, os.SEEK_END)
		self.fileSize = self.inputFile.tell()
		if reverse:
			self.curPos = self.fileSize - TS_PACKET_LENGTH
			self.increment = -TS_PACKET_LENGTH
		else:
			self.curPos = 0
			self.increment = TS_PACKET_LENGTH
		
	def getPacket(self):
		if self.curPos > self.fileSize - TS_PACKET_LENGTH or self.curPos < 0:
			return (None, 0)
		
		packetPos = self.curPos
		self.curPos += self.increment
		self.inputFile.seek(packetPos, os.SEEK_SET)
		packetData = self.inputFile.read(TS_PACKET_LENGTH)
		return packetData, packetPos

def fixContinuity(inputFilename, outputFilename, reverse):
	packetReader = PacketReader(inputFilename, reverse)
	if reverse:
		increment = -1
	else:
		increment = 1
	shutil.copyfile(inputFilename, outputFilename)
	previousCounters = {}
	outputFile = file(outputFilename, 'rb+')
	index = 0
	result = []
	while True:
		index += 1
		(curPacket, filePos) = packetReader.getPacket()
		if curPacket == None:
			break
		packetHeader = mpegTsHeader.parse(curPacket)
		
		if previousCounters.has_key(packetHeader.PID):
			expectedValue = (previousCounters[packetHeader.PID] + increment) & 0xF 
			if expectedValue != packetHeader.continuityCounter:
				packetHeader.continuityCounter = expectedValue
				seekAndWrite(outputFile, filePos, mpegTsHeader.build(packetHeader))
		
		previousCounters[packetHeader.PID] = packetHeader.continuityCounter
	outputFile.close()

def seekAndWrite(fileHandle, offset, buffer):
	fileHandle.seek(offset, os.SEEK_SET)
	fileHandle.write(buffer)
	
(inputFilename, outputFilename, mode) = sys.argv[1:]

if mode == 'forward':
	reverse = False
elif mode == 'backward':
	reverse = True
else:
	print 'Invalid mode %s' % reverse

fixContinuity(inputFilename,outputFilename,reverse)
