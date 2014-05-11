
var KalturaFfmpegParams = {

	/**
	 * Select closest bitrate from know list of bitrates
	 * 
	 * @param bitrate
	 * @param standardBitrates
	 * @returns int
	 */
	normalizeBitrate: function(bitrate, standardBitrates){
		var normBitrate = standardBitrates[0];
		for(var i = 1; i < standardBitrates.length; i++){
			var curBitrate = standardBitrates[i];
			if(Math.abs(curBitrate - bitrate) < Math.abs(normBitrate - bitrate)){
				normBitrate = curBitrate;
			}
		}
		
		return normBitrate;
	},

	
	/**
	 * Select closest bitrate from know list of video bitrates
	 * 
	 * @param bitrate
	 * @returns int
	 */
	normalizeVideoBitrate: function(bitrate){
		return this.normalizeBitrate(bitrate, [300,400,500,700,900,1200,1600,2000,2500,3000,4000]);
	},


	/**
	 * Select closest bitrate from know list of audio bitrates
	 * 
	 * @param bitrate
	 * @returns int
	 */
	normalizeAudioBitrate: function(bitrate){
		return this.normalizeBitrate(bitrate, [64,128]);
	},

	getSimpleMappingResult: function(value, defaultValue, mapping) {
		if (mapping[value]) {
			return mapping[value];
		}
		return defaultValue;
	},
	
	///////////// MISC /////////////

	getParamDuration: function (duration) {
		return ' -t ' + duration;
	},
	
	getParamContainerMpegTs: function (mediaInfo) {
		return ' -f mpegts';
	},	
	
	///////////// VIDEO /////////////

	getParamVideoNone: function (mediaInfo) {
		return ' -vn';
	},
	
	getParamVideoCopy: function (mediaInfo) {
		return ' -vcodec copy';
	},

	getParamVideoH264OptsVideoFormat: function (mediaInfo) {
		return 'videoformat=' + this.getSimpleMappingResult(mediaInfo.video.standard, 'undef', {
			'Component':	'component',
			'PAL':			'pal',
			'NTSC':			'ntsc',
			'SECAM':		'secam',
			'MAC':			'mac',
		});
	},
	
	getParamVideoH264OptsColorPrim: function (mediaInfo) {
		return 'colorprim=' + this.getSimpleMappingResult(mediaInfo.video.colorPrimaries, 'undef', {
			'BT.709': 			'bt709',
			'BT.470 System M': 	'bt470m',
			'BT.601 PAL': 		'bt470bg',
			'BT.601 NTSC': 		'smpte170m',
			'SMPTE 240M': 		'smpte240m',
			'Generic film': 	'film'
		});
	},
		
	getParamVideoH264OptsTransferChar: function (mediaInfo) {
		return 'transfer=' + this.getSimpleMappingResult(mediaInfo.video.transferCharacteristics, 'undef', {
			'BT.709': 							'bt709',
			'BT.470 System M': 					'bt470m',
			'BT.470 System B, BT.470 System G': 'bt470bg',
			'Linear': 							'linear',
			'Logarithmic (100:1)': 				'log100',
			'Logarithmic (316.22777:1)': 		'log316',
			'BT.601': 							'smpte170m',
			'SMPTE 240M': 						'smpte240m',
		});
	},

	getParamVideoH264OptsColorMatrix: function (mediaInfo) {
		var result;
		if (mediaInfo.video.matrixCoefficients == 'BT.601') {
			// both smpte170m & bt470bg are read by mediainfo as BT.601, so we use the colorPrimaries as a hint
			if (mediaInfo.video.colorPrimaries == 'BT.601 NTSC') {
				result = 'smpte170m';
			}
			else {
				result = 'bt470bg';
			}
		}
		else {
			result = this.getSimpleMappingResult(mediaInfo.video.matrixCoefficients, 'undef', {
				'BT.709':		'bt709',
				'FCC 73.682':	'fcc',
				'SMPTE 240M':	'smpte240m',
				'RGB': 			'GBR',
				'YCgCo': 		'YCgCo',
			});
		}
		return 'colormatrix=' + result;
	},
	
	getParamVideoH264Opts: function (mediaInfo) {
		var options = ['b-pyramid', 'weightb', 'mixed-refs', '8x8dct', 'no-fast-pskip=0', 'force-cfr'];
		// Note: we use a non-standard SPS-id to make sure the SPS id does not collide
		//	with an SPS-id that is already used on the stream. Some decoders assume that all
		//	SPS packets that share the same id are the same. Since we can't guarantee that our
		//	SPS packet will be identical to the SPS of the original stream even we match all the
		//	the mediainfo parameters, we have to use a different id
		options.push('sps-id=27');
		options.push(this.getParamVideoH264OptsVideoFormat(mediaInfo));
		options.push(this.getParamVideoH264OptsColorPrim(mediaInfo));
		options.push(this.getParamVideoH264OptsTransferChar(mediaInfo));
		options.push(this.getParamVideoH264OptsColorMatrix(mediaInfo));
		return ' -x264opts ' + options.join(':');
	},

	getParamVideoH264Base: function (mediaInfo) {
		return	' -vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0' +
				' -coder 1 -pix_fmt yuv420p -threads 4' + this.getParamVideoH264Opts(mediaInfo);
	},
	
	getParamVideoFilter: function (mediaInfo) {
		return ' -bsf h264_mp4toannexb';
	},
	
	getParamVideoBlackInput: function (mediaInfo) {
		return ' -f rawvideo -pix_fmt rgb24 -i /dev/zero';
	},
	
	getParamVideoProfile: function (mediaInfo) {
		var result = ' -vprofile main -level 3.1';
		if(mediaInfo.video.profile){
			// Note: high10, high422, high444 are all recognized by mediainfo as 'High'
			result = ' -vprofile ' + this.getSimpleMappingResult(mediaInfo.video.profile.name, 'main', {
				'Baseline': 'baseline',
				'Main': 	'main',
				'High': 	'high',
			});
			
			if(mediaInfo.video.profile.level) {
				result += ' -level ' + mediaInfo.video.profile.level;
			}
		}
		return result;
	},
	
	getParamVideoBitrate: function (mediaInfo) {
		if(mediaInfo.video.bitrate){
			return ' -b:v ' + this.normalizeVideoBitrate(mediaInfo.video.bitrate / 1024) + 'k';
		}
		else if(mediaInfo.general.bitrate){
			return ' -b:v ' + this.normalizeVideoBitrate(mediaInfo.general.bitrate / 1024) + 'k';
		}
		else if(mediaInfo.video.duration){
			return ' -b:v ' + this.normalizeVideoBitrate(mediaInfo.fileSize * 8 / mediaInfo.video.duration / 1024) + 'k';
		}
		return '';
	},
	
	getParamVideoScale: function (mediaInfo) {
		if(mediaInfo.video.width && mediaInfo.video.height){
			var result = ' -vf scale="iw*min(' + mediaInfo.video.width + '/iw\\,' + mediaInfo.video.height + '/ih):';
			result += 'ih*min(' + mediaInfo.video.width + '/iw\\,' + mediaInfo.video.height + '/ih),';
			result += 'pad=' + mediaInfo.video.width + ':' + mediaInfo.video.height + ':';
			result += '(' + mediaInfo.video.width + '-iw)/2:(' + mediaInfo.video.height + '-ih)/2"';
			return result;
		}
		return '';
	},
	
	getParamVideoFixedSize: function (mediaInfo) {
		if(mediaInfo.video.width && mediaInfo.video.height){
			return ' -s ' + mediaInfo.video.width + 'x' + mediaInfo.video.height;
		}
		return '';
	},
	
	getParamVideoFrameRate: function (mediaInfo) {
		if(mediaInfo.video.frameRate){
			return ' -r ' + mediaInfo.video.frameRate;
		}
		return '';
	},
	
	getParamVideoReframes: function (mediaInfo) {
		if(mediaInfo.video.reframes){
			return ' -refs ' + mediaInfo.video.reframes;
		}
		return ' -refs 6';
	},

	///////////// AUDIO /////////////
	
	getParamAudioNone: function (mediaInfo) {
		return ' -an';
	},

	getParamAudioCopy: function (mediaInfo) {
		return ' -acodec copy';
	},
	
	getParamAudioAacBase: function (mediaInfo) {
		return ' -acodec libfdk_aac';
	},
	
	getParamAudioSilenceInput: function (mediaInfo) {
		return ' -f s16le -acodec pcm_s16le -i /dev/zero';
	},
	
	getParamAudioProfile: function (mediaInfo) {
		return ' -profile:a ' + this.getSimpleMappingResult(mediaInfo.audio.profile, 'aac_he', {
			'LC':			'aac_low',
			'HE-AAC':		'aac_he',
			'HE-AACv2':		'aac_he_v2',
			'ER AAC LD':	'aac_ld',
			'ER AAC ELD':	'aac_eld',
		});
	},
	
	getParamAudioBitrate: function (mediaInfo) {
		if(mediaInfo.audio.bitrate){
			return ' -b:a ' + this.normalizeAudioBitrate(mediaInfo.audio.bitrate / 1024) + 'k';
		}
		return '';
	},
	
	getParamAudioSampleRate: function (mediaInfo) {
		if(mediaInfo.audio.sampleRate){
			return ' -ar ' + mediaInfo.audio.sampleRate;
		}
		return '';
	},
	
	getParamAudioChannels: function (mediaInfo) {
		if(mediaInfo.audio.channels){
			return ' -ac ' + mediaInfo.audio.channels;
		}
		return '';
	},
	
	buildEncodingParams: function(mediaInfo, copyVideo, copyAudio){
		var result = '';

		if(mediaInfo.video){
			if (!copyVideo) {
				result += 
					this.getParamVideoH264Base(mediaInfo) + 
					this.getParamVideoProfile(mediaInfo) + 
					this.getParamVideoBitrate(mediaInfo) + 
					this.getParamVideoScale(mediaInfo) + 						 
					this.getParamVideoFrameRate(mediaInfo) + 
					this.getParamVideoReframes(mediaInfo);
			}
			else {
				result += this.getParamVideoCopy(mediaInfo);
			}
		}
		else{
			result += this.getParamVideoNone(mediaInfo);
		}
			
		// audio codec
		if(mediaInfo.audio){
			if (!copyAudio) {
				result += 
					this.getParamAudioAacBase(mediaInfo) +
					this.getParamAudioProfile(mediaInfo) +
					this.getParamAudioBitrate(mediaInfo) +
					this.getParamAudioSampleRate(mediaInfo) +
					this.getParamAudioChannels(mediaInfo);
			} 
			else {
				result += this.getParamAudioCopy(mediaInfo);
			}
		}
		else{
			result += this.getParamAudioNone(mediaInfo);
		}

		if(mediaInfo.video && !copyVideo) {
			result += this.getParamVideoFilter(mediaInfo);
		}
		
		result += this.getParamContainerMpegTs(mediaInfo);
		
		return result;
	},
	
	buildBlackInputParams: function(mediaInfo, blackDuration){
		if(!blackDuration)
			blackDuration = 10;
		
		var result = '';
		
		// video codec
		if(mediaInfo.video){
			result += 
				this.getParamDuration(blackDuration) + 
				this.getParamVideoFixedSize(mediaInfo) +
				this.getParamVideoFrameRate(mediaInfo) + 
				this.getParamVideoBlackInput(mediaInfo);
		}
			
		// audio codec
		if(mediaInfo.audio){
			result = 
				this.getParamDuration(blackDuration) + 
				this.getParamAudioSampleRate(mediaInfo) +
				this.getParamAudioChannels(mediaInfo) +
				this.getParamAudioSilenceInput(mediaInfo);
		}
		
		return result;
	},
};

module.exports = KalturaFfmpegParams;

