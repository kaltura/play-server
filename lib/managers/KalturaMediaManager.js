
var url = require('url');
var util = require('util');

var stitcher = require('../../bin/TsStitcher.node');
require('../adIntegration/KalturaAdIntegrationHandler');

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


KalturaMediaManager.prototype.outputStitchedSegment = function(outputLayout, outputState, curChunk, preAdKey, adKeys, blackKey, postAdKey, response) {
	if (!curChunk) {
		// not much to do about this since we already returned the response headers
		response.log('failed to get chunk from memcache');
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
			chunkClone = new Buffer(curChunk.length);
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
			response.log('Request completed');
			response.end();
			return;			
		}
	}

	response.log('Getting ' + videoKey);
	var This = this;
	KalturaCache.getBinary(videoKey, function (curChunk) {
		outputState.chunkStartOffset = chunkIndex * KalturaMediaManager.FILE_CHUNK_SIZE;
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKeys, blackKey, postAdKey, response);
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
		preAdMetadata = data[preAdMetadataKey];
		blackMetadata = data[blackMetadataKey];
		postAdMetadata = data[postAdMetadataKey];
		
		adsMetadata = [];
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
			}
			else{
				delete adKeys[i];
			}
		}
		
		if (!preAdMetadata){
			response.log('Pre-Ad metadata is null, redirecting to original ts');
			response.writeHead(302, {'Location' : originalUrl});
			response.end();				
		}
		else{
			response.log('Pre-Ad metadata length ' + preAdMetadata.length);
			
			if (!adsMetadata.length){
				response.log('Ad metadata is null');
				//set black ad as a dummy ad metadata
				var adMetadata = 
				{
					adChunkType: KalturaMediaManager.CHUNK_TYPE_BLACK,
					ad: blackMetadata,
					fillerChunkType: KalturaMediaManager.CHUNK_TYPE_BLACK,
					filler: blackMetadata,
					startPos: 0,
					endPos: 0, 
					alignment: KalturaMediaManager.ALIGN_LEFT
				};	
				adsMetadata.push(adMetadata);	
			}
			else{
				response.log('Ad metadata length ' + adsMetadata.length);
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

			This.outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKeys, blackKey, postAdKey, response);
		}
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
	
	KalturaCache.get(serverAdIdKey, function(serverAdIds){
		if(!serverAdIds){
			response.log('No ad found, redirecting to original ts');
			response.writeHead(302, {'Location' : params.originalUrl});
			response.end();		
		}
		else{
			var outputStart = parseInt(params.outputStart);
			var outputEnd = parseInt(params.outputEnd);
			var adStart = parseInt(params.adStart);
			var serverAdId = [];
			var adsSequence = [];
			var currentAdsIdx = [];
			var sequenceDuration = adStart;
			var startSequenceIndex = 0;
			var startPos = adStart;
			var endPos = adStart;
			for(var i = 0; i<= serverAdIds.length; i++){
				if(!serverAdIds[i]){
					continue;
				}
				if(sequenceDuration + serverAdIds[i].duration <= outputStart){
					sequenceDuration += serverAdIds[i].duration;
					startSequenceIndex = i;
				}
				startPos = endPos;
				endPos += serverAdIds[i].duration; 
				adsSequence.push({id:serverAdIds[i].id, startPos:startPos, endPos:endPos, sequence:i});
			}
				

			for(var j = startSequenceIndex; adsSequence[j] && (adsSequence[j].startPos <= outputEnd || !outputEnd); j++){
				currentAdsIdx.push(adsSequence[j].sequence);
				serverAdId.push({id:adsSequence[j].id, startPos:adsSequence[j].startPos, endPos:adsSequence[j].endPos});
			}	
			
			if(serverAdId.length == 0){
				response.log('No ad match the ad sequence, redirecting to original ts');
				response.writeHead(302, {'Location' : params.originalUrl});
				response.end();					
			}
			else{
				response.log('Handling server ad Ids: ' + JSON.stringify(serverAdId));
				params.serverAdId = JSON.stringify(serverAdId);
				
				var trackingKey = KalturaCache.getAdTrackingId(params.cuePointId, params.sessionId);
				KalturaAdIntegrationHandler.sendBeacon(trackingKey, currentAdsIdx, sequenceDuration, outputStart, outputEnd, adStart);
				
				delete params.sessionId;
				response.dir(params);
								
				var redirectUrl = This.getPlayServerUrl('media', 'get', params.partnerId, null, params);
				response.writeHead(302, {'Location' : redirectUrl});
				response.end();							
			}
		}
					
	}, function(err){
		response.log('No ad found, redirecting to original ts');
		response.writeHead(302, {'Location' : params.originalUrl});
		response.end();		
	});
};

module.exports.KalturaMediaManager = KalturaMediaManager;
