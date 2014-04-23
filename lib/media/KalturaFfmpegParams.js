
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

	getParamVideoH264Base: function (mediaInfo) {
		return	' -vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0' +
				' -coder 1 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0:force-cfr' + 
				' -pix_fmt yuv420p -threads 4';
	},
	
	getParamVideoFilter: function (mediaInfo) {
		return ' -bsf h264_mp4toannexb';
	},
	
	getParamVideoBlackInput: function (mediaInfo) {
		return ' -f rawvideo -pix_fmt rgb24 -i /dev/zero';
	},
	
	getParamVideoProfile: function (mediaInfo) {
		if(mediaInfo.video.profile){
			var validProfiles = ['baseline', 'main', 'high', 'high10', 'high422', 'high444'];
			var profileName = mediaInfo.video.profile.name.toLowerCase();
			if (validProfiles.indexOf(profileName) >= 0) {
				return ' -vprofile ' + profileName + ' -level ' + mediaInfo.video.profile.level;
			}
		}
		return ' -vprofile main -level 3.1';
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
		var profileMapping = {
			'LC': 'aac_low',
			'HE-AAC': 'aac_he',
			'HE-AACv2': 'aac_he_v2',
			'ER AAC LD': 'aac_ld',
			'ER AAC ELD': 'aac_eld',
		};
		if (mediaInfo.audio.profile && profileMapping[mediaInfo.audio.profile]) {
			return ' -profile:a ' + profileMapping[mediaInfo.audio.profile];
		}
		return ' -profile:a aac_he';
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
				this.getParamVideoFixedScale(mediaInfo) + 
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

module.exports.buildEncodingParams = KalturaFfmpegParams.buildEncodingParams;
module.exports.buildBlackInputParams = KalturaFfmpegParams.buildBlackInputParams;
