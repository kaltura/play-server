import commands

MEDIAINFO_BIN = 'mediainfo'

class MediaInfoParsers:
	@staticmethod
	def parseValue(value):
		value = value.split(' / ')[0]		# support 'Sampling rate : 44.1 KHz / 22.05 KHz'
		splittedValue = value.split(' ')
		value = ''.join(splittedValue[:-1])
		try:
			if value.endswith('.0'):
				value = int(value[:-2])
			elif '.' in value:
				value = float(value)
			else:
				value = int(value)
		except ValueError:
			return None
		return (value, splittedValue[-1])
		
	@staticmethod
	def parseBitrate(value):
		value, units = MediaInfoParsers.parseValue(value)
		if units == 'bps':
			return value
		elif units == 'Kbps':
			return value * 1024
		elif units == 'Mbps':
			return value * 1024 * 1024
		elif units == 'Gbps':
			return value * 1024 * 1024 * 1024
		return None
	
	@staticmethod
	def parseSamplingRate(value):
		value, units = MediaInfoParsers.parseValue(value)
		if units == 'KHz':
			return value * 1000
		return None

	@staticmethod
	def getSimpleParser(allowedUnits):
		def result(value):
			value, units = MediaInfoParsers.parseValue(value)
			if units in allowedUnits:
				return value
			return None
		return result
	
	@staticmethod
	def parseVideoProfile(value):
		splittedValue = value.split('@L')
		if len(splittedValue) != 2:
			return None
		return splittedValue
		
	@staticmethod
	def parseAudioProfile(value):
		return value.split(' / ')[0].split('@')[0]		# support 'HE-AAC / LC'
		
class MediaInfo:
	PARSING_CONFIG = {
		'general': [
			('overall bit rate', 'containerBitrate', MediaInfoParsers.parseBitrate),
			],
			
		'video': [
			('bit rate', 'videoBitrate', MediaInfoParsers.parseBitrate),
			('width', 'videoWidth', MediaInfoParsers.getSimpleParser(['pixels'])),
			('height', 'videoHeight', MediaInfoParsers.getSimpleParser(['pixels'])),
			('frame rate', 'videoFrameRate', MediaInfoParsers.getSimpleParser(['fps'])),
			('format settings, reframes', 'videoReframes', MediaInfoParsers.getSimpleParser(['frame', 'frames'])),
			('format profile', 'videoProfile', MediaInfoParsers.parseVideoProfile),
			],

		'audio': [
			('bit rate', 'audioBitrate', MediaInfoParsers.parseBitrate),
			('sampling rate', 'audioSamplingRate', MediaInfoParsers.parseSamplingRate),
			('channel(s)', 'audioChannels', MediaInfoParsers.getSimpleParser(['channel', 'channels'])),
			('format profile', 'audioProfile', MediaInfoParsers.parseAudioProfile),
			],
	}

	def parse(self, inputFileName):
		cmdLine = '%s %s' % (MEDIAINFO_BIN, inputFileName)
		output = commands.getoutput(cmdLine)
		sectionName = None
		values = {}
		for curLine in output.split('\n'):
			curLine = curLine.strip()
			if len(curLine) == 0:
				sectionName = None
				continue
			splittedLine = map(lambda x: x.strip(), curLine.split(':', 1))
			if len(splittedLine) == 1:
				sectionName = splittedLine[0].lower()
			elif sectionName != None:
				values.setdefault(sectionName, {})
				values[sectionName][splittedLine[0].lower()] = splittedLine[1]
		
		for sectionName, fields in self.PARSING_CONFIG.items():
			for keyName, memberName, parser in fields:
				value = None
				if values.has_key(sectionName) and values[sectionName].has_key(keyName):
					value = parser(values[sectionName][keyName])
				setattr(self, memberName, value)
				
		self.hasVideo = values.has_key('video')
		self.hasAudio = values.has_key('audio')

def normalizeBitrate(bitrate, standardBitrates):
	normBitrate = standardBitrates[0]
	for curBitrate in standardBitrates:
		if abs(curBitrate - bitrate) < abs(normBitrate - bitrate):
			normBitrate = curBitrate
	return normBitrate
	
def normalizeVideoBitrate(bitrate):
	return normalizeBitrate(bitrate, [300,400,500,700,900,1200,1600,2000,2500,3000,4000])

def normalizeAudioBitrate(bitrate):
	return normalizeBitrate(bitrate, [64,128])

def getMpegTSEncodingParams(referenceFileName, blackDuration = 10):
	# get the mediainfo of the source file
	mediaInfo = MediaInfo()
	mediaInfo.parse(referenceFileName)
	
	if not mediaInfo.hasVideo and not mediaInfo.hasAudio:
		return (None, None)		# no audio and no video -> file is invalid

	# video codec
	if mediaInfo.hasVideo:
		blackInput = '-t %s' % blackDuration
		vcodec = "-vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0 -coder 1 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0:force-cfr:sps-id=26 -pix_fmt yuv420p -threads 4 -force_key_frames \"expr:gte(t,n_forced*2)\""
		
		videoProfile = ' -vprofile main -level 3.1'
		if mediaInfo.videoProfile != None:
			profile, level = mediaInfo.videoProfile
			if profile.lower() in ['baseline', 'main', 'high', 'high10', 'high422', 'high444']:
				videoProfile = ' -vprofile %s -level %s' % (profile.lower(), level)
		vcodec += videoProfile
		
		if mediaInfo.videoBitrate != None:
			vcodec += ' -b:v %sk' % normalizeVideoBitrate(mediaInfo.videoBitrate / 1024)
		elif mediaInfo.containerBitrate != None:
			vcodec += ' -b:v %sk' % normalizeVideoBitrate(mediaInfo.containerBitrate / 1024)

		if mediaInfo.videoWidth != None and mediaInfo.videoHeight != None:
			vcodec += ' -vf scale="iw*min(%s/iw\,%s/ih):ih*min(%s/iw\,%s/ih),pad=%s:%s:(%s-iw)/2:(%s-ih)/2"' % ((mediaInfo.videoWidth, mediaInfo.videoHeight) * 4)
			blackInput += ' -s %sx%s' % (mediaInfo.videoWidth, mediaInfo.videoHeight)

		if mediaInfo.videoFrameRate != None:
			vcodec += ' -r %s' % (mediaInfo.videoFrameRate)
			blackInput += ' -r %s' % (mediaInfo.videoFrameRate)

		if mediaInfo.videoReframes != None:
			vcodec += ' -refs %s' % (mediaInfo.videoReframes)
		else:
			vcodec += ' -refs 6'
		blackInput += ' -f rawvideo -pix_fmt rgb24 -i /dev/zero'
	else:
		blackInput = ''
		vcodec = '-vn'
		
	# audio codec
	if mediaInfo.hasAudio:
		silenceInput = '-t %s' % blackDuration
		acodec = '-acodec libfdk_aac'

		audioProfile = ' -profile:a aac_he'
		AUDIO_PROFILE_MAPPING = {
			'LC': 'aac_low',
			'HE-AAC': 'aac_he',
			'HE-AACv2': 'aac_he_v2',
			'ER AAC LD': 'aac_ld',
			'ER AAC ELD': 'aac_eld',
		}
		if AUDIO_PROFILE_MAPPING.has_key(mediaInfo.audioProfile):
			audioProfile = ' -profile:a %s' % AUDIO_PROFILE_MAPPING[mediaInfo.audioProfile]
		acodec += audioProfile
		
		if mediaInfo.audioBitrate != None:
			acodec += ' -b:a %sk' % normalizeAudioBitrate(mediaInfo.audioBitrate / 1024)
			
		if mediaInfo.audioSamplingRate != None:
			acodec += ' -ar %s' % (mediaInfo.audioSamplingRate)
			silenceInput += ' -ar %s' % (mediaInfo.audioSamplingRate)

		if mediaInfo.audioChannels != None:
			acodec += ' -ac %s' % (mediaInfo.audioChannels)
			silenceInput += ' -ac %s' % (mediaInfo.audioChannels)
		silenceInput += ' -f s16le -acodec pcm_s16le -i /dev/zero'
	else:
		silenceInput = ''
		acodec = '-an'

	# filter / format - fixed
	filter = "-bsf h264_mp4toannexb"
	format = '-f mpegts'

	encParams = ' '.join([vcodec, acodec, filter, format])
	blackEncParams = ' '.join([blackInput, silenceInput, encParams])
	
	return (encParams, blackEncParams)
