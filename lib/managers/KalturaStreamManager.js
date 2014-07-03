
var fs = require('fs');
var os = require('os');
var url = require('url');
var util = require('util');
var http = require('follow-redirects').http;

var id3Reader = require('../../bin/TsId3Reader.node');

var kaltura = module.exports = require('../KalturaManager');
kaltura.mediaInfo = require('../media/KalturaMediaInfo');
kaltura.ffmpegParams = require('../media/KalturaFfmpegParams');


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

	this.renditionId = KalturaCache.getManifestId(params.url);
	this.trackerOutputKey = KalturaCache.getManifestContent(this.renditionId),
	this.entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
	this.cuePointsKey = KalturaCache.getCuePoints(params.entryId);
	this.elapsedTimeKey = KalturaCache.getElapsedTime(params.entryId);
	this.oldestSegmentTimeKey = KalturaCache.getOldestSegmentTime(params.entryId);
	this.elapsedTime = {};
	this.cuePoints = {};
	this.segmentsHistoryLimit = 12;
	this.segmentsHistory = {};
	this.urlTranslations = {};

	this.firstTime = true;
	this.startTime = new Date().getTime();
	this.trackerRequired = false;

	this.renditionManifestHandledKey = KalturaCache.getRenditionManifestHandled(params.url);
	this.latency = KalturaConfig.config.stream.latency / 10; // assuming each segment is of 10 seconds
	
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
		KalturaCache.get(this.renditionManifestHandledKey, function(data){
			if(!data){
				This.getManifest();
			}
		});
	}
};

KalturaStreamWatcher.MINIMUM_RUN_PERIOD = 60000;
KalturaStreamWatcher.CYCLE_INTERVAL = 2000;
	
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
		KalturaCache.get(this.entryRequiredKey, function(data){
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
		KalturaCache.get(this.cuePointsKey, function(data){
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

		var oldestSegment = null;
		var durationFromOldestSegment = 0;
		var manifest = this.parseM3U8(manifestContent);
		if(manifest.segments.length > 0){
			var lastSegmentSequence = null;
			//set the oldest segment time in cache, cue points older than the oldest segment will
			//be deleted from cache
			oldestSegment = manifest.segments[0];
			for(var i = 0; i < manifest.segments.length; i++){
				if(this.firstTime || this.lowestBitrate){
					this.parseSegment(This.entryId, manifest.segments[i]);
				}
				lastSegmentSequence = manifest.segments[i].sequence;
				durationFromOldestSegment += manifest.segments[i].duration;
				this.segmentsHistory[lastSegmentSequence] = manifest.segments[i];
			}
			
			for(var sequence in this.segmentsHistory){
				if(sequence < (lastSegmentSequence - this.segmentsHistoryLimit)){
					delete this.segmentsHistory[sequence];
				}
			}
		}

		if(this.elapsedTime && this.segmentsHistory[this.elapsedTime.sequence]){
			var timestamp;
			var offset;
			
			timestamp = this.elapsedTime.timestamp;
			offset = this.elapsedTime.offset;
			for (var i = this.elapsedTime.sequence; this.segmentsHistory[i]; i--){
				this.segmentsHistory[i].timestamp = timestamp;
				this.segmentsHistory[i].offset = offset;
				timestamp -= this.segmentsHistory[i].duration;
				offset -= this.segmentsHistory[i].duration;
			}

			timestamp = this.elapsedTime.timestamp;
			offset = this.elapsedTime.offset;
			for (var i = this.elapsedTime.sequence; this.segmentsHistory[i]; i++){
				this.segmentsHistory[i].timestamp = timestamp;
				this.segmentsHistory[i].offset = offset;
				this.elapsedTime = {
						sequence: i,
						duration: this.segmentsHistory[i].duration,
						offset: offset,
						timestamp: timestamp,
					};

				timestamp += this.segmentsHistory[i].duration;
				offset += this.segmentsHistory[i].duration;				
			}
			KalturaCache.set(this.elapsedTimeKey, this.elapsedTime, KalturaConfig.config.cache.elapsedTime);
			if(oldestSegment){
				var oldestSegmentTime = {
					offset: this.elapsedTime.offset - durationFromOldestSegment,
					timestamp: this.elapsedTime.timestamp - durationFromOldestSegment
				};
				KalturaCache.set(this.oldestSegmentTimeKey, oldestSegmentTime, KalturaConfig.config.cache.elapsedTime);
			}
		}
		
		// if encoding was not defined yet by parsing the first ts, no ads could be ingested yet
		if(!this.encodingId){
			this.keepWatching();
			return null;
		}
		this.stitchBlack();
		
		var newResult = [];
		var buffer = [];
		var segmentsCount = manifest.segments.length - this.latency;
		
		for(var segmentUrl in this.urlTranslations){
			this.urlTranslations[segmentUrl].used = false;
		}
		
		for(var segmentIndex = 0; segmentIndex < segmentsCount; segmentIndex++){
			KalturaLogger.debug('Segment [' + manifest.segments[segmentIndex].sequence + '] URL [' + manifest.segments[segmentIndex].url + ']');
			
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
			if(buffer.length < 3)
				continue;

			while(buffer.length > 3)
				buffer.shift();
			
			// load buffer
			segmentUrl = buffer[1].url;

			// check whether we already mapped this buffer
			if(this.urlTranslations[segmentUrl]){
				KalturaLogger.debug('Translating from urlTranslations [' + segmentUrl + '] to [' + this.urlTranslations[segmentUrl].url + ']');
				this.urlTranslations[segmentUrl].used = true;
				newResult.push(this.urlTranslations[segmentUrl]);
				continue;
			}
			
			offsetStart = this.segmentsHistory[buffer[1].sequence].offset ? this.segmentsHistory[buffer[1].sequence].offset : null;
			offsetEnd = offsetStart ? offsetStart + buffer[1].duration : null;
			timestampStart = this.segmentsHistory[buffer[1].sequence].timestamp ? this.segmentsHistory[buffer[1].sequence].timestamp : null;
			timestampEnd = timestampStart ? timestampStart + buffer[1].duration : null;
			KalturaLogger.debug('Stitch segment [' + buffer[1].sequence + '] URL [' + segmentUrl + 
								'] offset start [' + offsetStart + '] offset end [' + offsetEnd + '] timestamp start [' + timestampStart + '] timestamp end [' + timestampEnd + ']');

			if(!this.lastUsedSegment || buffer[0].sequence > this.lastUsedSegment){
				// update the last used segment
				this.lastUsedSegment = buffer[0].sequence;
				

				// check whether we should start an ad
				if(!this.inAdSlot && ((offsetStart && offsetEnd) || (timestampStart && timestampEnd))){
					for(var cuePointId in this.cuePoints){
						cuePoint = this.cuePoints[cuePointId];
						KalturaLogger.debug('cuePoint [' + cuePointId + '] startTime [' + cuePoint.startTime + '] triggeredAt [' + cuePoint.triggeredAt + ']');
						// ad starts in first segment
						if( (cuePoint.startTime && offsetStart <= cuePoint.startTime && cuePoint.startTime <= offsetEnd) ||
							(cuePoint.triggeredAt && timestampStart <= cuePoint.triggeredAt && cuePoint.triggeredAt <= timestampEnd)){
							this.inAdSlot = true;
							this.cuePoint = cuePoint;
							if(cuePoint.startTime)
								this.adStartOffset = (cuePoint.startTime - offsetStart + buffer[0].duration) * 90;
							else
								this.adStartOffset = (cuePoint.triggeredAt - timestampStart + buffer[0].duration) * 90;
							this.adEndOffset = this.adStartOffset + cuePoint.duration * 90; 
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
				if(!parseInt(KalturaConfig.config.stream.useCdn)){
					buffer[0].url = buffer[0].resolvedUrl;
				}
				KalturaLogger.debug('Append original segment [' + buffer[0].url + ']');
				newResult.push(buffer[0]);
				continue;
			}
					
			var curSegmentDuration = buffer[0].duration * 90;
			var nextSegmentDuration = buffer[1].duration * 90;
			
			if(this.adCurOffset == 0){
				// create pre ad ts
				var preSegmentId = KalturaCache.getPreSegmentId(this.cuePoint.id, this.renditionId);
				this.stitchSegment(buffer, preSegmentId, this.adStartOffset, 'left');
			}

			if(this.adCurOffset + curSegmentDuration <= this.adEndOffset && this.adCurOffset + curSegmentDuration + nextSegmentDuration > this.adEndOffset){
				// create post ad ts
				var postSegmentId = KalturaCache.getPostSegmentId(this.cuePoint.id, this.renditionId);
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
				outputEnd: outputEnd		
			};
			
			var tokens = {sessionId: '@SESSION_ID@'};
			
			buffer[0].url = this.manager.getPlayServerUrl('media', 'segment', tokens, stitchSegmentParams);
			KalturaLogger.debug('Translating [' + segmentUrl + '] to [' + buffer[0].url + ']');
			this.urlTranslations[segmentUrl] = buffer[0];
			this.urlTranslations[segmentUrl].used = true;
			newResult.push(buffer[0]);

			if(this.adCurOffset > this.adEndOffset){
				this.inAdSlot = false;
				KalturaLogger.debug('Ad finished cue-point[' + this.cuePoint.id + '] start[' + this.adStartOffset + '] end[' + this.adEndOffset + ']');
			}
			else{
				this.adCurOffset += curSegmentDuration;
			}
		}
			
		this.keepWatching();
		
		for(var segmentUrl in this.urlTranslations){
			if(!this.urlTranslations[segmentUrl].used){
				KalturaLogger.debug('Deleting [' + segmentUrl + '] from translations');
				delete this.urlTranslations[segmentUrl];
			}
		}

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
		var blackMediaKey = KalturaCache.getBlackMedia(this.encodingId);
		KalturaCache.touch(blackMediaKey, KalturaConfig.config.cache.blackMedia, function(){
			KalturaLogger.debug('Black media [' + This.encodingId + '] already stitched');
			var blackEncodingParamsKey = KalturaCache.getBlackEncodingParams(This.encodingId);
			KalturaCache.touch(blackEncodingParamsKey, KalturaConfig.config.cache.blackMedia);
		}, function(err){
			var blackHandledKey = KalturaCache.getBlackHandled(this.encodingId);
			KalturaCache.add(blackHandledKey, true, KalturaConfig.config.cache.blackHandled, function(){
				KalturaLogger.log('Stitching black media [' + This.encodingId + ']');
				This.manager.callPlayServerService('segment', 'stitchBlack', {encodingId: This.encodingId});
			}, function (err) {
				KalturaLogger.log('Black media [' + This.encodingId + '] already handled');
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
		this.manager.callPlayServerService('segment', 'stitch', segmentParams);
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
		KalturaCache.set(this.renditionManifestHandledKey, true, KalturaConfig.config.cache.renditionManifest);
		
		if(new Date().getTime() > (this.startTime + KalturaStreamWatcher.MINIMUM_RUN_PERIOD) && !this.trackerRequired){
			KalturaCache.del(this.renditionManifestHandledKey);
			KalturaLogger.log('Done');
			if(this.finishCallback && typeof this.finishCallback === 'function'){
				this.finishCallback();
			}
			return;
		}
		
		var This = this;
		this.manager.getHttpUrl(this.url, function(manifestContent){
			var newManifestContent = This.stitchManifest(manifestContent);
			if(newManifestContent){
				KalturaCache.set(This.trackerOutputKey, newManifestContent, KalturaConfig.config.cache.renditionManifest);
			}
		}, function(err){
			KalturaLogger.error('Failed to fetch manifest [' + This.url + ']: ' + err);
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
		
		KalturaLogger.debug('Parse segment entry [' + entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']');

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
				localPath = os.tmpdir() + '/' + KalturaUtils.getUniqueId();
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
		
		if(KalturaConfig.config.bin && KalturaConfig.config.bin.mediaInfoPath){
			kaltura.mediaInfo.bin = KalturaConfig.config.bin.mediaInfoPath;
		}
		
		kaltura.mediaInfo.parse(localPath, function(mediaInfo){

			encodingParams = kaltura.ffmpegParams.buildEncodingParams(mediaInfo, false, false);
			blackEncodingParams = kaltura.ffmpegParams.buildBlackInputParams(mediaInfo);

			This.encodingId = encodingParams.md5();
			KalturaCache.append(This.entryRequiredKey, '\n' + This.encodingId, null, function(err){
				KalturaLogger.log('Entry-Required key [' + This.entryRequiredKey + '] does not exist');
				KalturaCache.add(This.entryRequiredKey, This.encodingId, KalturaConfig.config.cache.entryHandled);
			});

			var encodingParamsKey = KalturaCache.getEncodingParams(This.encodingId);
			var mediaInfoKey = KalturaCache.getMediaInfo(This.encodingId);
			var blackEncodingParamsKey = KalturaCache.getBlackEncodingParams(This.encodingId);
			KalturaCache.set(mediaInfoKey, mediaInfo, KalturaConfig.config.cache.encodingParams);
			KalturaCache.set(encodingParamsKey, encodingParams, KalturaConfig.config.cache.encodingParams);
			KalturaCache.set(blackEncodingParamsKey, blackEncodingParams + ' ' + encodingParams, KalturaConfig.config.cache.encodingParams);
		});
	},

	
	/**
	 * Save sync-point data to cache
	 * @param entryId
	 * @param segment object {sequence, url, resolvedUrl, duration}
	 * @param syncPoint KalturaSyncPoint
	 */
	handleSyncPoint: function(entryId, segment, syncPoint){
		KalturaLogger.debug('Entry [' + entryId + '] segment [' + segment.sequence + ']');
		KalturaLogger.dir(syncPoint);

		var offsetInSegment = (syncPoint.pts - segment.pts) / 90;
		var absoluteOffset = syncPoint.offset;
		var segmentOffset = absoluteOffset - offsetInSegment;
		var segmentTimestamp = syncPoint.timestamp - offsetInSegment;
		
		this.elapsedTime = {
			sequence: segment.sequence,
    		duration: segment.duration,
			offset: segmentOffset,
			timestamp: segmentTimestamp // in milliseconds since 1970
		};
		
		KalturaCache.set(this.elapsedTimeKey, this.elapsedTime, KalturaConfig.config.cache.elapsedTime);
	},

	
	/**
	 * Parse cue-points and sync-points from segment metadata
	 * 
	 * @param entryId
	 * @param segment object {sequence, url, resolvedUrl, duration}
	 * @param buffer Array <segment>
	 */
	parseCuePoints: function(entryId, segment, buffer){
		var parsed = id3Reader.parseBuffer(buffer);
		KalturaLogger.debug('Entry [' + entryId + '] segment [' + segment.sequence + ']: ' + util.inspect(parsed));
		
		if(!parsed.id3tags.length){
			return;
		}

		segment.pts = parsed.videoPts ? parsed.videoPts : parsed.audioPts;
		for (var i = 0; i < parsed.id3tags.length; i++) {
			var id3tag = parsed.id3tags[i];
			if (id3tag.PTS && id3tag.TEXT && id3tag.TEXT.TEXT) {
				var cuePoint = JSON.parse(id3tag.TEXT.TEXT);
				cuePoint.pts = id3tag.PTS;
				if (cuePoint.objectType && cuePoint.objectType == 'KalturaSyncPoint') { 
					this.handleSyncPoint(entryId, segment, cuePoint);
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
		KalturaLogger.debug(manifestContent);
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
			
			result += '#EXTINF:' + (segment.duration / 1000).toFixed(3) + ',\n';
			result += segmentUrl + '\n';
		}
	
		for(var key in footers){
			var value = footers[key];
			result += '#' + key;
			if(value.length > 0)
				result += ':' + value;
			result += '\n';
		}
		
		KalturaLogger.debug(result);
		return result;
	}
};

/**
 * @service stream
 */
var KalturaStreamManager = function(){
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
	
	response.dir(params);
	
	this.callRestorableAction('stream', 'watchRendition', params);

	response.log('Handled');
	response.writeHead(200);
	response.end('OK');
};


/**
 * Restorable action, run as long as the entry watch is required
 * 
 * @param params {url, entryId, masterUrl}
 * @param finishCallback called when the watch is not needed anymore and the restoreable action could be unstored
 */
KalturaStreamManager.prototype.watchRendition = function(params, finishCallback){
	KalturaLogger.dir(params);
	new KalturaStreamWatcher(this, params, finishCallback);
};

module.exports.KalturaStreamManager = KalturaStreamManager;
