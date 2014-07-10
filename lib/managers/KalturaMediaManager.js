
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

KalturaMediaManager.CHUNK_TYPE_AD = 		 3;
KalturaMediaManager.CHUNK_TYPE_BLACK = 	 4;


KalturaMediaManager.prototype.outputStitchedSegment = function(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, response) {
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
	var videoKey;

	switch (outputState.chunkType) {
	case KalturaMediaManager.CHUNK_TYPE_PRE_AD:
		videoKey = preAdKey + '-' + chunkIndex;
		break;
	case KalturaMediaManager.CHUNK_TYPE_AD:
		videoKey = adKey + '-' + chunkIndex;
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
		response.log('Request completed');
		response.end();
		return;
	}

	response.log('Getting ' + videoKey);
	var This = this;
	KalturaCache.getBinary(videoKey, function (curChunk) {
		outputState.chunkStartOffset = chunkIndex * KalturaMediaManager.FILE_CHUNK_SIZE;
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, response);
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
	this.serve(request, response, params.serverAdId, params.cuePointId, params.renditionId, params.encodingId, parseInt(params.segmentIndex), parseInt(params.outputStart), parseInt(params.outputEnd));
};

KalturaMediaManager.prototype.serve = function(request, response, serverAdId, cuePointId, renditionId, encodingId, segmentIndex, outputStart, outputEnd){	
	var This = this;

	var preSegmentId = KalturaCache.getPreSegmentId(cuePointId, renditionId);
	var postSegmentId = KalturaCache.getPostSegmentId(cuePointId, renditionId);

	var preAdMetadataKey = KalturaCache.getSegmentMediaMetadata(preSegmentId);
	var adMetadataKey = KalturaCache.getAdMediaMetadata(serverAdId);
	var blackMetadataKey = KalturaCache.getBlackMediaMetadata(encodingId);
	var postAdMetadataKey = KalturaCache.getSegmentMediaMetadata(postSegmentId);
	
	KalturaCache.getMultiBinary([preAdMetadataKey, adMetadataKey, blackMetadataKey, postAdMetadataKey], function(data){
		preAdMetadata = data[preAdMetadataKey];
		adMetadata = data[adMetadataKey];
		blackMetadata = data[blackMetadataKey];
		postAdMetadata = data[postAdMetadataKey];

		if (!preAdMetadata){
			response.log('Pre-Ad metadata is null');
		}
		else{
			response.log('Pre-Ad metadata length ' + preAdMetadata.length);
		}
			
		if (!adMetadata){
			response.log('Ad metadata is null');
		}
		else{
			response.log('Ad metadata length ' + adMetadata.length);
		}
		
		// build the layout of the output TS
		var outputLayout = stitcher.buildLayout(
				preAdMetadata,
				postAdMetadata,
				[{
					adChunkType: KalturaMediaManager.CHUNK_TYPE_AD,
					ad: adMetadata,
					fillerChunkType: KalturaMediaManager.CHUNK_TYPE_BLACK,
					filler: blackMetadata,
					startPos: 0,
					endPos: 0, 
					alignment: KalturaMediaManager.ALIGN_LEFT
				}],
				segmentIndex,
				outputStart,
				outputEnd);
			
		// free the metadata buffers, we don't need them anymore
		preAdMetadata = null;
		adMetadata = null;
		blackMetadata = null;
		postAdMetadata = null;

		var preAdKey = KalturaCache.getSegmentMedia(preSegmentId);
		var adKey = KalturaCache.getAdMedia(serverAdId);
		var blackKey = KalturaCache.getBlackMedia(encodingId);
		var postAdKey = KalturaCache.getSegmentMedia(postSegmentId);

		// output the TS
		response.writeHead(200, {
			'Content-Type': 'video/MP2T',
			'Cache-Control': KalturaConfig.config.media.cdnCacheScope + ', max-age=' + KalturaConfig.config.media.cdnMaxAge + ', max-stale=0'
			});

		This.outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKey, blackKey, postAdKey, response);
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
	
	var requiredParams = [
		'cuePointId', 
		'renditionId', 
		'encodingId',
		'segmentIndex',
		'outputStart',
		'outputEnd',
		'sessionId'
	];	

	var missingParams = this.getMissingParams(params, requiredParams);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return;
	}

	var serverAdIdKey = KalturaCache.getServerAdId(params.cuePointId, params.encodingId, sessionId);
	
	KalturaCache.get(serverAdIdKey, function(serverAdIds){
		if(!serverAdIds){
			response.error('Server ad id not found'); 
			response.end();				
		}
		else{
			var adSequence = 0;
			var segmentIndex = parseInt(params.segmentIndex);
			var outputStart = parseInt(params.outputStart);
			var outputEnd = parseInt(params.outputEnd);
			var serverAdId = null;
			var sequenceDuration = 0;
			
			for(var i = 0; serverAdIds[i]; i++){
				if(sequenceDuration + serverAdIds[i].duration <= outputStart){
					sequenceDuration += serverAdIds[i].duration;
				}
				else{
					adSequence = i;
					serverAdId = serverAdIds[i].id;
					break; //TODO handle several ads in the same TS
				}
			}
			response.log('Handling server ad Id: ' + serverAdId);
			params.serverAdId = serverAdId;
			
			var trackingKey = KalturaCache.getAdTrackingId(params.cuePointId, params.sessionId);
			KalturaAdIntegrationHandler.sendBeacon(trackingKey, adSequence, segmentIndex, outputStart, outputEnd);
			
			delete params.sessionId;
			response.dir(params);
							
			var redirectUrl = This.getPlayServerUrl('media', 'get', null, params);
			response.writeHead(302, {'Location' : redirectUrl,});
			response.end();					
		}
	}, function(err){
		response.error('Server ad id not found'); 
		response.end();	
	});
};

module.exports.KalturaMediaManager = KalturaMediaManager;
