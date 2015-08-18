
var url = require('url');
var util = require('util');

var stitcher = require('../../bin/Release/TsStitcher.node');
var conv = require('binstring');

var kaltura = module.exports = require('../KalturaManager');

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
KalturaMediaManager.CHUNK_TYPE_TS_HEADER = 0;
KalturaMediaManager.CHUNK_TYPE_PRE_AD = 	 1;
KalturaMediaManager.CHUNK_TYPE_POST_AD = 	 2;

KalturaMediaManager.CHUNK_TYPE_AD = 		 5;
KalturaMediaManager.CHUNK_TYPE_BLACK = 	 4;


KalturaMediaManager.prototype.outputStitchedSegment = function(outputLayout, outputState, curChunk, preAdKey, adKeys, blackKey, postAdKey, response, callCount) {
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
	case KalturaMediaManager.CHUNK_TYPE_BLACK:
		videoKey = blackKey + '-' + chunkIndex;
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
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKeys, blackKey, postAdKey, response, callCount);
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
	this.serve(request, response, params.serverAdId, params.cuePointId, params.renditionId, params.encodingId, parseInt(params.segmentIndex), parseInt(params.outputStart), parseInt(params.outputEnd), params.originalUrl);
};

KalturaMediaManager.prototype.serve = function(request, response, serverAdId, cuePointId, renditionId, encodingId, segmentIndex, outputStart, outputEnd, originalUrl){	
	var This = this;

	var preSegmentId = KalturaCache.getPreSegmentId(cuePointId, renditionId);
	var postSegmentId = KalturaCache.getPostSegmentId(cuePointId, renditionId);	
	var preAdMetadataKey = KalturaCache.getSegmentMediaMetadata(preSegmentId);	
	var blackMetadataKey = KalturaCache.getBlackMediaMetadata(encodingId);
	var postAdMetadataKey = KalturaCache.getSegmentMediaMetadata(postSegmentId);
	var adMetadataKeys = [];
	serverAdId = JSON.parse(serverAdId);
	var adKeys = [];
	for(var i=0; i<serverAdId.length; i++){
		adMetadataKeys.push(KalturaCache.getAdMediaMetadata(serverAdId[i].id));
		adKeys.push(KalturaCache.getAdMedia(serverAdId[i].id));
	}
	
	var cacheKeys = adMetadataKeys.concat([preAdMetadataKey, blackMetadataKey, postAdMetadataKey]);
	KalturaCache.getMultiBinary(cacheKeys, function(data){
		var preAdMetadata = data[preAdMetadataKey];
		var blackMetadata = data[blackMetadataKey];
		var postAdMetadata = data[postAdMetadataKey];
		
		var adsMetadata = [];
		for(var i=0; i<adMetadataKeys.length; i++){
			if(data[adMetadataKeys[i]]){
				var adMetadata = 
				{
					adChunkType: KalturaMediaManager.CHUNK_TYPE_AD + i,
					ad: data[adMetadataKeys[i]],
					fillerChunkType: KalturaMediaManager.CHUNK_TYPE_BLACK,
					filler: blackMetadata,
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
		if(KalturaLogger.largeDataDebugEnabled){
			response.debug('Black metadata hex: '  + conv(blackMetadata, { out:'hex'}));
		}
		
		if (!preAdMetadata){
			response.log('Alert: Pre-Ad metadata is null, redirecting to original ts');
			This.redirectResponse(response, originalUrl);
		}
		else{
			response.debug('Pre-Ad metadata length ' + preAdMetadata.length);
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
				blackMetadata = null;
				postAdMetadata = null;

				var preAdKey = KalturaCache.getSegmentMedia(preSegmentId);
				var blackKey = KalturaCache.getBlackMedia(encodingId);
				var postAdKey = KalturaCache.getSegmentMedia(postSegmentId);

				// output the TS
				response.writeHead(200, {
					'Content-Type': 'video/MP2T',
					'Cache-Control': KalturaConfig.config.media.cdnCacheScope + ', max-age=' + KalturaConfig.config.media.cdnMaxAge + ', max-stale=0'
					});
				This.outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKeys, blackKey, postAdKey, response, 0);
			}
		}
	});
};

KalturaMediaManager.prototype.stitchSegment = function(request, response, params, serverAdIdKey){

	var This = this;
	var outputStart = parseInt(params.outputStart);
	var outputEnd = parseInt(params.outputEnd);
	var adStart = parseInt(params.adStart);
	var segmentIndex = parseInt(params.segmentIndex);	
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
			response.debug('serverAdIds: ' + JSON.stringify(serverAdIds));
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
			var trackingId = KalturaCache.getAdTrackingId(params.cuePointId, params.sessionId);
			
			delete params.sessionId;
								
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
		}
	}, function (err){
			response.log('Alert: serverAdIds not found in cache for key ' + serverAdIdKey + ' redirecting to original ts , err is:' + err);
			This.redirectResponse(response, params.originalUrl);
	});
};

KalturaMediaManager.prototype.decideCanPlayAd = function(response, entryId, cuePointId, sessionId, renditionId, callback){
	response.log('Calculating canPlayAd flag for cue point [' + cuePointId + '] session [' + sessionId + ']');
	
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	
	KalturaCache.get(entryRequiredKey, function(entryRequired){
		var encodingIds = [];
		var allServerAdIdsKeys = [];
		if(entryRequired){
			encodingIds = entryRequired.split('\n').unique();
			for(var i = 0; i < encodingIds.length; i++){ 
				if(encodingIds[i].trim().length){
					allServerAdIdsKeys.push(KalturaCache.getServerAdId(cuePointId, encodingIds[i], sessionId));
				}						
			}
			
			KalturaCache.getMulti(allServerAdIdsKeys, function(allServerAdIds){
				if(!allServerAdIds){
					callback('no', '1:Server Ad Ids not found in cache, redirecting to original ts');
					return;
				}
				else{
					var metadataKeys = [];
					var preSegmentId = KalturaCache.getPreSegmentId(cuePointId, renditionId);
					metadataKeys.push(KalturaCache.getMetadataReady(preSegmentId));
					for(var serverAdIdKey in allServerAdIds){
						if(!allServerAdIds[serverAdIdKey]){
							callback('no', '2:Server Ad ids missing for key ' + serverAdIdKey + ', redirecting to original ts');
							return;
						}
						else{
							var serverAdIds = allServerAdIds[serverAdIdKey];
							for(var i = 0; i<= serverAdIds.length; i++){
								if(!serverAdIds[i]){
									continue;
								}
								metadataKeys.push(KalturaCache.getMetadataReady(serverAdIds[i].id));
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
				callback('no', '6:Server Ad Ids not found in cache, redirecting to original ts');	
				return;
			});
		}			
	}, function(err){
		callback('no', '7:entryRequired not found in cache, redirecting to original ts');			
		return;
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
		'encodingId',
		'segmentIndex',
		'outputStart',
		'outputEnd',
		'sessionId',
		'adStart',
		'originalUrl'
	];	

	var missingParams = this.getMissingParams(params, requiredParams);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return;
	}

	var serverAdIdKey = KalturaCache.getServerAdId(params.cuePointId, params.encodingId, params.sessionId);	
	var canPlayAdKey = KalturaCache.getCanPlayAd(params.cuePointId, params.sessionId);
	
	var doDecideCanPlayAd = function(){
		This.decideCanPlayAd(response, params.entryId, params.cuePointId, params.sessionId, params.renditionId, function(shouldStitch, redirectError){
			KalturaCache.set(canPlayAdKey, shouldStitch, KalturaConfig.config.cache.adMedia);
			response.log('canPlayAd for params [' + JSON.stringify(params) + '] set to [' + shouldStitch + ']');
			if(shouldStitch == 'yes'){
				This.stitchSegment(request, response, params, serverAdIdKey);
			}
			else{
				response.log(redirectError);
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
