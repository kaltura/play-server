
var fs = require('fs');
var os = require('os');
var url = require('url');
var util = require('util');

var id3Reader = require('../../bin/Release/TsId3Reader.node');

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
	this.trackerOutputKeyWithAds = KalturaCache.getKey(KalturaCache.MANIFEST_CONTENT_KEY_PREFIX, [this.renditionId]);
	this.entryRequiredKey = KalturaCache.getKey(KalturaCache.ENTRY_REQUIRED_KEY_PREFIX, [params.entryId]);
	this.cuePointsKey = KalturaCache.getKey(KalturaCache.ENTRY_CUE_POINTS_KEY_PREFIX, [params.entryId]);
	this.elapsedTimeKey = KalturaCache.getKey(KalturaCache.ENTRY_ELAPSED_TIME_KEY_PREFIX, [params.entryId]);
	this.oldestSegmentTimeKey = KalturaCache.getKey(KalturaCache.OLDEST_SEGMENT_TIME_KEY_PREFIX, [params.entryId]);
	this.elapsedTime = {};
	this.cuePoints = {};
	this.segmentsHistoryLimit = KalturaConfig.config.cloud.segmentsHistoryLimit;
	this.segmentsHistory = {};
	this.urlTranslations = {};

	this.firstTime = true;
	this.startTime = new Date().getTime();
	this.trackerRequired = false;

	this.renditionManifestHandledKey = KalturaCache.getKey(KalturaCache.RENDITION_MANIFEST_HANDLED_KEY_PREFIX, [KalturaCache.getManifestId(params.url)]);
	
	this.url = params.url;
	this.lowestBitrate = params.lowestBitrate;
	this.entryId = params.entryId;
	this.partnerId = params.partnerId;
	this.masterUrl = params.masterUrl;
	this.firstManifestSegment = 0;
	this.latency = 0;
	
	this.watcherId = KalturaUtils.getUniqueId();
	
	var This = this;
	
	KalturaLogger.log('init stream watcher for entry [' + this.entryId +'] rendition [' + this.renditionId + '] watcher id [' + this.watcherId + ']');
	// if the process crashed and restored, the cache key might exist although no one is watching this manifest
	if(params.restored){
		this.getManifest();
	}
	else{
		KalturaCache.getMulti([this.renditionManifestHandledKey, this.entryRequiredKey], function(data){
			if(!data[This.renditionManifestHandledKey]){
				This.appendToEntryRequired(data[This.entryRequiredKey]);
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
				KalturaLogger.debug('Rendition [' + This.renditionId + '] entry [' + This.entryId + '] still required');
				This.trackerRequired = true;
				This.appendToEntryRequired(data);
				var encodingParamsKey = KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [This.renditionId]);
				var mediaInfoKey = KalturaCache.getKey(KalturaCache.MEDIA_INFO_KEY_PREFIX, [This.renditionId]);
				var blackEncodingParamsKey = KalturaCache.getKey(KalturaCache.BLACK_ENCODING_PARAMS_KEY_PREFIX, [This.renditionId]);
				KalturaCache.touch(mediaInfoKey, KalturaConfig.config.cache.encodingParams);
				KalturaCache.touch(encodingParamsKey, KalturaConfig.config.cache.encodingParams);
				KalturaCache.touch(blackEncodingParamsKey, KalturaConfig.config.cache.blackMedia);					
			}
			else{
				KalturaLogger.log('Rendition [' + This.renditionId + '] entry [' + This.entryId + '] not required any more');
				This.trackerRequired = false;
			}
		});
	},
	
	appendToEntryRequired: function(entryRequiredData){
		var This = this;
		var renditionIds = KalturaCache.extractEntryRequiredValue(entryRequiredData);
		var renditionExists = false;
		for(var i = 0; i < renditionIds.length; i++){ 
			if(renditionIds[i].trim() == this.renditionId){
				renditionExists = true;
			}
		}
		if(!renditionExists){
			var entryRequiredValue = KalturaCache.buildEntryRequiredValue(this.renditionId);
			KalturaLogger.log('Appending [' + this.renditionId + '] to entryRequired [' + this.entryRequiredKey + ']');
			KalturaCache.append(this.entryRequiredKey, entryRequiredValue, function(){
				KalturaLogger.log('Added to entry required [' + This.entryRequiredKey + '] : [' + This.renditionId + ']');
			}, function(err){
				KalturaLogger.error('Failed to append [' + This.entryRequiredKey + '] :' + err);
				KalturaCache.add(This.entryRequiredKey, entryRequiredValue, KalturaConfig.config.cache.entryRequired);
			});					
		}			
	},
	
	/**
	 * Load cue-points from cache
	 */
	loadCuePoints: function(callback){
		var This = this;
		KalturaCache.get(this.cuePointsKey, function(data){
			if(data){
				This.cuePoints = data;				
			}
			if(callback){
				callback();
			}
		}, function(err){
			if(callback){
				callback();
			}
		});
	},
	
	applyElapsedTimeToSegments: function(){
		if(this.elapsedTime && this.segmentsHistory[this.elapsedTime.sequence]){
			KalturaLogger.debug('Applying elapsed time to segments history for entry [' + this.entryId + '] rendition [' + this.renditionId + ']');
			var timestamp;
			var offset;
			
			timestamp = this.elapsedTime.timestamp;
			offset = this.elapsedTime.offset;
			for (var i = this.elapsedTime.sequence; this.segmentsHistory[i]; i--){
				this.segmentsHistory[i].timestamp = timestamp;
				this.segmentsHistory[i].offset = offset;
				if(this.segmentsHistory[i-1]){
					timestamp -= this.segmentsHistory[i-1].duration;
					offset -= this.segmentsHistory[i-1].duration;
				}
				else{
					KalturaLogger.debug('Segment history for index [' + (i-1) + '] is not defined setting offset/timestamp from current duration values');
					timestamp -= this.segmentsHistory[i].duration;
					offset -= this.segmentsHistory[i].duration;	
				}
			}

			timestamp = this.elapsedTime.timestamp;
			offset = this.elapsedTime.offset;
			for (var i = this.elapsedTime.sequence; this.segmentsHistory[i]; i++){
				this.segmentsHistory[i].timestamp = timestamp;
				this.segmentsHistory[i].offset = offset;
				timestamp += this.segmentsHistory[i].duration;
				offset += this.segmentsHistory[i].duration;				
			}
		}
		
		KalturaLogger.debug('Segments history ' + JSON.stringify(this.segmentsHistory));
	},
	
	initSegmentsHistory: function(manifest, startSegment){
		var This = this;
		var oldestSegment = null;
		var durationFromOldestSegment = 0;
		
		var currentFirstSegment = parseInt(manifest.headers['EXT-X-MEDIA-SEQUENCE']);
		KalturaLogger.debug('[' + This.uniqueLoopId + '] Last stitched firstManifestSegment: ' + this.firstManifestSegment + ' current first manifest segment: ' + currentFirstSegment);
		if(currentFirstSegment < this.firstManifestSegment && ((this.firstManifestSegment - currentFirstSegment) < manifest.segments.length)){
			KalturaLogger.log('[' + This.uniqueLoopId + '] Skipping stitch manifest for entry [' + this.entryId + '] and rendition [' + this.renditionId + ']');
			KalturaCache.touch(This.trackerOutputKeyWithAds, KalturaConfig.config.cache.renditionManifest);
			return false;
		}
		else{
			this.firstManifestSegment = currentFirstSegment;
			if(this.adStartSegment && this.inAdSlot && (this.firstManifestSegment + manifest.segments.length < this.adStartSegment)){
				KalturaLogger.log('[' + this.uniqueLoopId + '] Re-setting inAdSlot for entry [' + this.entryId + '] and rendition [' + this.renditionId + '], firstManifestSegment [' + this.firstManifestSegment + '] adStartSegment [' + this.adStartSegment + ']');
				this.inAdSlot = false;
			}
		}
		
		var lastSegmentSequence = null;
		if(manifest.segments.length > 0){						
			//set the oldest segment time in cache, cue points older than the oldest segment will
			//be deleted from cache
			oldestSegment = manifest.segments[0];
			for(var i = startSegment; i < manifest.segments.length; i++){
				lastSegmentSequence = manifest.segments[i].sequence;
				durationFromOldestSegment += manifest.segments[i].duration;
				
				//Calculate the latency based on the segments duration
				if(Math.ceil((durationFromOldestSegment/1000).toFixed(3)) < KalturaConfig.config.stream.latency)
					this.latency++;
				
				if(!this.segmentsHistory[lastSegmentSequence]){
					this.segmentsHistory[lastSegmentSequence] = manifest.segments[i];
				}				
			}
			
			for(var sequence in this.segmentsHistory){
				if(sequence < (lastSegmentSequence - this.segmentsHistoryLimit)){
					delete this.segmentsHistory[sequence];
				}
			}
		} else {
			KalturaLogger.log('[' + This.uniqueLoopId + '] No segments found, skipping stitch manifest for entry [' + this.entryId + '] and rendition [' + this.renditionId + ']');
			return false;	
		}

		this.parseSegmentWhenRequired(lastSegmentSequence, parseInt(Object.keys(this.segmentsHistory)[0]), lastSegmentSequence);
		this.applyElapsedTimeToSegments();

		if(oldestSegment && this.elapsedTime){
			var oldestSegmentTime = {
				offset: this.elapsedTime.offset - durationFromOldestSegment,
				timestamp: this.elapsedTime.timestamp - durationFromOldestSegment
			};
			KalturaLogger.log('[' + this.uniqueLoopId + '] oldestSegmentTime for entry [' + this.entryId + '] and rendition [' + this.renditionId + '] [' + JSON.stringify(oldestSegmentTime) + ']');
			KalturaCache.set(this.oldestSegmentTimeKey, oldestSegmentTime, KalturaConfig.config.cache.elapsedTime);
		}
		
		return true;
	},
	
	parseSegmentWhenRequired: function(currentSequence, firstSegmentsHistorySequence, lastSegmentsHistorySequence){
		var This = this;
		if(currentSequence < firstSegmentsHistorySequence){
			return;
		}
		var elapsedTimeSet = 0;
		if(this.elapsedTime && this.elapsedTime.sequence > firstSegmentsHistorySequence && this.elapsedTime.sequence <= lastSegmentsHistorySequence ){
			elapsedTimeSet = 1;
		}
		KalturaLogger.log('[' + This.uniqueLoopId + '] Before parseSegment rendition [' + this.renditionId + '] currentSequence [' + currentSequence + '] firstSegmentsHistorySequence [' + firstSegmentsHistorySequence + ']  lastSegmentsHistorySequence [' + lastSegmentsHistorySequence + '] elapsedTime [' + JSON.stringify(This.elapsedTime) + ']' + ' elapsedTimeSet [' + elapsedTimeSet + ']');
		if(this.firstTime || !elapsedTimeSet){
			this.parseSegment(this.segmentsHistory[currentSequence], function(){
				if(This.elapsedTime && This.elapsedTime.sequence >= firstSegmentsHistorySequence && This.elapsedTime.sequence <= lastSegmentsHistorySequence ){
					return;
				}
				else{
					currentSequence--;
					This.parseSegmentWhenRequired(currentSequence, firstSegmentsHistorySequence, lastSegmentsHistorySequence);
				}
			});
		}	
	},
	
	/**
	 * Read the segments URLs, replace them with ads if needed, store the manifest to cache
	 * @param manifestContent
	 */
	stitchManifest: function(manifestContent){
		var This = this;
		KalturaLogger.log('[' + This.uniqueLoopId + '] stitchManifest: lowest bitrate = ' + this.lowestBitrate + ' for entry [' + this.entryId + '] and rendition [' + this.renditionId + ']');
		this.cycleStartTime = new Date().getTime();

		this.verifyTrackingRequired();

		this.latency = 0;
		var manifest = this.parseM3U8(manifestContent);
		var startSegment = manifest.segments.length - this.segmentsHistoryLimit > 0 ? manifest.segments.length - this.segmentsHistoryLimit : 0;

		if(this.initSegmentsHistory(manifest, startSegment) === false){
			this.keepWatching();
			return null;
		}
		
		// if encoding was not defined yet by parsing the first ts, no ads could be ingested yet
		if(!this.encodingId){
			this.keepWatching();
			return null;
		}
		this.stitchBlack();
		
		var newResult = [];
		var buffer = [];
		var segmentsCount = Math.min( manifest.segments.length - 1, manifest.segments.length + 1 - this.latency );
		
		for(var segmentUrl in this.urlTranslations){
			this.urlTranslations[segmentUrl].used = false;
		}
		
		var preSegmentStitchParams = {};
		var postSegmentStitchParams = {};
		
		for(var segmentIndex = 0; segmentIndex <= segmentsCount; segmentIndex++){
			var resolveUrlAndContinue = function(){
				if(!parseInt(KalturaConfig.config.stream.useCdn)){
					buffer[0].url = buffer[0].resolvedUrl;
				}
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Append original segment [' + buffer[0].url + ']');
				newResult.push(buffer[0]);
			};
			
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Segment [' + manifest.segments[segmentIndex].sequence + '] URL [' + manifest.segments[segmentIndex].url + ']');
			
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
			if(buffer.length < 3)
				continue;

			while(buffer.length > 3)
				buffer.shift();
			
			// load buffer
			var currentSegmentUrl = buffer[0].url;

			// check whether we already mapped this buffer
			if(this.urlTranslations[currentSegmentUrl]){
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Translating from urlTranslations [' + currentSegmentUrl + '] to [' + this.urlTranslations[currentSegmentUrl].url + ']');
				this.urlTranslations[currentSegmentUrl].used = true;
				newResult.push(this.urlTranslations[currentSegmentUrl]);
				continue;
			}
			
			if(segmentIndex < startSegment){
				resolveUrlAndContinue();
				continue;
			}
			
			offsetStart = this.segmentsHistory[buffer[1].sequence] ? (this.segmentsHistory[buffer[1].sequence].offset ? this.segmentsHistory[buffer[1].sequence].offset : null) : null;
			offsetEnd = offsetStart ? offsetStart + buffer[1].duration : null;
			timestampStart = this.segmentsHistory[buffer[1].sequence] ? (this.segmentsHistory[buffer[1].sequence].timestamp ? this.segmentsHistory[buffer[1].sequence].timestamp : null) : null;
			timestampEnd = timestampStart ? timestampStart + buffer[1].duration : null;
			KalturaLogger.log('[' + This.uniqueLoopId + '] Stitch segment [' + buffer[1].sequence + '] URL [' + currentSegmentUrl + '] offset start [' + offsetStart + 
								'] offset end [' + offsetEnd + '] timestamp start [' + timestampStart + '] timestamp end [' + timestampEnd + ']  is inAdSlot [' + this.inAdSlot + ']');
			
			//TODO: temporary remove the optimization and add tracking to monitor if we were skipping ads because of it
			var missedAdStart = 1;
			if(!this.lastUsedSegment || buffer[0].sequence > this.lastUsedSegment || (this.lastUsedSegment - buffer[0].sequence) > manifest.segments.length){
				// update the last used segment
				this.lastUsedSegment = buffer[0].sequence;
				missedAdStart = 0;
			}

			// check whether we should start an ad
			if(!this.inAdSlot && ((offsetStart && offsetEnd) || (timestampStart && timestampEnd))){
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Checking cue points ...');
				for(var cuePointId in this.cuePoints){
					cuePoint = this.cuePoints[cuePointId];
					KalturaLogger.log('[' + This.uniqueLoopId + '] Checking cue point for partner [' + this.partnerId + '] entry [' + this.entryId + '] cuePoint [' + cuePointId + '] startTime [' + cuePoint.startTime + '] triggeredAt [' + cuePoint.triggeredAt + ']');
					// ad starts in first segment
					if( (cuePoint.startTime && offsetStart <= cuePoint.startTime && cuePoint.startTime <= offsetEnd) ||
						(cuePoint.triggeredAt && timestampStart <= cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 <= timestampEnd)){
						this.inAdSlot = true;
						this.cuePoint = cuePoint;
						if(cuePoint.startTime)
							this.adStartOffset = (cuePoint.startTime - offsetStart + buffer[0].duration) * 90;
						else
							this.adStartOffset = (cuePoint.triggeredAt*1000 - timestampStart + buffer[0].duration) * 90;
						this.adEndOffset = this.adStartOffset + cuePoint.duration * 90; 
						this.adCurOffset = 0;
						this.adStartSegment = buffer[0].sequence;
							
						KalturaLogger.log('[' + This.uniqueLoopId + '] Ad started cue-point [' + cuePointId + '] rendition [' + this.renditionId + '] start [' + this.adStartOffset + '] end [' + this.adEndOffset + '] partner [' + this.partnerId + '] entry [' + this.entryId + ']');
						KalturaLogger.debug('[' + This.uniqueLoopId + '] adCurOffset: ' + this.adCurOffset + ' adStartSegment: ' + this.adStartSegment);
						if(missedAdStart){
							KalturaLogger.debug('[' + This.uniqueLoopId + '] Alert: potentially missed ad start, last used segment [' + this.lastUsedSegment + '] current sequence [' + buffer[0].sequence + ']');
						}
						break;
					}
				}
			}
			

			// not part of ad -> just output it
			if(!this.inAdSlot || buffer[0].sequence < this.adStartSegment){
				resolveUrlAndContinue();
				continue;
			}
					
			var curSegmentDuration = buffer[0].duration * 90;
			var nextSegmentDuration = buffer[1].duration * 90;
			
			if(this.adCurOffset == 0){
				// create pre ad ts
				var preSegmentId = KalturaCache.getPreSegmentId(this.cuePoint.id, this.renditionId);
				preSegmentStitchParams = {
						buffer: [buffer[0].resolvedUrl, buffer[1].resolvedUrl, buffer[2].resolvedUrl],
						segmentId: preSegmentId,
						offset: this.adStartOffset
				};
			}

			if(this.adCurOffset + curSegmentDuration <= this.adEndOffset && this.adCurOffset + curSegmentDuration + nextSegmentDuration > this.adEndOffset){
				// create post ad ts
				var postSegmentId = KalturaCache.getPostSegmentId(this.cuePoint.id, this.renditionId);
				postSegmentStitchParams = {
						buffer: [buffer[0].resolvedUrl, buffer[1].resolvedUrl, buffer[2].resolvedUrl],
						segmentId: postSegmentId,
						offset: this.adEndOffset - this.adCurOffset
				};
			}

			if(this.adCurOffset > this.adEndOffset){
				// last segment
				outputEnd = 0;
			}
			else{
				outputEnd = this.adCurOffset + curSegmentDuration;
			}

			if(!parseInt(KalturaConfig.config.stream.useCdn)){
				buffer[0].url = buffer[0].resolvedUrl;
			}
			var stitchSegmentParams = {
				entryId: this.entryId, 
				cuePointId: this.cuePoint.id, 
				renditionId: this.renditionId, 
				segmentIndex: buffer[0].sequence - this.adStartSegment,
				outputStart: this.adCurOffset,
				outputEnd: outputEnd,
				adStart: this.adStartOffset,
				originalUrl: buffer[0].url
			};
			
			var tokens = {sessionId: '@SESSION_ID@', sessionStartTime: '@SESSION_START_TIME@', originDc: '@ORIGIN_DC@'};
			
			buffer[0].url = this.manager.getPlayServerUrl('media', 'segment', this.partnerId, tokens, stitchSegmentParams);
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Translating [' + currentSegmentUrl + '] to [' + buffer[0].url + ']');
			this.urlTranslations[currentSegmentUrl] = buffer[0];
			this.urlTranslations[currentSegmentUrl].used = true;
			newResult.push(buffer[0]);

			if(this.adCurOffset > this.adEndOffset){
				this.inAdSlot = false;
				KalturaLogger.log('[' + This.uniqueLoopId + '] Ad finished cue-point[' + this.cuePoint.id + '] start[' + this.adStartOffset + '] end[' + this.adEndOffset + ']');
			}
			else{
				this.adCurOffset += curSegmentDuration;
				KalturaLogger.log('[' + This.uniqueLoopId + '] Cue-point [' + this.cuePoint.id + '] ad current offset [' + this.adCurOffset + ']');
			}
		}
		
		var newManifestContent = this.buildM3U8(manifest.headers, newResult, manifest.footers);
		
		for(var segmentUrl in this.urlTranslations){
			if(!this.urlTranslations[segmentUrl].used){
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Deleting [' + segmentUrl + '] from translations');
				delete this.urlTranslations[segmentUrl];
			}
		}
		
		var stitchingSegmentsCount = 0;
		if(preSegmentStitchParams.segmentId){
			stitchingSegmentsCount++;
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Stitching pre segment for segment id [' + preSegmentStitchParams.segmentId +'] stitchingSegmentsCount [' + stitchingSegmentsCount + ']' );
			this.stitchSegment(preSegmentStitchParams.buffer, preSegmentStitchParams.segmentId, preSegmentStitchParams.offset, 'left', function(data){
				stitchingSegmentsCount--;
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Done stitching pre segment for segment id [' + preSegmentStitchParams.segmentId +'] stitchingSegmentsCount [' + stitchingSegmentsCount + ']' );
				if(newManifestContent && !stitchingSegmentsCount){
					KalturaLogger.log('[' + This.uniqueLoopId + '] Setting ads manifest content for entry [' + This.entryId + '] callback after stitch pre');
					KalturaCache.set(This.trackerOutputKeyWithAds, newManifestContent, KalturaConfig.config.cache.renditionManifest);		
					This.keepWatching();
				}	
			});
		}
		
		if(postSegmentStitchParams.segmentId){
			stitchingSegmentsCount++;
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Stitching post segment for segment id [' + postSegmentStitchParams.segmentId +'] stitchingSegmentsCount [' + stitchingSegmentsCount + ']' );
			this.stitchSegment(postSegmentStitchParams.buffer, postSegmentStitchParams.segmentId, postSegmentStitchParams.offset, 'right', function(data){
				stitchingSegmentsCount--;
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Done stitching post segment for segment id [' + postSegmentStitchParams.segmentId +'] stitchingSegmentsCount [' + stitchingSegmentsCount + ']' );
				if(newManifestContent && !stitchingSegmentsCount){
					KalturaLogger.log('[' + This.uniqueLoopId + '] Setting ads manifest content for entry [' + This.entryId + '] callback after stitch post');
					KalturaCache.set(This.trackerOutputKeyWithAds, newManifestContent, KalturaConfig.config.cache.renditionManifest);
					This.keepWatching();
				}	
			});
		}

		// build the final manifest		
		if(newManifestContent && !stitchingSegmentsCount){
			KalturaLogger.log('[' + This.uniqueLoopId + '] Setting ads manifest content for entry [' + This.entryId + ']');
			KalturaCache.set(This.trackerOutputKeyWithAds, newManifestContent, KalturaConfig.config.cache.renditionManifest);
			This.keepWatching();
		}					
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
		var blackMediaKey = KalturaCache.getKey(KalturaCache.BLACK_MEDIA_KEY_PREFIX, [this.renditionId]);
		KalturaCache.touch(blackMediaKey, KalturaConfig.config.cache.blackMedia, function(){
			KalturaLogger.debug('Black media [' + This.renditionId + '] already stitched');
			var blackEncodingParamsKey = KalturaCache.getKey(KalturaCache.BLACK_ENCODING_PARAMS_KEY_PREFIX, [This.renditionId]);
			KalturaCache.touch(blackEncodingParamsKey, KalturaConfig.config.cache.blackMedia);
		}, function(err){
			var blackHandledKey = KalturaCache.getKey(KalturaCache.BLACK_HANDLED_KEY_PREFIX, [This.renditionId]);
			KalturaCache.add(blackHandledKey, true, KalturaConfig.config.cache.blackMedia, function(){
				KalturaLogger.log('Stitching black media [' + This.renditionId + ']');
				This.manager.callPlayServerService('segment', 'stitchBlack', This.partnerId, {renditionId: This.renditionId});
			}, function (err) {
				KalturaLogger.debug('Black media [' + This.renditionId + '] already handled');
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
	stitchSegment: function(segments, segmentId, offset, portion, callback){
		var segmentParams = {
			segmentId: segmentId,
			url1: segments[0],
			url2: segments[1],
			url3: segments[2],
			offset: offset, 
			portion: portion
		};
		this.manager.callPlayServerService('segment', 'stitch', this.partnerId, segmentParams, null, callback);
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
		this.uniqueLoopId = KalturaUtils.getUniqueId();
		KalturaLogger.log('[' + this.uniqueLoopId + '] getting manifest for [' + this.entryId + '] rendition [' + this.renditionId + '] watcher id [' + this.watcherId + ']');
		KalturaCache.set(this.renditionManifestHandledKey, true, KalturaConfig.config.cache.watcherHandled);
		
		//verify if entry is still required
		this.verifyTrackingRequired();

		if(new Date().getTime() > (this.startTime + KalturaStreamWatcher.MINIMUM_RUN_PERIOD) && !this.trackerRequired){
			KalturaCache.del(this.renditionManifestHandledKey);
			KalturaLogger.log('Done ' + this.entryId);
			if(this.finishCallback && typeof this.finishCallback === 'function'){
				this.finishCallback();
			}
			return;
		}

		var This = this;
		KalturaUtils.getHttpUrl(this.url, null, function(manifestContent){
			KalturaLogger.log('[' + This.uniqueLoopId + '] Manifest fetched [' + This.entryId + '] [' + This.url + ']');
			
			This.loadCuePoints(function(){
				KalturaLogger.log('[' + This.uniqueLoopId + '] Stitch manifest [' + This.entryId + '] rendition [' + This.renditionId + '] elapsedTime [' + JSON.stringify(This.elapsedTime) + ']');
				This.stitchManifest(manifestContent);
			});
		}, function(err){
			This.cycleStartTime = new Date().getTime();
			KalturaLogger.error('[' + This.uniqueLoopId + '] Failed to fetch manifest [' + This.url + ']: ' + err);
			This.keepWatching();
		});
	},

	/**
	 * Fetch the segment from the cdn an parse its metadata
	 */
	parseSegment: function(segment, callback){		
		KalturaLogger.log('[' + this.uniqueLoopId + '] Parse segment entry [' + this.entryId + '] rendition [' + this.renditionId +'] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']');

		parsedUrl = url.parse(segment.resolvedUrl);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};

		var This = this;
		var httpModule = KalturaUtils.getHttpModuleByProtocol(parsedUrl.protocol);
		var request = httpModule.request(options, function(response) {
			if (response.statusCode != 200) {
				KalturaLogger.error('[' + This.uniqueLoopId + '] Parse segment entry [' + this.entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']: Invalid http status: ' + response.statusCode);
				return;
			}

			var localPath = null;
			if(This.firstTime){				
				localPath = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();
				KalturaLogger.log('[' + This.uniqueLoopId + '] Saving segment entry [' + This.entryId + '] segment [' + segment.sequence + ']  url [' + segment.resolvedUrl + '] in [' + localPath +']');
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
				
				This.parseCuePoints(This.entryId, segment, Buffer.concat(buffers));
				if(callback){
					callback();
				}				
			});
		});

		request.on('error', function(e) {
			KalturaLogger.error('[' + This.uniqueLoopId + '] Parse segment entry [' + This.entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']: http error: ' + e.message);
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

			This.encodingId = KalturaCache.getEncodingId(encodingParams);
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Encoding params for rendition [' + This.renditionId + '] and encodingId [ ' + This.encodingId + '] from file [' + localPath + ']: ' + encodingParams);
			
			var encodingParamsKey = KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [This.renditionId]);
			var mediaInfoKey = KalturaCache.getKey(KalturaCache.MEDIA_INFO_KEY_PREFIX, [This.renditionId]);
			var blackEncodingParamsKey = KalturaCache.getKey(KalturaCache.BLACK_ENCODING_PARAMS_KEY_PREFIX, [This.renditionId]);
			KalturaCache.set(mediaInfoKey, mediaInfo, KalturaConfig.config.cache.encodingParams);
			KalturaCache.set(encodingParamsKey, encodingParams, KalturaConfig.config.cache.encodingParams);
			KalturaCache.set(blackEncodingParamsKey, blackEncodingParams + ' ' + encodingParams, KalturaConfig.config.cache.blackMedia);
		});
	},

	
	/**
	 * Save sync-point data to cache
	 * @param entryId
	 * @param segment object {sequence, url, resolvedUrl, duration}
	 * @param syncPoint KalturaSyncPoint
	 */
	handleSyncPoint: function(entryId, segment, syncPoint){
		KalturaLogger.log('[' + this.uniqueLoopId + '] Entry [' + entryId + '] segment [' + segment.sequence + '] segment pts [' + segment.pts + ']');
		//KalturaLogger.debug('[' + this.uniqueLoopId + '] ' + JSON.stringify(syncPoint));

		//var offsetInSegment = (syncPoint.pts - segment.pts) / 90;
		//var segmentOffset = syncPoint.offset - offsetInSegment;
		//var segmentTimestamp = syncPoint.timestamp - offsetInSegment;
		var segmentTimestamp = segment.pts / 90;

		this.elapsedTime = {
			sequence: segment.sequence,
    			duration: segment.duration,
			offset: segmentTimestamp,
			timestamp: segmentTimestamp // in milliseconds since 1970
		};
		
		if(this.lowestBitrate){
			KalturaCache.set(this.elapsedTimeKey, this.elapsedTime, KalturaConfig.config.cache.elapsedTime);
		}		
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
		KalturaLogger.log('[' + this.uniqueLoopId + '] Entry [' + entryId + '] segment [' + segment.sequence + ']');
		
		//if(!parsed.id3tags.length){
		//	return;
		//}

		segment.pts = parsed.videoPts ? parsed.videoPts : parsed.audioPts;
		//for (var i = 0; i < parsed.id3tags.length; i++) {
		//	var id3tag = parsed.id3tags[i];
		//	if (id3tag.PTS && id3tag.TEXT && id3tag.TEXT.TEXT) {
		//		var cuePoint = JSON.parse(id3tag.TEXT.TEXT);
		//		cuePoint.pts = id3tag.PTS;
		//		if (cuePoint.objectType && cuePoint.objectType == 'KalturaSyncPoint') { 
					this.handleSyncPoint(entryId, segment, null);
		//		}
		//	}
		//}
	},
	
	
	/**
	 * Parse m3u8 manifest
	 * @param manifestContent
	 * @returns object {headers, segments, footers}
	 */
	parseM3U8 : function(manifestContent){
		KalturaLogger.debug('[' + this.uniqueLoopId + '] ' + manifestContent);
		var manifest = {
			headers: {},
			segments: [],
			footers: {}
		};
		
		var segmentInfo = {};
		var lastSequenceNum = null;
		var extMediaSequence = null;
		var skipFirstSegment = false; //skip first segment to avoid 404 errors on ts
		var m3u8Lines = manifestContent.split('\n');
		for(var i = 0; i < m3u8Lines.length; i++){
			var m3u8Line = m3u8Lines[i].trim();
			if(m3u8Line.length == 0)
				continue;
			
			if(m3u8Line[0] != '#'){
				if(!skipFirstSegment){
					skipFirstSegment = true;
					continue;
				}
				if(lastSequenceNum == null){
					extMediaSequence = manifest.headers['EXT-X-MEDIA-SEQUENCE'] * 1;
					lastSequenceNum = extMediaSequence;
				}
				
				segmentInfo.url = m3u8Line;
				segmentInfo.resolvedUrl = url.resolve(this.url, m3u8Line);
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

				case 'EXT-X-MEDIA-SEQUENCE':
					value = (parseInt(value) + 1).toString();
					
					manifest.headers[key] = value;
					break;	
					
				default:
					manifest.headers[key] = value;
			}
		}
		
		KalturaLogger.debug('[' + this.uniqueLoopId + '] Manifest after parse: ' + JSON.stringify(manifest));
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
			
			KalturaLogger.debug('[' + this.uniqueLoopId + '] Append segment [' + segment.sequence + '] duration [' + segment.duration + '] URL: ' + segmentUrl);
			
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
		
		KalturaLogger.debug('[' + this.uniqueLoopId + '] ' + result);
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
	params = this.parsePlayServerParams(response, params, ['url', 'entryId', 'masterUrl', 'partnerId']);
	if(!params)
		return;
	
	response.dir(params);
	
	this.callRestorableAction('stream', 'watchRendition', params);

	response.debug('Handled');
	this.okResponse(response, 'OK', 'text/plain');
};


/**
 * Restorable action, run as long as the entry watch is required
 * 
 * @param params {url, entryId, masterUrl}
 * @param finishCallback called when the watch is not needed anymore and the restoreable action could be unstored
 */
KalturaStreamManager.prototype.watchRendition = function(params, finishCallback){
	KalturaLogger.log('watch Rendition for entry ' + params.entryId);
	KalturaLogger.dir(params);
	new KalturaStreamWatcher(this, params, finishCallback);
};

module.exports.KalturaStreamManager = KalturaStreamManager;
