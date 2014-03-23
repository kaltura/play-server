
var fs = require('fs');
var os = require('os');
var url = require('url');
var util = require('util');
var http = require('follow-redirects').http;

var id3Reader = require('../../bin/TsId3Reader.node');

var kaltura = module.exports = require('../KalturaManager');
kaltura.mediaInfo = require('../media/KalturaMediaInfo');


/**
 * Stream watcher, instantiated per rendition manifest
 * 
 * @param manager KalturaStreamManager
 * @param params {url, entryId, masterUrl}
 * @param finishCallback called when watching is not required anymore
 */
var KalturaStreamWatcher = function(manager, params, finishCallback){
	this.manager = manager;
	this.finishCallback = finishCallback;

	this.renditionId = this.manager.cache.getManifestId(params.url);
	this.trackerOutputKey = this.manager.cache.getManifestContent(this.renditionId),
	this.entryRequiredKey = this.manager.cache.getEntryRequired(params.entryId);
	this.cuePointsKey = this.manager.cache.getCuePoints(params.entryId);
	this.elapsedTimeKey = this.manager.cache.getElapsedTime(params.entryId);
	this.cuePoints = {};
	this.segmentsHistoryLimit = 12;
	this.segmentsHistory = {};
	this.urlTranslations = {};

	this.firstTime = true;
	this.startTime = new Date().getTime();
	this.trackerRequired = false;

	this.renditionManifestHandledKey = this.manager.cache.getRenditionManifestHandled(params.url);
	this.latency = manager.config.stream.latency / 10; // assuming each segment is of 10 seconds
	
	this.url = params.url;
	this.lowestBitrate = params.lowestBitrate;
	this.entryId = params.entryId;
	this.masterUrl = params.masterUrl;

	// if the process crashed and restored, the cache key might exist although no one is watching this manifest
	if(params.restored){
		this.getManifest();
	}
	else{
		var This = this;
		this.manager.cache.get(this.renditionManifestHandledKey, function(data){
			if(!data){
				This.getManifest();
			}
		});
	}
};

KalturaStreamWatcher.MINIMUM_RUN_PERIOD = 60000;
KalturaStreamWatcher.CYCLE_INTERVAL = 2000;
KalturaStreamWatcher.RESULT_MANIFEST_EXPIRY = 20;
	
KalturaStreamWatcher.prototype = {

	/**
	 * @type KalturaStreamManager
	 */
	manager: null,
	
	/**
	 * @type function
	 */
	finishCallback: null,

	/**
	 * Check cache to see if entry still required
	 */
	verifyTrackingRequired: function(){
		var This = this;
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
	},
	
	/**
	 * Load cue-points from cache
	 */
	loadCuePoints: function(){
		var This = this;
		this.manager.cache.get(this.cuePointsKey, function(data){
			if(data){
				This.cuePoints = data;
			}
		});
	},
	
	/**
	 * Read the segments URLs, replace them with ads if needed, store the manifest to cache
	 * @param manifestContent
	 */
	stitchManifest: function(manifestContent){
		var This = this;
		this.cycleStartTime = new Date().getTime();

		this.verifyTrackingRequired();
		this.loadCuePoints();

		var manifest = this.parseM3U8(manifestContent);
		if(manifest.segments.length > 0){
			var lastSegmentSequest = null;
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
		
		// if encoding was not defined yet by parsing the first ts, no ads could be ingested yet
		if(!this.encodingId){
			this.keepWatching();
			return;
		}
		this.stitchBlack();
		
		var newResult = [];
		var buffer = [];
		var segmentsCount = manifest.segments.length - this.latency;
		for(var segmentIndex = 0; segmentIndex < segmentsCount; segmentIndex++){
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
			if(buffer.length < 3)
				continue;

			while(buffer.length > 3)
				buffer.shift();

			for(var segmentUrl in this.urlTranslations){
				if(this.urlTranslations[segmentUrl].sequence < buffer[0].sequence){
					delete this.urlTranslations[segmentUrl];
				}
			}
			
			// load buffer
			segmentUrl = buffer[1].url;

			// check whether we already mapped this buffer
			if(this.urlTranslations[segmentUrl]){
				newResult.push(this.urlTranslations[segmentUrl]);
				continue;
			}
			
			offsetStart = buffer[1].offset ? buffer[1].offset : null;
			offsetEnd = offsetStart ? offsetStart + buffer[1].duration : null;
			KalturaLogger.debug('Segment [' + buffer[1].sequence + '] URL [' + segmentUrl + '] start [' + offsetStart + '] end [' + offsetEnd + ']');

			if(!this.lastUsedSegment || buffer[0].sequence > this.lastUsedSegment){
				// update the last used segment
				this.lastUsedSegment = buffer[0].sequence;
				

				// check whether we should start an ad
				if(!this.inAdSlot){
					for(var cuePointId in this.cuePoints){
						cuePoint = this.cuePoints[cuePointId];

						// ad starts in first segment
						if(offsetStart <= cuePoint.startTime && cuePoint.startTime <= offsetEnd){
							this.inAdSlot = true;
							this.cuePoint = cuePoint;
							this.adStartOffset = (cuePoint.startTime - offsetStart) * 90;
							this.adEndOffset = (this.adStartOffset + cuePoint.duration) * 90;
							this.adCurOffset = 0;
							this.adStartSegment = buffer[1].sequence;
							
							KalturaLogger.debug('Ad started cue-point[' + cuePointId + '] start[' + this.adStartOffset + '] end[' + this.adEndOffset + ']');
							break;
						}
					}
				}
			}

			// not part of ad -> just output it
			if(!this.inAdSlot || buffer[0].sequence < this.adStartSegment){
				if(!parseInt(this.manager.config.stream.useCdn)){
					buffer[0].url = buffer[0].resolvedUrl;
				}
				KalturaLogger.debug('Append original segment [' + buffer[0].url + ']');
				newResult.push(buffer[0]);
				continue;
			}

			var curSegmentDuration = buffer[0].duration * 90000;
			var nextSegmentDuration = buffer[1].duration * 90000;

			if(this.adCurOffset == 0){
				// create pre ad ts
				var preSegmentId = this.manager.cache.getPreSegmentId(this.cuePoint.id, this.renditionId);
				this.stitchSegment(buffer, preSegmentId, this.adStartOffset, 'left');
			}

			if(this.adCurOffset + curSegmentDuration <= this.adEndOffset && this.adCurOffset + curSegmentDuration + nextSegmentDuration > this.adEndOffset){
				// create post ad ts
				var postSegmentId = this.manager.cache.getPostSegmentId(this.cuePoint.id, this.renditionId);
				this.stitchSegment(buffer, postSegmentId, this.adEndOffset - this.adCurOffset, 'right');
			}

			if(this.adCurOffset > this.adEndOffset){
				// last segment
				outputEnd = 0;
			}
			else{
				outputEnd = this.adCurOffset + curSegmentDuration;
			}

			var stitchSegmentParams = {
				entryId: this.entryId, 
				cuePointId: this.cuePoint.id, 
				renditionId: this.renditionId, 
				encodingId: this.encodingId,
				segmentIndex: buffer[0].sequence - this.adStartSegment,
				outputStart: this.adCurOffset,
				outputEnd: outputEnd,
				encrypt: true
			};
			buffer[0].url = this.getPlayServerUrl('media', 'segment', stitchSegmentParams);
			KalturaLogger.debug('Translating [' + segmentUrl + '] to [' + buffer[0].url + ']');
			this.urlTranslations[segmentUrl] = buffer[0];
			newResult.push(buffer[0]);

			if(this.adCurOffset > this.adEndOffset){
				this.inAdSlot = false;
				KalturaLogger.debug('Ad started cue-point[' + this.cuePoint.id + '] start[' + this.adStartOffset + '] end[' + this.adEndOffset + ']');
			}
			else{
				this.adCurOffset += curSegmentDuration;
			}
		}
			
		this.keepWatching();
		
		// build the final manifest
		return this.buildM3U8(manifest.headers, newResult, manifest.footers);
	},
	
	
	/**
	 * Trigger black segment stitching
	 * 
	 * @param segments
	 * @param segmentId
	 * @param offset
	 * @param portion
	 */
	stitchBlack: function(){
		var This = this;
		var blackMediaKey = this.cache.getBlackMedia(this.encodingId);
		this.cache.touch(blackMediaKey, function(){
			KalturaLogger.log('Black media [' + this.encodingId + '] already stitched');
		}, function(err){
			var blackHandledKey = This.cache.getBlackHandled(this.encodingId);
			This.cache.add(blackHandledKey, true, 60, function(){
				KalturaLogger.log('Stitching black media [' + this.encodingId + ']');
				This.callPlayServerService('segment', 'stitchBlack', {encodingId: This.encodingId});
			}, function (err) {
				KalturaLogger.log('Black media [' + this.encodingId + '] already handled');
			});
		});
	},
	
	
	/**
	 * Trigger segment stitching
	 * 
	 * @param segments
	 * @param segmentId
	 * @param offset
	 * @param portion
	 */
	stitchSegment: function(segments, segmentId, offset, portion){
		var segmentParams = {
			segmentId: segmentId,
			url1: segments[0].resolvedUrl,
			url2: segments[1].resolvedUrl,
			url3: segments[2].resolvedUrl,
			offset: offset, 
			portion: portion
		};
		This.callPlayServerService('segment', 'stitch', segmentParams);
	},

	
	/**
	 * Trigger the next manifest watch, in few seconds
	 */
	keepWatching: function(){
		if(!this.manager.run){
			return;
		}
		
		// sleep until next cycle
		var curTime = new Date().getTime();
		var sleepTime = Math.max(0, this.cycleStartTime + KalturaStreamWatcher.CYCLE_INTERVAL - curTime);
		var This = this;
		setTimeout(function(){
			This.getManifest();
		}, sleepTime);
	},

	
	/**
	 * Fetch the manifest from the cdn and call the manifest handler
	 */
	getManifest: function(){
		This.manager.cache.set(This.renditionManifestHandledKey, true, KalturaStreamWatcher.RESULT_MANIFEST_EXPIRY);
		
		if(new Date().getTime() > (this.startTime + KalturaStreamWatcher.MINIMUM_RUN_PERIOD) && !this.trackerRequired){
			this.manager.cache.del(this.renditionManifestHandledKey);
			KalturaLogger.log('Done');
			if(this.finishCallback && typeof this.finishCallback === 'function'){
				this.finishCallback();
			}
			return;
		}
		
		var This = this;
		this.manager.getHttpUrl(this.url, function(manifestContent){
			var newManifestContent = This.stitchManifest(manifestContent);
			This.manager.cache.set(This.trackerOutputKey, newManifestContent, KalturaStreamWatcher.RESULT_MANIFEST_EXPIRY);
		}, function(err){
			KalturaLogger.error('Failed to fetch manifest: ' + err);
			This.keepWatching();
		});
	},

	/**
	 * @type int make sure we won't handle the same segment twice
	 */
	lastParsedSegment: 0,
	
	
	/**
	 * Fetch the segment from the cdn an parse its metadata
	 */
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

	/**
	 * Build encoding params based on the first segment
	 * @param localPath
	 */
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
					var profileName = mediaInfo.video.profile.name.toLowerCase();
					for(var i = 0; i < validProfiles.length; i++){
						if(profileName == validProfiles[i]){
							videoProfile = ' -vprofile ' + profileName + ' -level ' + mediaInfo.video.profile.level;
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

			This.encodingId = encodingParams.md5();
			This.cache.append(This.entryRequiredKey, '\n' + This.encodingId);
			
			var encodingParamsKey = This.manager.cache.getEncodingParams(This.encodingId);
			var blackEncodingParamsKey = This.manager.cache.getBlackEncodingParams(This.encodingId);
			This.manager.cache.set(encodingParamsKey, encodingParams, 600);
			This.manager.cache.set(blackEncodingParamsKey, blackEncodingParams, 600);
		});
		
	},

	
	/**
	 * Save sync-point data to cache
	 * @param entryId
	 * @param segment object {sequence, url, resolvedUrl, duration}
	 * @param syncPoint KalturaSyncPoint
	 */
	handleSyncPoint: function(entryId, segment, syncPoint){
		var elapsedTime = {
			sequence: segment.sequence,
			offset: (syncPoint.offset * 1000),
			timestamp: syncPoint.timestamp // in milliseconds since 1970
		};
		
		this.manager.cache.set(this.elapsedTimeKey, elapsedTime, 600);
	},

	
	/**
	 * Parse cue-points and sync-points from segment metadata
	 * 
	 * @param entryId
	 * @param segment object {sequence, url, resolvedUrl, duration}
	 * @param buffer Array <segment>
	 */
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
							if(cuePoint.objectType){
								switch(cuePoint.objectType){
									case 'KalturaSyncPoint':
										this.handleSyncPoint(entryId, segment, cuePoint);
										break;

									case 'KalturaAdCuePoint':
										// TODO
										break;
								}
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
	
	
	/**
	 * Parse m3u8 manifest
	 * @param manifestContent
	 * @returns object {headers, segments, footers}
	 */
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
	
	
	/**
	 * Build m3u8 manifest
	 * 
	 * @param headers
	 * @param segments
	 * @param footers
	 * @returns string
	 */
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
			
			result += '#EXTINF:' + segment.duration + '\n';
			result += segmentUrl + '\n';
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

/**
 * @service stream
 */
var KalturaStreamManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaStreamManager, kaltura.KalturaManager);

/**
 * Start watching rendition manifest
 * 
 * @action stream.watch
 * 
 * @param url
 * @param entryId
 * @param masterUrl
 */
KalturaStreamManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['url', 'entryId', 'masterUrl']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);
	
	this.callRestorableAction('stream', 'watchRendition', params);

	response.log('Handled');
	response.writeHead(200);
	response.done('OK');
};


/**
 * Restorable action, run as long as the entry watch is required
 * 
 * @param params {url, entryId, masterUrl}
 * @param finishCallback called when the watch is not needed anymore and the restoreable action could be unstored
 */
KalturaStreamManager.prototype.watchRendition = function(params, finishCallback){
	KalturaLogger.dir(params);

	params.latency = this.config.stream.latency / 10; // assuming each segment is of 10 seconds

	new KalturaStreamWatcher(this, params, finishCallback);
};

module.exports.KalturaStreamManager = KalturaStreamManager;
