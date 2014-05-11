from mpegTsDefs import *
import h264Dump
import sys

def getVideoStreamFromTSFile(inputData):
	programPID = None
	videoStreamPID = None
	result = ''
	for curPos in xrange(0, len(inputData), TS_PACKET_LENGTH):
		curPacket = inputData[curPos:(curPos + TS_PACKET_LENGTH)]
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
			# parse PAT
			thePat = pat.parse(curPacket[curPos:])
			curPos += pat.sizeof()
			entryCount = (thePat.sectionLength - 9) / patEntry.sizeof()
			for i in range(entryCount):
				curEntry = patEntry.parse(curPacket[curPos:])
				curPos += patEntry.sizeof()
				if curEntry.programNumber == 1:
					programPID = curEntry.programPID
		elif packetHeader.PID == programPID:
			# parse PMT
			thePmt = pmt.parse(curPacket[curPos:])
			curPos += pmt.sizeof()
			curPos += thePmt.programInfoLength
			endPos = curPos + thePmt.sectionLength - 13
			videoStreamPID = None
			while curPos < endPos:
				curEntry = pmtEntry.parse(curPacket[curPos:])
				if curEntry.streamType == 27:
					videoStreamPID = curEntry.elementaryPID
				curPos += pmtEntry.sizeof() + curEntry.esInfoLength
		elif packetHeader.PID == videoStreamPID:
			# parse video stream
			if curPacket[curPos:].startswith(PES_MARKER) and \
				len(curPacket) >= curPos + 6 + pesOptionalHeader.sizeof():
				thePesHeader = pesHeader.parse(curPacket[curPos:])
				curPos += 6
				thePesOptHeader = pesOptionalHeader.parse(curPacket[curPos:])
				curPos += pesOptionalHeader.sizeof() + thePesOptHeader.pesHeaderLength
			result += curPacket[curPos:]
			
	return result

def decodeEmulationPrevention(inputData):
	result = ''
	i = 0
	while i < len(inputData):
		if inputData[i:(i + 3)] == '\x00\x00\x03':
			result += '\x00\x00'
			i += 2
		else:
			result += inputData[i]
		i += 1
	return result

def encodeEmulationPrevention(inputData):
	result = ''
	i = 0
	while i < len(inputData):
		if i + 2 < len(inputData) and inputData[i:(i + 2)] == '\x00\x00' and ord(inputData[i + 2]) <= 3:
			result += '\x00\x00\x03' + inputData[i + 2]
			i += 3
		else:
			result += inputData[i]
			i += 1
	return result

replacements = {}
def replacePacket(parser, nalPacket, encodeMethod):
	global replacements

	parser.init_encoder()
	encodeMethod(parser)
	updatedPacket = nalPacket[0] + encodeEmulationPrevention(parser.get_encoded_string())
	if len(updatedPacket) > len(nalPacket):
		raise Exception('cannot perform an update that increases packet size (%s>%s)' % (len(updatedPacket), len(nalPacket)))
	nalPacket = '\x00\x00\x01' + nalPacket
	updatedPacket = '\x00\x00\x01' + updatedPacket
	updatedPacket = '\x00' * (len(nalPacket) - len(updatedPacket)) + updatedPacket
	
	if nalPacket != updatedPacket:
		replacements[nalPacket] = updatedPacket

def copyParser(parser):
	result = BitParser()
	result.__dict__.update(parser.__dict__)
	return result
		
def encodeSeiPayload(parser, payload_type):
	parser.init_encoder()
	h264Dump.sei_payload(parser, payload_type, 0)
	messageBody = parser.bitData
	
	tempEncoder = BitParser()
	tempEncoder.init_encoder()
	tempEncoder.encode_unsigned_int(8, payload_type)				# payload type
	tempEncoder.encode_unsigned_int(8, len(messageBody) / 8)		# payload size
	return tempEncoder.bitData + messageBody
	
def encodeSei(parser):
	origPps = h264Dump.get_pps()
	h264Dump.set_pps(encodeParser)
	
	tempEncoder = BitParser()
	tempEncoder.init_encoder()
	for payloadType in parser.seiPayloadTypes:
		tempEncoder.bitData += encodeSeiPayload(parser, payloadType)
	tempEncoder.encode_rbsp_trailing_bits()
	
	parser.bitData = tempEncoder.bitData
	
	h264Dump.set_pps(origPps)

def walkNalPackets(rawVideoData):
	global encodeParser
	
	spsDict = {}
	curPps = None
	nalPacketStart = rawVideoData.find('\x00\x00\x01')
	while nalPacketStart >= 0 and nalPacketStart < len(rawVideoData):
		nalPacketEnd = rawVideoData.find('\x00\x00\x01', nalPacketStart + 1)
		if nalPacketEnd < 0:
			nalPacketEnd = len(rawVideoData)
		nalPacket = rawVideoData[(nalPacketStart + 3):nalPacketEnd]
		nalPacket = nalPacket.rstrip('\0')
		
		nalPacketType = ord(nalPacket[0]) & 0x1F
		print 'packet type %s' % nalPacketType
		if not nalPacketType in [6, 7, 8, 9]:
			nalPacketStart = nalPacketEnd
			continue

		# parse the packet
		parser = BitParser()
		parser.init_decoder(decodeEmulationPrevention(nalPacket[1:]))
		if nalPacketType == 9:
			print '==== NAL_AUD ===='
			h264Dump.access_unit_delimiter_rbsp(parser)
			print parser
		if nalPacketType == 8:
			print '==== NAL_PPS ===='
			h264Dump.pic_parameter_set_rbsp(parser)
			print parser
			# merge the sequence parameter set
			for curKey, curValue in spsDict[parser.seq_parameter_set_id].__dict__.items():
				if not hasattr(parser, curKey):
					setattr(parser, curKey, curValue)
			h264Dump.set_pps(parser)
		if nalPacketType == 6:
			print '==== NAL_SEI ===='
			h264Dump.sei_rbsp(parser)
			print parser
			
			'''
			# update parameters
			if 1 in parser.seiPayloadTypes:
				parser = copyParser(parser)
				parser.clock_timestamp_flag_i_ = 0
				replacePacket(parser, nalPacket, encodeSei)
			'''
		if nalPacketType == 7:
			print '==== NAL_SPS ===='
			h264Dump.seq_parameter_set_rbsp(parser)
			spsDict[parser.seq_parameter_set_id] = parser
			print parser
			
			'''
			# update parameters
			encodeParser = copyParser(parser)
			
			encodeParser.initial_cpb_removal_delay_length_minus1=20
			encodeParser.cpb_removal_delay_length_minus1=12
			encodeParser.dpb_output_delay_length_minus1=6
			encodeParser.time_offset_length=0

			# encode the result
			replacePacket(encodeParser, nalPacket, h264Dump.seq_parameter_set_rbsp)
			'''
			
		nalPacketStart = nalPacketEnd

class BitParser:

	def init_decoder(self, inputData):
		self.bitData = ''
		self.bitPos = 0
		for curCh in inputData:
			for bitIndex in xrange(7, -1, -1):
				if (ord(curCh) >> bitIndex) & 1:
					self.bitData += '1'
				else:
					self.bitData += '0'
		self.i = self.decode_i
		self.u = self.decode_u
		self.f = self.decode_u
		self.b = self.decode_b
		self.ue = self.decode_ue
		self.se = self.decode_se
		self.rbsp_trailing_bits = self.decode_rbsp_trailing_bits
		self.byte_aligned = self.decode_byte_aligned
		
	def init_encoder(self):
		self.bitData = ''
		self.i = self.encode_i
		self.u = self.encode_u
		self.f = self.encode_u
		self.ue = self.encode_ue
		self.se = self.encode_se
		self.rbsp_trailing_bits = self.encode_rbsp_trailing_bits
		self.byte_aligned = self.encode_byte_aligned
		
	def get_encoded_string(self):
		result = ''
		for curPos in xrange(0, len(self.bitData), 8):
			curByte = 0
			for curBit in self.bitData[curPos:(curPos + 8)]:
				curByte = (curByte << 1) | int(curBit)
			result += chr(curByte)
		return result
	
	def __str__(self):
		fields = self.__dict__.keys()
		fields.sort()
		result = ''
		for curField in fields:
			if curField in ['bitData', 'bitPos']:
				continue
			value = getattr(self, curField)
			if hasattr(value, '__call__'):
				continue
			result += '%s = %s\n' % (curField, value)
		return result
	
	# utility decode functions
	def get_bits(self, bitCount):
		result = self.bitData[self.bitPos:(self.bitPos + bitCount)]
		self.bitPos += bitCount
		return result

	def decode_unsigned_int(self, bitCount):
		curBits = self.get_bits(bitCount)
		result = 0
		for curCh in curBits:
			result = result * 2 + int(curCh)
		return result

	def decode_signed_int(self, bitCount):
		if bitCount == 0:
			return 0
		negative = self.get_bits(1)
		if negative == '0':
			return self.decode_unsigned_int(bitCount - 1)
		return self.decode_unsigned_int(bitCount - 1) - (1 << (bitCount - 1))

	def decode_unsigned_exp_int(self):
		zeroCount = 0
		while self.bitData[self.bitPos + zeroCount] == '0':
			zeroCount += 1
		self.bitPos += zeroCount + 1
		return (1 << zeroCount) - 1 + self.decode_unsigned_int(zeroCount)

	# decoding functions
	def set_value(self, value, fieldName):
		setattr(self, fieldName, value)
		return value
		
	def decode_b(self, bitCount, fieldName):
		assert(bitCount == 8)
		if hasattr(self, fieldName):
			prevValue = getattr(self, fieldName)
		else:
			prevValue = ''
		return self.set_value(prevValue + chr(self.decode_unsigned_int(8)), fieldName)

	def decode_i(self, bitCount, fieldName):
		if bitCount == 0:
			return 0
		negative = self.get_bits(1)
		if negative == '0':
			return self.set_value(self.decode_unsigned_int(bitCount - 1), fieldName)
		return self.set_value(
			self.decode_unsigned_int(bitCount - 1) - (1 << (bitCount - 1)), 
			fieldName)
		
	def decode_u(self, bitCount, fieldName):
		return self.set_value(self.decode_unsigned_int(bitCount), fieldName)

	def decode_ue(self, fieldName):
		return self.set_value(self.decode_unsigned_exp_int(), fieldName)

	def decode_se(self, fieldName):
		value = self.decode_unsigned_exp_int()
		if value > 0:
			if value & 1:	# positive
				value = (value + 1) / 2
			else:			# negative
				value = -(value / 2)
		return self.set_value(value, fieldName)

	def decode_rbsp_trailing_bits(self):
		trailingBits = self.bitData[self.bitPos:]
		if len(trailingBits) > 0 and not trailingBits.rstrip('0') == '1':
			print 'invalid trailing bits - %s' % trailingBits

	def decode_byte_aligned(self):
		return (self.bitPos & 0x7) == 0
			
	def more_rbsp_data(self):
		result = self.bitPos < len(self.bitData) and \
			(self.bitData[self.bitPos] != '1' or '1' in self.bitData[(self.bitPos + 1):])
		print '%s - %s' % (self.bitData[self.bitPos:], result)
		return result
		
	def next_bits(self, bitCount):
		result = 0
		for curCh in self.bitData[self.bitPos:(self.bitPos + bitCount)]:
			result = result * 2 + int(curCh)
		return result
		
	# utility encode functions
	def encode_unsigned_int(self, bitCount, value):
		encValue = bin(value)[2:][-bitCount:]
		encValue = '0' * (bitCount - len(encValue)) + encValue
		self.bitData += encValue
		return value
	
	def encode_signed_int(self, bitCount, value):
		if value >= 0:
			self.bitData += '0'
			self.encode_unsigned_int(bitCount - 1, value)
		else:
			self.bitData += '1'
			self.encode_unsigned_int(bitCount - 1, (1 << (bitCount - 1)) + value)
		return value
	
	def encode_unsigned_exp_int(self, value):
		encValue = bin(value + 1)[2:]
		encValue = '0' * (len(encValue) - 1) + encValue
		self.bitData += encValue
		return value
		
	# encoding functions
	def get_value(self, fieldName):
		if fieldName == 'bit_equal_to_one':
			return 1
		if fieldName == 'bit_equal_to_zero':
			return 0
		return getattr(self, fieldName)
	
	def encode_i(self, bitCount, fieldName):
		value = self.get_value(fieldName)
		return self.encode_signed_int(bitCount, value)

	def encode_u(self, bitCount, fieldName):
		value = self.get_value(fieldName)
		return self.encode_unsigned_int(bitCount, value)

	def encode_ue(self, fieldName):
		value = self.get_value(fieldName)
		return self.encode_unsigned_exp_int(value)

	def encode_se(self, fieldName):
		value = self.get_value(fieldName)
		if value < 0:
			value *= -2
		elif value > 0:
			value = value * 2 - 1
		return self.encode_unsigned_exp_int(value)
		
	def encode_rbsp_trailing_bits(self):
		self.bitData += '1'
		reminder = len(self.bitData) % 8
		if reminder > 0:
			self.bitData += '0' * (8 - reminder)

	def encode_byte_aligned(self):
		return (len(self.bitData) & 0x7) == 0
		
inputData = file(sys.argv[1], 'rb').read()
#inputData = inputData.replace('0000000109E0000000'.decode('hex'), '0000000109F0000000'.decode('hex'))
walkNalPackets(getVideoStreamFromTSFile(inputData))

for curSearch, curReplace in replacements.items():
	print 'Replacing:\n  %s\nWith:\n  %s\n' % (curSearch.encode('hex'), curReplace.encode('hex'))
	inputData = inputData.replace(curSearch, curReplace)

if len(sys.argv) > 2:
	file(sys.argv[2], 'wb').write(inputData)
