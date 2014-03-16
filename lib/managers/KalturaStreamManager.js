
var fs = require('fs');
var os = require('os');
var url = require('url');
var util = require('util');
var http = require('http');

var id3Reader = require('../../bin/TsId3Reader.node');

var kaltura = module.exports = require('../KalturaManager');
kaltura.mediaInfo = require('../media/KalturaMediaInfo');

var KalturaStreamWatcher = function(manager, params, finishCallback){
	this.manager = manager;
	this.finishCallback = finishCallback;

	var manifestId = this.manager.cache.getManifestId(params.url);
	this.trackerOutputKey = this.manager.cache.getManifestContent(manifestId),
	this.entryRequiredKey = this.manager.cache.getEntryRequired(params.entryId);
	this.cuePointsKey = this.manager.cache.getCuePoints(params.entryId);
	this.elapsedTimeKey = this.manager.cache.getElapsedTime(params.entryId);
	this.encodingParamsId = (params.bitrate + ':' + params.width + 'X' + params.height).md5();
	this.cuePoints = {};
	this.segmentsHistoryLimit = 12;
	this.segmentsHistory = {};

	this.firstTime = true;
	this.startTime = new Date().getTime();
	this.trackerRequired = false;
	this.lastOutputSeqNum = null;

	this.lastUsedSegmentKey = this.manager.cache.getLastUsedSegment(params.masterUrl);
	this.flavorManifestHandledKey = this.manager.cache.getFlavorManifestHandled(params.url);
	this.latency = manager.config.stream.latency / 10; // assuming each segment is of 10 seconds
	
	this.url = params.url;
	this.lowestBitrate = params.lowestBitrate;
	this.entryId = params.entryId;
	this.masterUrl = params.masterUrl;

	if(params.restored){
		this.getManifest();
	}
	else{
		var This = this;
		this.manager.cache.get(this.flavorManifestHandledKey, function(data){
			if(!data){
				This.getManifest();
				This.manager.cache.set(This.flavorManifestHandledKey, true, 10);
			}
		});
	}
};
KalturaStreamWatcher.prototype = {
	MINIMUM_RUN_PERIOD: 60000,
	CYCLE_INTERVAL: 2000,

	manager: null,
	finishCallback: null,

	handleManifest: function(manifestContent){
		var This = this;
		this.cycleStartTime = new Date().getTime();
		
		this.manager.cache.get(this.entryRequiredKey, function(data){
			if(data){
				KalturaLogger.debug('Entry [' + This.entryId + '] still required [' + This.entryRequiredKey + ']');
				This.trackerRequired = true;
			}
			else{
				KalturaLogger.debug('Entry [' + This.entryId + '] not required any more [' + This.entryRequiredKey + ']');
				This.trackerRequired = false;
			}
		});

		this.manager.cache.get(this.cuePointsKey, function(data){
			if(data){
				This.cuePoints = data;
			}
		});

		var manifest = this.parseM3U8(manifestContent);
		var lastSegmentSequest = null;
		if(manifest.segments.length > 0){
			for(var i = 0; i < manifest.segments.length; i++){
				if(this.firstTime || this.lowestBitrate){
					this.parseSegment(This.entryId, manifest.segments[i]);
				}
				lastSegmentSequest = manifest.segments[i].sequence;
				this.segmentsHistory[lastSegmentSequest] = manifest.segments[i];
			}
			
			for(var sequence in this.segmentsHistory){
				if(sequence < (lastSegmentSequest - this.segmentsHistoryLimit)){
					delete this.segmentsHistory[sequence];
				}
			}
		}

		this.manager.cache.get(this.elapsedTimeKey, function(elapsedTime){
			if(elapsedTime){
				var offset = elapsedTime.offset;
				for(var sequence in This.segmentsHistory){
					if(sequence >= elapsedTime.sequence){
						This.segmentsHistory[sequence].offset = offset;
						offset += (This.segmentsHistory[sequence].duration);
					}
				}
			}
		});
		
		var urlTranslations = [];
		var newResult = [];
		var buffer = [];
		var lastUsedSegment = null;
		var segmentsCount = manifest.segments.length - this.latency;
		for(var segmentIndex = 0; segmentIndex < segmentsCount; segmentIndex++){
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
			if(buffer.length < 3)
				continue;

			while(buffer.length > 3)
				buffer.shift();

			// load buffer
			segmentUrl = buffer[1].url;
			offsetStart = buffer[1].offset ? buffer[1].offset : null;
			offsetEnd = offsetStart ? offsetStart + buffer[1].duration : null;
			
			KalturaLogger.debug('Segment [' + buffer[1].sequence + '] URL [' + buffer[1].url + '] start [' + offsetStart + '] end [' + offsetEnd + ']');
			if(urlTranslations[segmentUrl]){
				continue;
			}

			var partOfAdStart = false;
			var replacedByAd = false;
			var partOfAdEnd = false;
			
			var cuePoint = null;
			if(offsetStart && offsetEnd){
				for(var cuePointId in this.cuePoints){
					cuePoint = this.cuePoints[cuePointId];
					
					// ad starts in first segment
					if(offsetStart <= cuePoint.startTime && cuePoint.startTime <= offsetEnd){
						partOfAdStart = true;
						break;
					}
					
					// ad replaces the first segment
					if(cuePoint.startTime <= offsetStart && offsetEnd <= cuePoint.endTime){
						replacedByAd = true;
						break;
					}
					
					// ad ends in first segment
					if(offsetStart <= cuePoint.endTime && cuePoint.endTime <= offsetEnd){
						partOfAdEnd = true;
						break;
					}
				}
			}
				
			if(replacedByAd){
			}
			else if(partOfAdStart){
				// ad starts here
				var preSegmentDuration = cuePoint.startTime - offsetStart;
				
				// get the pre-ad segment
				var preSegmentId = this.manager.cache.getPreSegmentId(this.entryId, this.encodingParamsId);
				var adSegmentId = this.manager.cache.getPlayerAdId(this.entryId, this.encodingParamsId);

//				this.addAd(adSegmentId); // TODO
				this.cutTsFile(buffer, preSegmentId, preSegmentDuration, 'left');
				
				// add the required urls
				var preAdUrl = this.getPlayServerUrl('media', 'segment', {segmentId: preSegmentId}) + '\n';
				
				urlTranslations[segmentUrl] = {'URL' : preAdUrl, 'EXTINF' : preSegmentDuration};
				KalturaLogger.debug('Append Segment pre [' + preAdUrl + ']');
				newResult.push(urlTranslations[segmentUrl]);
				
				var chunks = Math.ceil(cuePoint.duration / 10); // 10 seconds chunks
				for(var chunkIndex = 1; chunkIndex <= chunks; chunkIndex++){
					var adUrl = this.getPlayServerUrl('media', 'segment', {playerId: adSegmentId, chunk: chunkIndex}) + '\n';
					var adTranslation = {'URL' : adUrl, 'EXTINF' : cuePoint.duration};
					KalturaLogger.debug('Append Segment ad [' + chunkIndex + '] [' + adUrl + ']');
					newResult.push(adTranslation);
				}
			}
			else if(partOfAdEnd){
				var postSegmentStartOffset = cuePoint.endTime - buffer[0].offset;
				var postSegmentDuration = buffer[1].offset - cuePoint.endTime;

				var postSegmentId = this.manager.cache.getPostSegmentId(this.entryId, this.encodingParamsId);
				
				this.cutTsFile(buffer, postSegmentId, postSegmentStartOffset, 'right');

				var postAdUrl = this.getPlayServerUrl('media', 'segment', {segmentId: postSegmentId}) + '\n';
				urlTranslations[segmentUrl] = {'URL' : postAdUrl, 'EXTINF' : postSegmentDuration};
				KalturaLogger.debug('Append Segment post [' + postAdUrl + ']');
				newResult.push(urlTranslations[segmentUrl]);
			}
			else{
				lastUsedSegment = buffer[0].sequence;
				if(!parseInt(this.manager.config.stream.useCdn)){
					buffer[0].url = buffer[0].resolvedUrl;
				}
				KalturaLogger.debug('Append Segment original [' + buffer[0].url + ']');
				newResult.push(buffer[0]);
				continue;
			}
		}
		
		// calculate the output sequence number
		var outputSeqNum = null;
		if(this.lastOutputSeqNum != null){
			for(var currentPosision = newResult.length - 1; currentPosision > newResult.length - 3 && currentPosision >= 0;  currentPosision--){
				var curUrl = newResult[currentPosision].url;
				if(curUrl == this.lastOutputSeqNum.url){
					outputSeqNum = this.lastOutputSeqNum.sequence - currentPosision;
					break;
				}
			}
		}

		if(outputSeqNum == null){
			outputSeqNum = manifest.headers['EXT-X-MEDIA-SEQUENCE'] * 1;
		}
		else{
			manifest.headers['EXT-X-MEDIA-SEQUENCE'] = outputSeqNum;
		}
		
		// remember the sequence number of the last non-ad URL for next time
		this.lastOutputSeqNum = null;
		for(var currentPosision = newResult.length - 1; currentPosision > newResult.length - 3 && currentPosision >= 0;  currentPosision--){
			var curUrl = newResult[currentPosision].url;
			if(curUrl == this.AD_URL_MARKER)
				continue;
			
			this.lastOutputSeqNum = {
				URL: curUrl, 
				SEQ: outputSeqNum + currentPosision
			};
			break;
		}
			
		// build the final manifest
		var newManifestContent = this.buildM3U8(manifest.headers, newResult, manifest.footers);

		// update the last used segment in memcache
		if(lastUsedSegment != null){
			// Note: there is a race here between the get & set, but it shouldn't be a problem since trackers
			//		working on the same entry will more or less synchronized, if they aren't it's a problem anyway...
			this.manager.cache.get(this.lastUsedSegmentKey, function(data){
				if (data === false || lastUsedSegment > data){
					This.manager.cache.set(This.lastUsedSegmentKey, lastUsedSegment, 30);
				}
			}, function(err){
				This.manager.cache.set(This.lastUsedSegmentKey, lastUsedSegment, 30);
			});
		}
			
		// save the result to memcache
		this.manager.cache.add(this.trackerOutputKey, newManifestContent, 30, null, function (err) {
			This.manager.cache.set(This.trackerOutputKey, newManifestContent, 30);
		});
		
		this.keepWatching();
	},
	
	cutTsFile: function(segments, segmentId, offset, portion){
		var segmentParams = {
			segmentId: segmentId,
			url1: segments[0].resolvedUrl,
			url2: segments[1].resolvedUrl,
			url3: segments[2].resolvedUrl,
			offset: offset, 
			portion: portion
		};
		This.callPlayServerService('segment', 'cut', segmentParams);
	},

	keepWatching: function(){
		// sleep until next cycle
		var curTime = new Date().getTime();
		var sleepTime = Math.max(0, this.cycleStartTime + this.CYCLE_INTERVAL - curTime);
		var This = this;
		setTimeout(function(){
			This.getManifest();
		}, sleepTime);
	},

	getManifest: function(){

		if(new Date().getTime() > (this.startTime + this.MINIMUM_RUN_PERIOD) && !this.trackerRequired){
			this.manager.cache.del(this.flavorManifestHandledKey);
			KalturaLogger.log('Done');
			if(this.finishCallback && typeof this.finishCallback === 'function'){
				this.finishCallback();
			}
			return;
		}
		
		this.manager.cache.touch(this.flavorManifestHandledKey, true, 10);
		
		var This = this;
		this.manager.getHttpUrl(this.url, function(manifestContent){
			This.handleManifest(manifestContent);
		}, function(err){
			KalturaLogger.error('Failed to fetch manifest: ' + err);
			this.keepWatching();
		});
	},

	lastParsedSegment: 0,
	
	parseSegment: function(entryId, segment){
		if(this.lastParsedSegment >= segment.sequence)
			return;
		
		this.lastParsedSegment = segment.sequence;
		
		KalturaLogger.log('Parse segment entry [' + entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']');

		parsedUrl = url.parse(segment.resolvedUrl);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};

		var This = this;
		var request = http.request(options, function(response) {
			if (response.statusCode != 200) {
				KalturaLogger.error('Parse segment entry [' + entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']: Invalid http status: ' + response.statusCode);
				return;
			}

			var localPath = null;
			if(This.firstTime){
				localPath = os.tmpdir() + '/' + This.getUniqueId();
				var localFile = fs.createWriteStream(localPath);
				response.pipe(localFile);
			}
			
			var buffers = [];
			response.on('data', function(data) {
				buffers.push(data);
			});
			response.on('end', function() {

				if(This.firstTime){
					This.parseEncodingParams(localPath);

					This.firstTime = false;
				}
				
				if(This.lowestBitrate){
					This.parseCuePoints(This.entryId, segment, Buffer.concat(buffers));
				}
			});
		});

		request.on('error', function(e) {
			KalturaLogger.error('Parse segment entry [' + entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']: http error: ' + e.message);
		});

		request.end();
	},

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
		
	normalizeVideoBitrate: function(bitrate){
		return this.normalizeBitrate(bitrate, [300,400,500,700,900,1200,1600,2000,2500,3000,4000]);
	},

	normalizeAudioBitrate: function(bitrate){
		return this.normalizeBitrate(bitrate, [64,128]);
	},

	parseEncodingParams: function(localPath){
		var This = this;
		
		if(this.manager.config.bin.mediaInfoPath){
			kaltura.mediaInfo.bin = this.manager.config.bin.mediaInfoPath;
		}
		
		kaltura.mediaInfo.parse(localPath, function(mediaInfo){

			// video codec
			if(mediaInfo.video){
				blackInput = '-t ' + This.blackDuration;
				vcodec = '-vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0 -coder 1 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0:force-cfr -pix_fmt yuv420p -threads 4';
				videoProfile = ' -vprofile main -level 3.1';
				if(mediaInfo.video.profile){
					var validProfiles = ['baseline', 'main', 'high', 'high10', 'high422', 'high444'];
					for(var i = 0; i < validProfiles.length; i++){
						if(mediaInfo.video.profile.name.toLowerCase() == validProfiles[i]){
							videoProfile = ' -vprofile %s -level %s' % (profile.lower(), level)
						}
					}
				}
				vcodec += videoProfile;
				
				if(mediaInfo.video.bitrate){
					vcodec += ' -b:v ' + This.normalizeVideoBitrate(mediaInfo.video.bitrate / 1024) + 'k';
				}
				else if(mediaInfo.general.bitrate){
					vcodec += ' -b:v ' + This.normalizeVideoBitrate(mediaInfo.general.bitrate / 1024) + 'k';
				}

				if(mediaInfo.video.width && mediaInfo.video.height){
					vcodec += ' -vf scale="iw*min(' + mediaInfo.video.width + '/iw\,' + mediaInfo.video.height + '/ih)';
					vcodec += ':ih*min(' + mediaInfo.video.width + '/iw\,' + mediaInfo.video.height + '/ih)';
					vcodec += ',pad=' + mediaInfo.video.width + ':' + mediaInfo.video.height + '';
					vcodec += ':(' + mediaInfo.video.width + '-iw)/2:(' + mediaInfo.video.height + '-ih)/2"';
					
					blackInput += ' -s ' + mediaInfo.video.width + 'x' + mediaInfo.video.height;
				}

				if(mediaInfo.video.frameRate){
					vcodec += ' -r ' + mediaInfo.video.frameRate;
					blackInput += ' -r ' + mediaInfo.video.frameRate;
				}

				if(mediaInfo.video.reframes){
					vcodec += ' -refs ' + mediaInfo.video.reframes;
				}
				else{
					vcodec += ' -refs 6';
				}
				blackInput += ' -f rawvideo -pix_fmt rgb24 -i /dev/zero';
			}
			else{
				blackInput = '';
				vcodec = '-vn';
			}
				
			// audio codec
			if(mediaInfo.audio){
				silenceInput = '-t ' + This.blackDuration;
				acodec = '-acodec libfdk_aac';
				if(mediaInfo.audio.bitrate){
					acodec += ' -b:a ' + This.normalizeAudioBitrate(mediaInfo.audioBitrate / 1024) + 'k';
				}
				
				if(mediaInfo.audio.sampleRate){
					acodec += ' -ar ' + mediaInfo.audio.sampleRate;
					silenceInput += ' -ar ' + mediaInfo.audio.sampleRate;
				}

				if(mediaInfo.audio.channels){
					acodec += ' -ac ' + mediaInfo.audio.channels;
					silenceInput += ' -ac ' + mediaInfo.audio.channels;
				}
				silenceInput += ' -f s16le -acodec pcm_s16le -i /dev/zero';
			}
			else{
				silenceInput = '';
				acodec = '-an';
			}

			// filter / format - fixed
			filter = '-bsf h264_mp4toannexb';
			format = '-f mpegts';

			encodingParams = [vcodec, acodec, filter, format].join(' ');
			blackEncodingParams = [blackInput, silenceInput, encParams].join(' ');

			var encodingParamsKey = This.manager.cache.getEncodingParams(This.encodingParamsId);
			var blackEncodingParamsKey = This.manager.cache.getBlackEncodingParams(This.encodingParamsId);
			This.manager.cache.set(encodingParamsKey, encodingParams, 600);
			This.manager.cache.set(blackEncodingParamsKey, blackEncodingParams, 600);
		});
		
	},

	handleSyncPoint: function(entryId, segment, syncPoint){
		var elapsedTime = {
			sequence: segment.sequence,
			offset: (syncPoint.offset * 1000)
		};
		
		this.manager.cache.set(this.elapsedTimeKey, elapsedTime, 600);
	},

	parseCuePoints: function(entryId, segment, buffer){
		KalturaLogger.debug('Entry [' + entryId + '] segment [' + segment.sequence + ']');

		var parsed = id3Reader.parseBuffer(buffer);
		KalturaLogger.dir(parsed);
		if(parsed.id3tags.length > 0){
			for(var i = 0; i < parsed.id3tags.length; i++){
				var id3tag = parsed.id3tags[i];
				for(var attribute in id3tag){
					switch(attribute){
						case 'PTS':
							KalturaLogger.debug('Id3 [' + attribute + ']: ' + id3tag[attribute]);
							break;
							
						case 'TEXT':
							var cuePoint = JSON.parse(id3tag.TEXT.TEXT);
							if(cuePoint.objectType && cuePoint.objectType == 'KalturaSyncPoint'){
								this.handleSyncPoint(entryId, segment, cuePoint);
							}
							break;
							
						default:
							KalturaLogger.debug('unhandled Id3 [' + attribute + ']:');
							KalturaLogger.dir(id3tag[attribute]);
					}
				}
			}
		}
	},
	
	parseM3U8 : function(manifestContent){
		KalturaLogger.log(manifestContent);
		var manifest = {
			headers: {},
			segments: [],
			footers: {}
		};
		
		var segmentInfo = {};
		var lastSequenceNum = null;
		var m3u8Lines = manifestContent.split('\n');
		for(var i = 0; i < m3u8Lines.length; i++){
			var m3u8Line = m3u8Lines[i].trim();
			if(m3u8Line.length == 0)
				continue;
			
			if(m3u8Line[0] != '#'){
				if(lastSequenceNum == null)
					lastSequenceNum = manifest.headers['EXT-X-MEDIA-SEQUENCE'] * 1;
				
				segmentInfo.url = m3u8Line;
				segmentInfo.resolvedUrl = url.resolve(this.masterUrl, m3u8Line);
				segmentInfo.sequence = lastSequenceNum;
				manifest.segments.push(segmentInfo);
				segmentInfo = {};
				lastSequenceNum += 1;
				continue;
			}
				
			var splittedLine = m3u8Line.substr(1).split(':', 2);
			if(splittedLine.length < 2)
				splittedLine.push('');
	
			var key = splittedLine[0];
			var value = splittedLine[1];
			
			switch(key){
				case 'EXT-X-ENDLIST':
					manifest.footers[key] = value;
					break;
					
				case 'EXTINF':
					if(value.substr(-1) == ',')
						value = value.trim(0, value.length - 1);
	
					value = parseFloat(value);
					segmentInfo[key] = value;
					segmentInfo.duration = parseInt(value * 1000);
					break;
					
				case 'EXT-X-DISCONTINUITY':
					if(value.substr(-1) == ',')
						value = value.trim(0, value.length - 1);
					
					segmentInfo[key] = value;
					break;
				
				default:
					manifest.headers[key] = value;
			}
		}
			
		return manifest;
	},
	
	buildM3U8 : function(headers, segments, footers) {
		result = '';
		
		for(var key in headers){
			var value = headers[key];
			result += "#" + key;
			if(value.length > 0)
				result += ":" + value;
			result += '\n';
		}
			
		for(var i = 0; i < segments.length; i++){
			var segment = segments[i];
			segmentUrl = segment.url;
			
			KalturaLogger.debug('Append segment [' + segment.sequence + '] duration [' + segment.duration + '] URL: ' + segmentUrl);
	//		TODO
	//		if(segmentUrl == this.AD_URL_MARKER){
	//			result += '#EXT-X-DISCONTINUITY\n';
	//		}
			
			result += '#EXTINF:' + segment.duration + '\n';
			
	//		TODO
	//		if(segmentUrl != this.AD_URL_MARKER){
				result += segmentUrl + '\n';
	//		}
	//		else{
	//			result += adRequestUrl + '\n';
	//			result += '#EXT-X-DISCONTINUITY\n';
	//		}
		}
	
		for(var key in footers){
			var value = footers[key];
			result += '#' + key;
			if(value.length > 0)
				result += ':' + value;
			result += '\n';
		}
		
		return result;
	}
};

var KalturaStreamManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaStreamManager, kaltura.KalturaManager);

KalturaStreamManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['url', 'entryId', 'masterUrl']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);
	
	this.callRestorableAction('stream', 'watchFlavor', params);

	KalturaLogger.log('Request [' + response.requestId + '] handled');
	response.writeHead(200);
	response.end('OK');
};

KalturaStreamManager.prototype.watchFlavor = function(params, finishCallback){
	KalturaLogger.dir(params);

	params.latency = this.config.stream.latency / 10; // assuming each segment is of 10 seconds

	var streamWatcher = new KalturaStreamWatcher(this, params, finishCallback);
	// TODO add streamWatcher to array to be stopped when service stopped
};

module.exports.KalturaStreamManager = KalturaStreamManager;
