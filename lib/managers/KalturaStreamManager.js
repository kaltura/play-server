var fs = require('fs');
var os = require('os');
var util = require('util');

var id3Reader = require('../../bin/Release/TsId3Reader.node');

var kaltura = module.exports = require('../KalturaManager');
kaltura.mediaInfo = require('../media/KalturaMediaInfo');
kaltura.ffmpegParams = require('../media/KalturaFfmpegParams');
kaltura.m3u8Parser = require('../protocol/KalturaM3U8Parser');


/**
 * Stream watcher, instantiated per rendition manifest
 * Stream watcher is responsible to pull the original manifest and build a stitched manifest.
 * The manifest is saved in cache.
 * 
 * The stream watcher will also trigger filler ts preparation, as well as pre and post ad segments preparation.
 * 
 * The watcher is responsible to make sure that all the data required for the stitching of this rendition is available in cache:
 * - encoding params
 * - media info
 * - ui conf
 * - filler media
 * 
 * 
 * @param manager KalturaStreamManager
 * @param params {url, entryId, masterUrl}
 * @param finishCallback called when watching is not required anymore
 */
var KalturaStreamWatcher = function(manager, params, finishCallback){
	this.manager = manager;
	this.finishCallback = finishCallback;
	
	this.renditionId = KalturaCache.getManifestId(params.url);
	this.uiConfConfigId = params.uiConfConfigId;
	this.url = params.url;
	this.lowestBitrate = params.lowestBitrate;
	this.entryId = params.entryId;
	this.partnerId = params.partnerId;
	this.masterUrl = params.masterUrl;
	
	this.elapsedTime = {};
	this.cuePoints = {};
	this.segmentsHistoryLimit = KalturaConfig.config.cloud.segmentsHistoryLimit;
	this.segmentsHistory = {};
	this.urlTranslations = {};
	this.firstTime = true;
	this.startTime = new Date().getTime();
	this.trackerRequired = false;
	this.firstManifestSegment = 0;
	this.latency = 0;	
	this.watcherId = KalturaUtils.getUniqueId();
	this.uiConfConfig = {};
	this.encodingId = null;
	this.cuePoint = null;
	this.maxSegmentDuration = 0;
	
	//memcache keys
	this.renditionManifestContentKey = KalturaCache.getKey(KalturaCache.MANIFEST_CONTENT_KEY_PREFIX, [this.renditionId, this.uiConfConfigId]);
	this.entryRequiredKey = KalturaCache.getKey(KalturaCache.ENTRY_REQUIRED_KEY_PREFIX, [this.entryId]);
	this.renditionManifestHandledKey = KalturaCache.getKey(KalturaCache.RENDITION_MANIFEST_HANDLED_KEY_PREFIX, [this.renditionId, this.uiConfConfigId]);
	this.cuePointsKey = KalturaCache.getKey(KalturaCache.ENTRY_CUE_POINTS_KEY_PREFIX, [this.entryId]);
	this.elapsedTimeKey = KalturaCache.getKey(KalturaCache.ENTRY_ELAPSED_TIME_KEY_PREFIX, [this.entryId]);
	this.oldestSegmentTimeKey = KalturaCache.getKey(KalturaCache.OLDEST_SEGMENT_TIME_KEY_PREFIX, [this.entryId]);
	this.encodingParamsKey = KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [this.renditionId]);
	this.mediaInfoKey = KalturaCache.getKey(KalturaCache.MEDIA_INFO_KEY_PREFIX, [this.renditionId]);
	this.fillerEncodingParamsKey = KalturaCache.getKey(KalturaCache.FILLER_ENCODING_PARAMS_KEY_PREFIX, [this.renditionId, this.uiConfConfigId]);
	this.fillerMediaKey = KalturaCache.getKey(KalturaCache.FILLER_MEDIA_KEY_PREFIX, [this.renditionId, this.uiConfConfigId]);
	this.fillerHandledKey = KalturaCache.getKey(KalturaCache.FILLER_HANDLED_KEY_PREFIX, [this.renditionId, this.uiConfConfigId]);
	this.uiConfConfigKey = KalturaCache.getKey(KalturaCache.UI_CONF_CONFIG_KEY_PREFIX, [this.uiConfConfigId]);
	
	var This = this;
	
	KalturaLogger.log('init stream watcher for entry [' + this.entryId +'] rendition [' + this.renditionId + '] watcher id [' + this.watcherId + ']');
	// if the process crashed and restored, the cache key might exist although no one is watching this manifest
	if(params.restored){
		KalturaCache.get(this.uiConfConfigKey, function(data){
			if(data){
				This.uiConfConfig = data;
			}
			This.getManifest();
		});		
	}
	else{
		KalturaCache.getMulti([this.renditionManifestHandledKey, this.entryRequiredKey, this.uiConfConfigKey], function(data){
			if(!data[This.renditionManifestHandledKey]){
				if([data[This.uiConfConfigKey]]){
					This.uiConfConfig = data[This.uiConfConfigKey];
				}
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
	finishCallback: null,

	/**
	 * Check cache to see if entry still required
	 * In case the entry is required update expiration of all relevant rendition info in cache
	 */
	verifyTrackingRequired: function(){
		var This = this;
		KalturaCache.get(this.entryRequiredKey, function(data){
			if(data && (data.indexOf(This.renditionId) != -1)){
				KalturaLogger.debug('Rendition [' + This.renditionId + '] entry [' + This.entryId + '] still required');
				This.trackerRequired = true;
				This.appendToEntryRequired(data);
				KalturaCache.touch(This.mediaInfoKey, KalturaConfig.config.cache.encodingParams);
				KalturaCache.touch(This.encodingParamsKey, KalturaConfig.config.cache.encodingParams);
				KalturaCache.touch(This.fillerEncodingParamsKey, KalturaConfig.config.cache.fillerMedia);
				KalturaCache.touch(This.uiConfConfigKey, KalturaConfig.config.cache.fillerMedia);
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
	
	/**
	 * Set timestamp and offset on all the segments in segmentHistory array according to the id3 tags parsed for one of the segments in the array
	 */
	applyElapsedTimeToSegments: function(){
		if(this.elapsedTime && this.segmentsHistory[this.elapsedTime.sequence]){
			KalturaLogger.debug('[' + this.uniqueLoopId + '] Applying elapsed time to segments history for entry [' + this.entryId + '] rendition [' + this.renditionId + ']');
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
					KalturaLogger.debug('[' + this.uniqueLoopId + '] Segment history for index [' + (i-1) + '] is not defined setting offset/timestamp from current duration values');
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
		
		KalturaLogger.debug('[' + this.uniqueLoopId + '] Segments history ' + JSON.stringify(this.segmentsHistory));
	},
	
	/**
	 * Set segments history array
	 */
	initSegmentsHistory: function(manifest, startSegment){
		var This = this;
		var oldestSegment = null;
		var durationFromOldestSegment = 0;
		
		var currentFirstSegment = parseInt(manifest.headers['EXT-X-MEDIA-SEQUENCE']);
		KalturaLogger.debug('[' + This.uniqueLoopId + '] Last stitched firstManifestSegment: ' + this.firstManifestSegment + ' current first manifest segment: ' + currentFirstSegment);
		if(currentFirstSegment < this.firstManifestSegment && ((this.firstManifestSegment - currentFirstSegment) < manifest.segments.length)){
			KalturaLogger.log('[' + This.uniqueLoopId + '] Skipping stitch manifest for entry [' + this.entryId + '] and rendition [' + this.renditionId + ']');
			KalturaCache.touch(This.renditionManifestContentKey, KalturaConfig.config.cache.renditionManifest);
			return false;
		}
		else{
			this.firstManifestSegment = currentFirstSegment;
			if(this.adStartSegment && this.inAdSlot && (this.firstManifestSegment + manifest.segments.length < this.adStartSegment)){
				KalturaLogger.log('[' + this.uniqueLoopId + '] Re-setting inAdSlot for entry [' + this.entryId + '] and rendition [' + this.renditionId + '], firstManifestSegment ['
					+ this.firstManifestSegment + '] adStartSegment [' + this.adStartSegment + ']');
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
	
	/**
	 * Invoke id3 tags parsing from the segment in case the current elapsed time sequence is not within segments history array
	 */
	parseSegmentWhenRequired: function(currentSequence, firstSegmentsHistorySequence, lastSegmentsHistorySequence){
		var This = this;
		if(currentSequence < firstSegmentsHistorySequence){
			return;
		}
		var elapsedTimeSet = 0;
		if(this.elapsedTime && this.elapsedTime.sequence > firstSegmentsHistorySequence && this.elapsedTime.sequence <= lastSegmentsHistorySequence ){
			elapsedTimeSet = 1;
		}
		KalturaLogger.log('[' + This.uniqueLoopId + '] Before parseSegment rendition [' + this.renditionId + '] currentSequence [' + currentSequence + '] firstSegmentsHistorySequence [' + firstSegmentsHistorySequence 
				+ ']  lastSegmentsHistorySequence [' + lastSegmentsHistorySequence + '] elapsedTime [' + JSON.stringify(This.elapsedTime) + ']' + ' elapsedTimeSet [' + elapsedTimeSet + ']');
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
		KalturaLogger.log('[' + This.uniqueLoopId + '] stitchManifest: lowest bitrate = ' + this.lowestBitrate + ' for entry [' + this.entryId + '] and rendition [' + this.renditionId + '] manifest: ' + manifestContent);
		
		this.cycleStartTime = new Date().getTime();
		var newResult = [];
		var buffer = [];
		this.latency = 0;
		var preSegmentStitchParams = {};
		var postSegmentStitchParams = {};
		
		this.verifyTrackingRequired();
				
		var manifest = kaltura.m3u8Parser.parseM3U8(manifestContent, this.url);
		this.maxSegmentDuration = parseInt(manifest.headers['EXT-X-TARGETDURATION']);
		KalturaLogger.debug('[' + this.uniqueLoopId + '] Manifest after parse: ' + JSON.stringify(manifest));
		
		var startSegment = Math.max(manifest.segments.length - this.segmentsHistoryLimit , 0 );
		if(this.initSegmentsHistory(manifest, startSegment) === false
			|| !this.encodingId ){// if encoding was not defined yet by parsing the first ts, no ads could be ingested yet){
			this.keepWatching();
			return null;
		}

		this.stitchFiller();
		
		var segmentsCount = Math.min( manifest.segments.length - 1, manifest.segments.length + 1 - this.latency );		
		this.initUrlTranslations();
				
		for(var segmentIndex = 0; segmentIndex <= segmentsCount; segmentIndex++){
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Segment [' + manifest.segments[segmentIndex].sequence + '] URL [' + manifest.segments[segmentIndex].url + ']');
			
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
			if(buffer.length < 3)
				continue;
			while(buffer.length > 3)
				buffer.shift();
			
			var currentSegmentUrl = buffer[0].url;
			// check whether we already mapped this buffer
			if(this.urlTranslations[currentSegmentUrl]){
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Translating from urlTranslations [' + currentSegmentUrl + '] to [' + this.urlTranslations[currentSegmentUrl].url + ']');
				this.urlTranslations[currentSegmentUrl].used = true;
				newResult.push(this.urlTranslations[currentSegmentUrl]);
				continue;
			}
			
			if(segmentIndex < startSegment){
				this.resolveSegmentUrl(buffer);
				newResult.push(buffer[0]);
				continue;
			}
			
			offsetStart = this.segmentsHistory[buffer[1].sequence] ? (this.segmentsHistory[buffer[1].sequence].offset ? this.segmentsHistory[buffer[1].sequence].offset : null) : null;
			offsetEnd = offsetStart ? offsetStart + buffer[1].duration : null;
			timestampStart = this.segmentsHistory[buffer[1].sequence] ? (this.segmentsHistory[buffer[1].sequence].timestamp ? this.segmentsHistory[buffer[1].sequence].timestamp : null) : null;
			timestampEnd = timestampStart ? timestampStart + buffer[1].duration : null;
			
			KalturaLogger.log('[' + This.uniqueLoopId + '] Stitch segment [' + buffer[1].sequence + '] URL [' + currentSegmentUrl + '] offset start [' + offsetStart + 
								'] offset end [' + offsetEnd + '] timestamp start [' + timestampStart + '] timestamp end [' + timestampEnd + ']  is inAdSlot [' + this.inAdSlot + ']');

			// check whether we should start an ad
			if(!this.inAdSlot && ((offsetStart && offsetEnd) || (timestampStart && timestampEnd))){
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Checking cue points ...');
				for(var cuePointId in this.cuePoints){
					if(this.checkAndInitAdStart(this.cuePoints[cuePointId], buffer, offsetStart, offsetEnd, timestampStart, timestampEnd)){
						break;
					}
				}
			}
			
			// not part of ad -> just output it
			if(!this.inAdSlot || buffer[0].sequence < this.adStartSegment){
				this.resolveSegmentUrl(buffer);
				newResult.push(buffer[0]);
				continue;
			}
					
			var curSegmentDuration = buffer[0].duration * 90;
			var nextSegmentDuration = buffer[1].duration * 90;
			
			if(this.adCurOffset == 0){
				preSegmentStitchParams = this.buildPreSegmentStitchParams(buffer);
			}
			if(this.adCurOffset + curSegmentDuration <= this.adEndOffset && this.adCurOffset + curSegmentDuration + nextSegmentDuration > this.adEndOffset){
				postSegmentStitchParams = this.buildPostSegmentStitchParams(buffer);
			}
	
			buffer[0].url = this.buildStitchedSegmentUrl(buffer, curSegmentDuration);			
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

		if (newResult.length > 0 ) {
			var newManifestContent = kaltura.m3u8Parser.buildM3U8(manifest.headers, newResult, manifest.footers);
			KalturaLogger.debug('[' + this.uniqueLoopId + '] newManifestContent: ' + newManifestContent);
			this.clearUnusedUrlTranslations();

			this.saveNewManifest(newManifestContent, [preSegmentStitchParams, postSegmentStitchParams]);
		}
	},

	/**
	 * Init urlTranslations buffer
	 * 
	 */
	initUrlTranslations: function(){
		for(var segmentUrl in this.urlTranslations){
			this.urlTranslations[segmentUrl].used = false;
		}
	},
	
	/**
	 * Delete unused segments from url translations buffer
	 * 
	 */
	clearUnusedUrlTranslations: function(){
		for(var segmentUrl in this.urlTranslations){
			if(!this.urlTranslations[segmentUrl].used){
				KalturaLogger.debug('[' + this.uniqueLoopId + '] Deleting [' + segmentUrl + '] from translations');
				delete this.urlTranslations[segmentUrl];
			}
		}
	},
	
	resolveSegmentUrl: function(buffer){
		if(!parseInt(KalturaConfig.config.stream.useCdn)){
			buffer[0].url = buffer[0].resolvedUrl;
		}
		KalturaLogger.debug('[' + this.uniqueLoopId + '] Append original segment [' + buffer[0].url + ']');
	},
	
	/**
	 * Construct ad segment URL 
	 */
	buildStitchedSegmentUrl: function(buffer, curSegmentDuration){
		var outputEnd;
		if(!parseInt(KalturaConfig.config.stream.useCdn)){
			buffer[0].url = buffer[0].resolvedUrl;
		}			
		if(this.adCurOffset > this.adEndOffset){				
			outputEnd = 0; // last segment
		}
		else{
			outputEnd = this.adCurOffset + curSegmentDuration;
		}
		var stitchSegmentParams = {
				entryId: this.entryId, 
				cuePointId: this.cuePoint.id, 
				renditionId: this.renditionId, 
				segmentIndex: buffer[0].sequence - this.adStartSegment,
				outputStart: this.adCurOffset,
				outputEnd: outputEnd,
				adStart: this.adStartOffset,
				originalUrl: buffer[0].url,
				uiConfConfigId: this.uiConfConfigId,
				cuePointDuration: this.cuePoint.duration,
				maxSegmentDuration: this.maxSegmentDuration
			};
			
		var tokens = {sessionId: '@SESSION_ID@', sessionStartTime: '@SESSION_START_TIME@', originDc: '@ORIGIN_DC@'};			
		var url = this.manager.getPlayServerUrl('media', 'segment', this.partnerId, tokens, stitchSegmentParams);
		return url;
	},

	buildPreSegmentStitchParams: function(buffer){
		return this.buildSegmentStitchParams(buffer,
			KalturaCache.getPreSegmentId(this.cuePoint.id, this.renditionId),
			this.adStartOffset,
			'left');

	},

	buildPostSegmentStitchParams: function(buffer){
		return this.buildSegmentStitchParams(buffer,
			KalturaCache.getPostSegmentId(this.cuePoint.id, this.renditionId),
			this.adEndOffset - this.adCurOffset,
			segmentStitchParams.portion = 'right');
	},

	buildSegmentStitchParams: function(buffer, post, segmentId, offset, portion){
		var segmentStitchParams = {
			buffer: [buffer[0].resolvedUrl, buffer[1].resolvedUrl, buffer[2].resolvedUrl]	
		};
		segmentStitchParams.segmentId = segmentId;
		segmentStitchParams.offset = offset;
		segmentStitchParams.portion = portion;
		return segmentStitchParams;
	},
	
	/**
	 * Check if cue point should start in the given segments buffer
	 * 
	 * @param cuePoint
	 * @param buffer
	 * @param offsetStart
	 * @param offsetEnd
	 * @param timestampStart
	 * @param timestampEnd
	 */
	checkAndInitAdStart: function(cuePoint, buffer, offsetStart, offsetEnd, timestampStart, timestampEnd){
		KalturaLogger.log('[' + this.uniqueLoopId + '] Checking cue point for partner [' + this.partnerId + '] entry [' + this.entryId + '] cuePoint [' + cuePoint.id + '] startTime [' + cuePoint.startTime + '] triggeredAt [' + cuePoint.triggeredAt + ']');
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
				
			KalturaLogger.log('[' + this.uniqueLoopId + '] Ad started cue-point [' + cuePoint.id + '] rendition [' + this.renditionId + '] start [' + this.adStartOffset + '] end [' + this.adEndOffset 
					+ '] partner [' + this.partnerId + '] entry [' + this.entryId + '] adCurOffset [' + this.adCurOffset + '] adStartSegment [' + this.adStartSegment +']');
			return true;
		}
		
		return false;
	
	},
	
	/**
	 * Save manifest to cache after pre/post segments are ready
	 */
	saveNewManifest: function(newManifestContent, prePostSegments){
		var This = this;
		var stitchingSegmentsCount = 0;
		
		for(var i=0; i<prePostSegments.length; i++ ){
			if(prePostSegments[i].segmentId){
				stitchingSegmentsCount++;
				KalturaLogger.debug('[' + This.uniqueLoopId + '] Stitching ' + prePostSegments[i].portion + ' segment for segment id [' + prePostSegments[i].segmentId +'] stitchingSegmentsCount [' + stitchingSegmentsCount + ']' );
				this.stitchSegment(prePostSegments[i].buffer, prePostSegments[i].segmentId, prePostSegments[i].offset, prePostSegments[i].portion, function(data){
					stitchingSegmentsCount--;
					KalturaLogger.debug('[' + This.uniqueLoopId + '] Done stitching segment, stitchingSegmentsCount [' + stitchingSegmentsCount + ']' );
					if(newManifestContent && !stitchingSegmentsCount){
						KalturaLogger.log('[' + This.uniqueLoopId + '] Setting ads manifest content for entry [' + This.entryId + '] callback after stitchSegment');
						KalturaCache.set(This.renditionManifestContentKey, newManifestContent, KalturaConfig.config.cache.renditionManifest);		
						This.keepWatching();
					}	
				});				
			}
		}
		
		// build the final manifest		
		if(newManifestContent && !stitchingSegmentsCount){
			KalturaLogger.log('[' + This.uniqueLoopId + '] Setting ads manifest content for entry [' + This.entryId + ']');
			KalturaCache.set(This.renditionManifestContentKey, newManifestContent, KalturaConfig.config.cache.renditionManifest);
			This.keepWatching();
		}							
	},
	
	/**
	 * Trigger filler segment stitching
	 * 
	 * @param segments
	 * @param segmentId
	 * @param offset
	 * @param portion
	 */
	stitchFiller: function(){
		var This = this;
		KalturaCache.touch(this.fillerMediaKey, KalturaConfig.config.cache.fillerMedia, function(){
			KalturaLogger.debug('Filler media [' + This.renditionId + '] already stitched');
			KalturaCache.touch(This.fillerEncodingParamsKey, KalturaConfig.config.cache.fillerMedia);
		}, function(err){
			KalturaCache.add(This.fillerHandledKey, true, KalturaConfig.config.cache.fileDownloadTimeout, function(){
				KalturaLogger.log('Stitching filler media [' + This.renditionId + '] filler [' + This.uiConfConfig.slateContent +']');
				var stitchFillerParams = {
						renditionId: This.renditionId, 
						uiConfConfigId: This.uiConfConfigId,
						slateContent: This.uiConfConfig.slateContent};
				This.manager.callPlayServerService('segment', 'stitchFiller', This.partnerId, stitchFillerParams);
			}, function (err) {
				KalturaLogger.debug('Filler media [' + This.renditionId + '] already handled');
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
		KalturaLogger.log('[' + this.uniqueLoopId + '] getting manifest for [' + this.entryId + '] rendition [' + this.renditionId + '] watcher id [' + this.watcherId + '] uiconf [' + this.uiConfConfigId + ']');
		KalturaCache.set(this.renditionManifestHandledKey, true, KalturaConfig.config.cache.watcherHandled);
		
		//verify if entry is still required
		this.verifyTrackingRequired();

		if(new Date().getTime() > (this.startTime + KalturaStreamWatcher.MINIMUM_RUN_PERIOD) && !this.trackerRequired){
			this.removeRenditionFromCache();
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
			KalturaLogger.error('[' + This.uniqueLoopId + '] Failed to fetch manifest [' + This.url + ']: ' + err );
			if(new Date().getTime() < (This.startTime + KalturaStreamWatcher.MINIMUM_RUN_PERIOD)){
				This.keepWatching();
			} else {
				KalturaLogger.log('[' + This.uniqueLoopId + '] time: ' + new Date().getTime() + ' mimmum threshhold : ' + (This.startTime + KalturaStreamWatcher.MINIMUM_RUN_PERIOD));
				This.removeRenditionFromCache();
				if (This.finishCallback && typeof This.finishCallback === 'function') {
					KalturaLogger.log('After deleting rendition :' + This.renditionManifestHandledKey + ' finish callback was valid');
					This.finishCallback();
				}
			}
		});
	},

	removeRenditionFromCache: function(){
		KalturaLogger.log('[' + this.uniqueLoopId + '] Deleting all relevant keys form cache for rendition :' + this.renditionId);
		KalturaCache.del(this.renditionManifestContentKey);
		KalturaCache.del(this.renditionManifestHandledKey);
		KalturaCache.del(this.encodingParamsKey);
		KalturaCache.del(this.mediaInfoKey);
		KalturaCache.del(this.fillerEncodingParamsKey);
		KalturaCache.del(this.fillerMediaKey);
		KalturaCache.del(this.fillerHandledKey);
		KalturaCache.removeRenditionIdFromEntryRequiredValue(this.entryRequiredKey, this.renditionId);
	},

	/**
	 * Fetch the segment from the cdn an parse its metadata
	 */
	parseSegment: function(segment, callback){		
		KalturaLogger.log('[' + this.uniqueLoopId + '] Parse segment entry [' + this.entryId + '] rendition [' + this.renditionId +'] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']');
		
		var This = this;
		KalturaUtils.downloadHttpUrlForce(segment.resolvedUrl, true, this.firstTime, function(buffers, localPath){
			if(This.firstTime){
				This.parseEncodingParams(localPath);
				This.firstTime = false;
			}
			
			This.parseId3Tags(This.entryId, segment, Buffer.concat(buffers));
			if(callback){
				callback();
			}			
		}, function(err){
			KalturaLogger.error('[' + This.uniqueLoopId + '] Error in parse segment entry [' + this.entryId + '] segment [' + segment.sequence + '] url [' + segment.resolvedUrl + ']: ' + err);
		});
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
			var fillerEncodingParams = null;
			if(This.uiConfConfig.slateContent){
				fillerEncodingParams = encodingParams;
			}
			else{
				blackEncodingParams = kaltura.ffmpegParams.buildBlackInputParams(mediaInfo);
				fillerEncodingParams = blackEncodingParams + ' ' + encodingParams;
			}
			
			This.encodingId = KalturaCache.getEncodingId(encodingParams);
			KalturaLogger.debug('[' + This.uniqueLoopId + '] Encoding params for rendition [' + This.renditionId + '] and encodingId [ ' + This.encodingId + '] from file [' + localPath + ']: ' + encodingParams);
			
			KalturaCache.set(This.mediaInfoKey, mediaInfo, KalturaConfig.config.cache.encodingParams);
			KalturaCache.set(This.encodingParamsKey, encodingParams, KalturaConfig.config.cache.encodingParams);
			KalturaCache.set(This.fillerEncodingParamsKey, fillerEncodingParams, KalturaConfig.config.cache.fillerMedia);
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
		KalturaLogger.debug('[' + this.uniqueLoopId + '] ' + JSON.stringify(syncPoint));

		var offsetInSegment = (syncPoint.pts - segment.pts) / 90;
		var segmentOffset = syncPoint.offset - offsetInSegment;
		var segmentTimestamp = syncPoint.timestamp - offsetInSegment;
		
		this.elapsedTime = {
			sequence: segment.sequence,
    		duration: segment.duration,
			offset: segmentOffset,
			timestamp: segmentTimestamp // in milliseconds since 1970
		};
		
		if(this.lowestBitrate){
			KalturaCache.set(this.elapsedTimeKey, this.elapsedTime, KalturaConfig.config.cache.elapsedTime);
		}		
	},

	
	/**
	 * Parse id3 tags from segment metadata
	 * 
	 * @param entryId
	 * @param segment object {sequence, url, resolvedUrl, duration}
	 * @param buffer Array <segment>
	 */
	parseId3Tags: function(entryId, segment, buffer){
		var parsed = id3Reader.parseBuffer(buffer);
		KalturaLogger.log('[' + this.uniqueLoopId + '] Entry [' + entryId + '] segment [' + segment.sequence + ']');
		
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
	}
};

/**
 * @service stream
 * 
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
