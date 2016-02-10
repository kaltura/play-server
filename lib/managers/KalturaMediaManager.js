
var url = require('url');
var util = require('util');

var stitcher = require('../../bin/Release/TsStitcher.node');
var conv = require('binstring');

var kaltura = module.exports = require('../KalturaManager');
kaltura.tsPreparer = require('../media/KalturaTsPreparer');
kaltura.tsPreparer.setLogger(KalturaLogger);

/**
 * @service media
 */
var KalturaMediaManager = function(){
};
util.inherits(KalturaMediaManager, kaltura.KalturaManager);

KalturaMediaManager.TS_PACKET_LENGTH = 188;
KalturaMediaManager.FILE_CHUNK_SIZE = 2500 * KalturaMediaManager.TS_PACKET_LENGTH;

KalturaMediaManager.PBA_CALL_AGAIN = 0;
KalturaMediaManager.PBA_GET_NEXT_CHUNK = 1;
KalturaMediaManager.PBA_CLONE_CURRENT_CHUNK = 2;

KalturaMediaManager.ALIGN_LEFT = 0;
KalturaMediaManager.ALIGN_MIDDLE =	1;
KalturaMediaManager.ALIGN_RIGHT = 	2;

KalturaMediaManager.CHUNK_TYPE_INVALID  =	-1;
KalturaMediaManager.CHUNK_TYPE_TS_HEADER =       0;
KalturaMediaManager.CHUNK_TYPE_PRE_AD = 	 1;
KalturaMediaManager.CHUNK_TYPE_POST_AD = 	 2;
KalturaMediaManager.CHUNK_TYPE_AD = 		 5;
KalturaMediaManager.CHUNK_TYPE_FILLER = 	 4;


KalturaMediaManager.SLATE_TYPE_FILLER = 'filler';

KalturaMediaManager.SLATE_STATE_NO = 0;
KalturaMediaManager.SLATE_STATE_STITCH_POST = 1;
KalturaMediaManager.SLATE_STATE_YES = 2;


KalturaMediaManager.prototype.outputStitchedSegment = function(outputLayout, outputState, curChunk, preAdKey, adKeys, fillerKey, postAdKey, response, callCount) {
	if (!curChunk) {
		// not much to do about this since we already returned the response headers
		response.log('failed to get chunk from memcache');
		response.end();
		return;
	}
	
	response.debug('Call count: ' + callCount);
	if(KalturaConfig.config.media.maxOutputStitchSegmentCalls && callCount > KalturaConfig.config.media.maxOutputStitchSegmentCalls){
		response.log('exceeded max calls');
		response.end();
		return;		
	}
	do {
		var processResult = stitcher.processChunk(
			outputLayout,
			curChunk,
			outputState);

		if (processResult.chunkOutputEnd > 0) {
			response.log('Writing ' + processResult.chunkOutputStart + '..' + processResult.chunkOutputEnd);
			var curSlice = curChunk.slice(processResult.chunkOutputStart, processResult.chunkOutputEnd);
			response.write(curSlice);
		}

		if (processResult.outputBuffer) {
			response.log('Writing extra buffer of size ' + processResult.outputBuffer.length);
			response.write(processResult.outputBuffer);
		}

		if (processResult.action == KalturaMediaManager.PBA_CLONE_CURRENT_CHUNK)
		{
			response.log('Cloning chunk buffer');
			var chunkClone = new Buffer(curChunk.length);
			curChunk.copy(chunkClone);
			curChunk = chunkClone;
		}
	} while (processResult.action != KalturaMediaManager.PBA_GET_NEXT_CHUNK);

	curChunk = null;		// no longer need the chunk

	var chunkIndex = Math.floor(outputState.chunkStartOffset / KalturaMediaManager.FILE_CHUNK_SIZE);
	var videoKey = null;

	switch (outputState.chunkType) {
	case KalturaMediaManager.CHUNK_TYPE_PRE_AD:
		videoKey = preAdKey + '-' + chunkIndex;
		break;
	case KalturaMediaManager.CHUNK_TYPE_FILLER:
		videoKey = fillerKey + '-' + chunkIndex;
		break;
	case KalturaMediaManager.CHUNK_TYPE_POST_AD:
		videoKey = postAdKey + '-' + chunkIndex;
		break;
	case KalturaMediaManager.CHUNK_TYPE_TS_HEADER:
		videoKey = preAdKey + '-header';
		break;		
	default:
		for(var i=0; i<adKeys.length; i++){
			if(KalturaMediaManager.CHUNK_TYPE_AD + i == outputState.chunkType){
				videoKey = adKeys[i] + '-' + chunkIndex; 
				break;
			}			
		}
		if(!videoKey){
			response.debug('Request completed');
			response.end();
			return;			
		}
	}

	response.log('Getting ' + videoKey);
	var This = this;
	KalturaCache.getBinary(videoKey, function (curChunk) {
		outputState.chunkStartOffset = chunkIndex * KalturaMediaManager.FILE_CHUNK_SIZE;
		callCount++;
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKeys, fillerKey, postAdKey, response, callCount);
	});
};

KalturaMediaManager.prototype.get = function(request, response, params){
	// TODO verify the call is from the CDN
	if (!params.e) {
		response.dir(params);
		response.error('Missing arguments [e]');
		this.errorMissingParameter(response);
		return;
	}
	
	params = this.decrypt(params);
	response.dir(params);
	
	var This = this;
	var segmentIndex = parseInt(params.segmentIndex);
	var outputStart = parseInt(params.outputStart);
	var outputEnd = parseInt(params.outputEnd);
	var serverAdId = JSON.parse(params.serverAdId);	
	var stitchPostSegment = parseInt(params.stitchPostSegment);
	var preSegmentId = KalturaCache.getPreSegmentId(params.cuePointId, params.renditionId);
	var postSegmentId = KalturaCache.getPostSegmentId(params.cuePointId, params.renditionId);	
	var preAdMetadataKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [preSegmentId], KalturaCache.METADATA_KEY_SUFFIX);	
	var fillerMetadataKey = KalturaCache.getKey(KalturaCache.FILLER_MEDIA_KEY_PREFIX, [params.renditionId, params.uiConfConfigId], KalturaCache.METADATA_KEY_SUFFIX);
	var postAdMetadataKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [postSegmentId], KalturaCache.METADATA_KEY_SUFFIX);
	var slatePostSegmentId = KalturaCache.getPostSegmentId(params.cuePointId, serverAdId + '-' + segmentIndex);
	var prevSlatePostSegmentId = KalturaCache.getPostSegmentId(params.cuePointId, serverAdId + '-' + (segmentIndex-1));
	var slatePostAdMetadataKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [slatePostSegmentId], KalturaCache.METADATA_KEY_SUFFIX);
	var prevSlatePostAdMetadataKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [prevSlatePostSegmentId], KalturaCache.METADATA_KEY_SUFFIX);
	var preAdKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [preSegmentId]);
	var fillerKey = KalturaCache.getKey(KalturaCache.FILLER_MEDIA_KEY_PREFIX, [params.renditionId, params.uiConfConfigId]);

	var adMetadataKeys = [];	
	var adKeys = [];
	
	for(var i=0; i<serverAdId.length; i++){
		adMetadataKeys.push(KalturaCache.getKey(KalturaCache.AD_MEDIA_KEY_PREFIX, [serverAdId[i].id], KalturaCache.METADATA_KEY_SUFFIX));
		adKeys.push(KalturaCache.getKey(KalturaCache.AD_MEDIA_KEY_PREFIX, [serverAdId[i].id]));
	}
	
	var cacheKeys = adMetadataKeys.concat([preAdMetadataKey, fillerMetadataKey, postAdMetadataKey]);
	
	if(stitchPostSegment){
		cacheKeys.push(slatePostAdMetadataKey);
		cacheKeys.push(prevSlatePostAdMetadataKey);
	}
	
	KalturaCache.getMultiBinary(cacheKeys, function(data){
		var preAdMetadata = data[preAdMetadataKey];
		var fillerMetadata = data[fillerMetadataKey];
		var postAdMetadata = data[postAdMetadataKey];
		
		if(stitchPostSegment && data[prevSlatePostAdMetadataKey] && data[prevSlatePostAdMetadataKey].length > 0){
			//post segment was already stitched, can dump original ts
			response.log('In Passthrough, dumping original ts');
			This.dumpResponse(response, params.originalUrl);
			return;
		}
		if (!preAdMetadata){
			response.log('Alert: Pre-Ad metadata is null, dumping original ts');
			This.dumpResponse(response, params.originalUrl);
			return;
		}
		
		var adsMetadata = [];
		for(var i=0; i<adMetadataKeys.length; i++){
			if(data[adMetadataKeys[i]]){
				var adMetadata = 
				{
					adChunkType: KalturaMediaManager.CHUNK_TYPE_AD + i,
					ad: data[adMetadataKeys[i]],
					fillerChunkType: KalturaMediaManager.CHUNK_TYPE_FILLER,
					filler: fillerMetadata,
					startPos: serverAdId[i].startPos,
					endPos: serverAdId[i].endPos, 
					alignment: KalturaMediaManager.ALIGN_LEFT
				};	
				adsMetadata.push(adMetadata);	
				response.log('Added ad metadata: adChunkType [' + adMetadata.adChunkType + '], startPos [' + serverAdId[i].startPos + '] endPos [' + serverAdId[i].endPos + ']');
				if(KalturaLogger.largeDataDebugEnabled){
					response.debug('Ad metadata hex for ' + i + ': ' + conv(adMetadata.ad, { out:'hex'}));
				}
			}
			else{
				delete adKeys[i];
			}
		}
		
		if(stitchPostSegment && data[slatePostAdMetadataKey] && data[slatePostAdMetadataKey].length > 0){
			response.log('Setting postAdMetadata to slatePostAdMetadata');
			postAdMetadata = data[slatePostAdMetadataKey];
			postSegmentId = slatePostSegmentId;
		}
		
		if(stitchPostSegment && !data[slatePostAdMetadataKey]){
			response.log('Calling stitchPostSegment');
			This.stitchPostSegment(response, params.originalUrl, slatePostSegmentId, adsMetadata, function(metadata){
				if(metadata){
					postAdMetadata = metadata;
					postSegmentId = slatePostSegmentId;
				}
				var postAdKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [postSegmentId]);
				This.serve( response, 
							preAdMetadata, postAdMetadata, adsMetadata, fillerMetadata, 
							segmentIndex, outputStart, outputEnd, 
							preAdKey, adKeys, fillerKey, postAdKey);			
			});
		}
		else{
			var postAdKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [postSegmentId]);
			This.serve( response, 
						preAdMetadata, postAdMetadata, adsMetadata, fillerMetadata, 
						segmentIndex, outputStart, outputEnd, 
						preAdKey, adKeys, fillerKey, postAdKey);			
		}
	});
};

KalturaMediaManager.prototype.serve = function(	response, 
												preAdMetadata, postAdMetadata, adsMetadata, fillerMetadata, 
												segmentIndex, outputStart, outputEnd, 
												preAdKey, adKeys, fillerKey, postAdKey){
	if(KalturaLogger.largeDataDebugEnabled){
		response.debug('Filler metadata hex: '  + conv(fillerMetadata, { out:'hex'}));
	}		
	if(KalturaLogger.largeDataDebugEnabled){
		response.debug('Pre-Ad metadata hex: ' + conv(preAdMetadata, { out:'hex'}));
	}					
	if (!adsMetadata.length){
		response.log('Ad metadata is null');
	}
	else{
		response.debug('Ad metadata length ' + adsMetadata.length);
		if(postAdMetadata && KalturaLogger.largeDataDebugEnabled){
			response.debug('Post-Ad metadata hex: ' + conv(postAdMetadata, { out:'hex'}));
		}
		// build the layout of the output TS
		var outputLayout = stitcher.buildLayout(
								preAdMetadata,
								postAdMetadata,
								adsMetadata,
								segmentIndex,
								outputStart,
								outputEnd);
				
		// free the metadata buffers, we don't need them anymore
		preAdMetadata = null;
		adsMetadata = null;
		fillerMetadata = null;
		postAdMetadata = null;

		// output the TS
		response.writeHead(200, {
			'Content-Type': 'video/MP2T',
			'Cache-Control': KalturaConfig.config.media.cdnCacheScope + ', max-age=' + KalturaConfig.config.media.cdnMaxAge + ', max-stale=0',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
			});
		this.outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKeys, fillerKey, postAdKey, response, 0);
	}
};


KalturaMediaManager.prototype.stitchPostSegment = function(response, originalUrl, segmentId, adsMetadata, callback){
	var filePath = KalturaConfig.config.cloud.sharedBasePath + '/segments/' + originalUrl.md5();
	KalturaUtils.downloadHttpUrl(originalUrl, {filePath: filePath}, function(filePath){
		var ffprobeBin = KalturaConfig.config.bin.binDir + '/ffprobe';
		if(KalturaConfig.config.bin.ffprobePath){
			ffprobeBin = KalturaConfig.config.bin.ffprobePath;
		}
		
		var cutOffset = adsMetadata[adsMetadata.length-1].endPos;
		kaltura.tsPreparer.rightCutOnIFrame(ffprobeBin, cutOffset, [filePath], function(err, data){
			if(err){
				response.log('Failed to rightCutOnIFrame, segmentId [' + segmentId + '] ');
				callback(null);
				return;
			}
			if(!data){
				response.log('iFrame for cut not found in the segment');
				callback(null);
				return;
			}
			var segmentMediaKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [segmentId]);
			response.debug('Saving [' + segmentMediaKey + '] to cache');
			kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache.binserverSet, segmentMediaKey, data, KalturaMediaManager.MAX_DVR_LENGTH, function(error){
				if(error){
					response.log('Failed to save [' + segmentMediaKey + '] to cache');
					callback(null);
					return;
				}	
				callback(data.metadata);
			});
		});
	}, function(err){
		response.log('Failed to download original ts');
		callback(null);
	});	
};

KalturaMediaManager.prototype.stitchSegment = function(request, response, params, serverAdIdKey){

	var This = this;
	var outputStart = parseInt(params.outputStart);
	var outputEnd = parseInt(params.outputEnd);
	var adStart = parseInt(params.adStart);
	var segmentIndex = parseInt(params.segmentIndex);	
	var cuePointDuration = parseInt(params.cuePointDuration);
	var maxSegmentDuration = parseInt(params.maxSegmentDuration);
	var serverAdId = [];
	var adsSequence = [];
	var currentAdsIdx = [];
	var lastAdIdx = 0;
	var sequenceDuration = adStart;
	var iterationDuration = adStart;
	var startSequenceIndex = 0;
	var startPos = adStart;
	var endPos = adStart;
	
	KalturaCache.get(serverAdIdKey, function(serverAdIds){
		if (!serverAdIds){
			response.log('Alert: serverAdIds not found in cache for key ' + serverAdIdKey + ' , redirecting to original ts');
			This.redirectResponse(response, params.originalUrl);
		}		
		else{
			serverAdIds = KalturaCache.extractSessionServerAdIdValue(serverAdIds);
			response.debug('serverAdIds: ' + JSON.stringify(serverAdIds));
			
			This.decideCanPassthrough(response, params.uiConfConfigId, serverAdIds, cuePointDuration, adStart, outputStart, outputEnd, maxSegmentDuration, function(slateState){
				if(slateState == KalturaMediaManager.SLATE_STATE_YES){
					response.log('Passthrough for ' + serverAdIdKey + ' , redirecting to original ts');
					This.redirectResponse(response, params.originalUrl);	
					return;
				}
				
				for(var i = 0; i<= serverAdIds.length; i++){
					if(!serverAdIds[i]){
						continue;
					}
					if((iterationDuration + serverAdIds[i].duration) <= outputStart){
						sequenceDuration += serverAdIds[i].duration;
						startSequenceIndex++;
					}
					iterationDuration += serverAdIds[i].duration;
					startPos = endPos;
					endPos += serverAdIds[i].duration; 
					adsSequence.push({id:serverAdIds[i].id, startPos:startPos, endPos:endPos, sequence:i});
					response.debug('iteration: ' + i + ' iterationDuration: ' + iterationDuration + ' startSequenceIndex: ' + startSequenceIndex);
					lastAdIdx = i;
				}
					
				response.debug('ads sequence: ' + JSON.stringify(adsSequence) + ' startSequenceIndex: ' + startSequenceIndex);
				for(var j = startSequenceIndex; adsSequence[j] && (adsSequence[j].startPos <= outputEnd || !outputEnd); j++){
					currentAdsIdx.push(adsSequence[j].sequence);
					serverAdId.push({id:adsSequence[j].id, startPos:adsSequence[j].startPos, endPos:adsSequence[j].endPos});
				}	
				
				if(outputEnd == 0 && currentAdsIdx.length == 0){
					currentAdsIdx.push(lastAdIdx);
				}
				
				if(outputEnd == 0){
					response.log('Completed ad break for partner [' + params.partnerId + '] entry [' + params.entryId + '] cue-point [' + params.cuePointId + '] session [' + params.sessionId + ']');	
				}
				
				if(serverAdId.length == 0){
					if(segmentIndex == 0 && adsSequence[0]){
						//set serverAdIds for pre ad segment
						serverAdId.push({id:adsSequence[0].id, startPos:adsSequence[0].startPos, endPos:adsSequence[0].endPos});				
					}
					else if(adsSequence[adsSequence.length - 1] && outputStart > adsSequence[adsSequence.length - 1].endPos){
						//set serverAdIds for post ad segments
						serverAdId.push({id:adsSequence[adsSequence.length - 1].id, startPos:adsSequence[adsSequence.length - 1].startPos, endPos:adsSequence[adsSequence.length - 1].endPos});			
					}
					else{
						response.debug('No ad match to ad sequence');
					}
				}
				response.debug('Handling server ad Ids: ' + JSON.stringify(serverAdId));
				params.serverAdId = JSON.stringify(serverAdId);
				var trackingId = KalturaCache.getKey(KalturaCache.TRACKING_KEY_PREFIX, [params.cuePointId, params.sessionId]);
				
				delete params.sessionId;
				delete params.sessionStartTime;
				delete params.originDc;
				params.stitchPostSegment = slateState;
				
				var redirectUrl = This.getPlayServerUrl('media', 'get', params.partnerId, null, params);
				This.redirectResponse(response, redirectUrl);
					
				//track beacons			
				var sendBeaconParams = {
						trackingId: trackingId,
						adSequence: JSON.stringify(currentAdsIdx),
						totalDuration: sequenceDuration,
						outputStart: outputStart,
						outputEnd: outputEnd,
						adStart: adStart
				};
				
				This.callPlayServerService('adIntegration', 'sendBeacon', params.partnerId, sendBeaconParams);				
			});
		}
	}, function (err){
			response.log('Alert: serverAdIds not found in cache for key ' + serverAdIdKey + ' redirecting to original ts , err is:' + err);
			This.redirectResponse(response, params.originalUrl);
	});
};

KalturaMediaManager.prototype.decideCanPlayAd = function(response, entryId, cuePointId, sessionId, renditionId, sessionStartTime, originDc, callback){
	response.log('Calculating canPlayAd flag for cue point [' + cuePointId + '] session [' + sessionId + ']');
	
	var preparationTime = Math.floor(Date.now() / 1000) - sessionStartTime;
	var dcChanged = (originDc !== KalturaUtils.getCurrentDc());
	var entryRequiredKey = KalturaCache.getKey(KalturaCache.ENTRY_REQUIRED_KEY_PREFIX, [entryId]);
	
	KalturaCache.get(entryRequiredKey, function(entryRequired){
		var renditionIds = [];
		var allSessionServerAdIdsKeys = [];
		if(entryRequired){
			renditionIds = KalturaCache.extractEntryRequiredValue(entryRequired);
			for(var i = 0; i < renditionIds.length; i++){ 
				if(renditionIds[i].trim().length){
					allSessionServerAdIdsKeys.push(KalturaCache.getKey(KalturaCache.SERVER_AD_ID_KEY_PREFIX, [cuePointId, renditionIds[i], sessionId]));
				}						
			}
			
			KalturaCache.getMulti(allSessionServerAdIdsKeys, function(allSessionServerAdIds){
				if(!allSessionServerAdIds || Object.keys(allSessionServerAdIds).length == 0){
					callback('no', '1:Session Server Ad Ids not found in cache, redirecting to original ts: requested after ' + preparationTime + ' seconds, dc changed: ' + dcChanged);
					return;
				}				
				else{
					var metadataKeys = [];
					var preSegmentId = KalturaCache.getPreSegmentId(cuePointId, renditionId);
					metadataKeys.push(KalturaCache.getKey(KalturaCache.METADATA_READY_KEY_PREFIX, [preSegmentId]));
					for(var sessionServerAdIdKey in allSessionServerAdIds){
						if(!allSessionServerAdIds[sessionServerAdIdKey]){
							callback('no', '2:Session Server Ad ids missing for key ' + sessionServerAdIdKey + ', redirecting to original ts: requested after ' + preparationTime + ' seconds, dc changed: ' + dcChanged);
							return;
						}
						else{
							var serverAdIds = KalturaCache.extractSessionServerAdIdValue(allSessionServerAdIds[sessionServerAdIdKey]);
							for(var i = 0; i<= serverAdIds.length; i++){
								if(!serverAdIds[i]){
									continue;
								}
								metadataKeys.push(KalturaCache.getKey(KalturaCache.METADATA_READY_KEY_PREFIX, [serverAdIds[i].id]));
							}									
						}
					}
					KalturaCache.getMulti(metadataKeys, function(data){
						for(var i=0; i<metadataKeys.length; i++){
							if(!(data[metadataKeys[i]])){
								callback('no', '3:Metadata missing for ' + metadataKeys[i] + ', redirecting to original ts');
								return;
							}
						}
						callback('yes', null);
						return;
					}, function(err){
						callback('no', '5:Error getting metadata status from cache, redirecting to original ts');
						return;
					});
				}

			}, function (err){
				callback('no', '6:Server Ad Ids not found in cache, redirecting to original ts: requested after ' + preparationTime + ' seconds, dc changed: ' + dcChanged);	
				return;
			});
		}			
	}, function(err){
		callback('no', '7:entryRequired not found in cache, redirecting to original ts');			
		return;
	});
};

KalturaMediaManager.prototype.decideCanPassthrough = function(response, uiConfConfigId, serverAdIds, cuePointDuration, adStart, outputStart, outputEnd, maxSegmentDuration, callback){
	var doDecideCanPassthrough = function(){
		var totalDuration = 0;
		for(var i = 0; i<= serverAdIds.length; i++){
			if(!serverAdIds[i]){
				continue;
			}
			totalDuration += serverAdIds[i].duration;
		}
		cuePointDuration *= 90;
		var adEnd = adStart + totalDuration;
		response.debug('Total Ads duration: ' + totalDuration + ', Cue-point duration: ' + cuePointDuration + ', ad end: ' + adEnd);
		
		if(cuePointDuration <= totalDuration){
			response.debug('No Passthrough, cue point duration is not greater than ads duration');
			callback(KalturaMediaManager.SLATE_STATE_NO);
			return;
		}
				
		if(adEnd > outputEnd && outputEnd > 0){
			response.debug('No Passthrough, still not in the ads break end');
			callback(KalturaMediaManager.SLATE_STATE_NO);				
		}
		else if((adEnd > outputStart && (adEnd <= outputEnd || outputEnd ==0)) 
			    ||(adEnd > outputStart-maxSegmentDuration*90000 && adEnd <= outputStart)){ 
			response.debug('Prepare for Passthrough, can stitch post segment');
			callback(KalturaMediaManager.SLATE_STATE_STITCH_POST); 				
		}
		else{
			callback(KalturaMediaManager.SLATE_STATE_YES);
			response.debug('Can Passthrough');
		}				
	};
	
	var uiConfConfigKey = KalturaCache.getKey(KalturaCache.UI_CONF_CONFIG_KEY_PREFIX, [uiConfConfigId]);
	KalturaCache.get(uiConfConfigKey, function(uiConfConfig){
		response.debug('uiConfConfig: ' + JSON.stringify(uiConfConfig));
		if(uiConfConfig && uiConfConfig.slateType == KalturaMediaManager.SLATE_TYPE_FILLER){
			response.debug('No Passthrough, slate type set to filler');
			callback(KalturaMediaManager.SLATE_STATE_NO);
		}
		else{
			doDecideCanPassthrough();
		}
		
	}, function(err){
		response.error('Failed to get uiConf from cache for ' + uiConfConfigId);
		doDecideCanPassthrough();
	});	
};

/**
 * Returns the segment media from cache
 * 
 * @action media.segment
 */
KalturaMediaManager.prototype.segment = function(request, response, params){
	var This = this;
	if (!params.e) {
		response.dir(params);
		response.error('Missing arguments [e]');
		this.errorMissingParameter(response);
		return;
	}
	
	params = this.decrypt(params);
	response.dir(params);
	
	var requiredParams = [
		'cuePointId', 
		'renditionId', 
		'segmentIndex',
		'outputStart',
		'outputEnd',
		'sessionId',
		'adStart',
		'originalUrl',
		'uiConfConfigId'
	];	

	var missingParams = this.getMissingParams(params, requiredParams);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return;
	}

	var serverAdIdKey = KalturaCache.getKey(KalturaCache.SERVER_AD_ID_KEY_PREFIX, [params.cuePointId, params.renditionId, params.sessionId]);	
	var canPlayAdKey = KalturaCache.getKey(KalturaCache.CAN_PLAY_AD_KEY_PREFIX, [params.cuePointId, params.sessionId]);
	
	var doDecideCanPlayAd = function(){
		This.decideCanPlayAd(response, params.entryId, params.cuePointId, params.sessionId, params.renditionId, parseInt(params.sessionStartTime), params.originDc, function(shouldStitch, redirectError){
			KalturaCache.set(canPlayAdKey, shouldStitch, KalturaConfig.config.cache.sessionCuePoint);			
			if(shouldStitch == 'yes'){
				response.log('canPlayAd for params [' + JSON.stringify(params) + '] set to [' + shouldStitch + ']');
				This.stitchSegment(request, response, params, serverAdIdKey);
			}
			else{
				response.log('canPlayAd for params [' + JSON.stringify(params) + '] set to [' + shouldStitch + '] error [' + redirectError + ']');
				This.redirectResponse(response, params.originalUrl);					
			}
		});		
		
	};
	
	KalturaCache.get(canPlayAdKey, function(canPlayAd){
		if(!canPlayAd){
			doDecideCanPlayAd();
		}
		else if(canPlayAd == 'yes'){
			This.stitchSegment(request, response, params, serverAdIdKey);	
		}
		else{
			response.log('canPlayAd set to false, redirecting to original ts');
			This.redirectResponse(response, params.originalUrl);
		}
	}, function (err){
		doDecideCanPlayAd();
	});
};

module.exports.KalturaMediaManager = KalturaMediaManager;
