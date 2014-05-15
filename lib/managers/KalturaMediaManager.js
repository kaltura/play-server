
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

KalturaMediaManager.STATE_PRE_AD = 0;
KalturaMediaManager.STATE_AD = 1;
KalturaMediaManager.STATE_PAD = 2;
KalturaMediaManager.STATE_POST_AD = 3;
KalturaMediaManager.STATE_PRE_AD_HEADER = 4;


KalturaMediaManager.prototype.outputStitchedSegment = function(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, trackingKey, response) {
	do {
		var processResult = stitcher.processChunk(
			outputLayout,
			curChunk,
			outputState);
				
		if (processResult.chunkOutputEnd > 0) {
			response.log('Writing ' + processResult.chunkOutputStart + '..' + processResult.chunkOutputEnd);
			response.write(curChunk.slice(processResult.chunkOutputStart, processResult.chunkOutputEnd));
		}
		
		if (processResult.outputBuffer) {
			response.log('Writing extra buffer of size ' + processResult.outputBuffer.length);
			response.write(processResult.outputBuffer);
		}
	} while (!processResult.moreDataNeeded);
	
	curChunk = null;		// no longer need the chunk
	
	var chunkIndex = Math.floor(outputState.chunkStartOffset / KalturaMediaManager.FILE_CHUNK_SIZE);
	var videoKey;
	
	//TODO trigger beacon
	
	switch (outputState.chunkType) {
	case STATE_PRE_AD:
		videoKey = preAdKey + '-' + chunkIndex;
		break;
	case STATE_AD:
		videoKey = adKey + '-' + chunkIndex;
		break;
	case STATE_PAD:
		videoKey = blackKey + '-' + chunkIndex;
		break;
	case STATE_POST_AD:
		videoKey = postAdKey + '-' + chunkIndex;
		break;
	case STATE_PRE_AD_HEADER:
		videoKey = preAdKey + '-header';
		break;		
	default:
		response.log('Request completed');
		response.end();
		return;
	}

	KalturaAdIntegrationHandler.sendBeacon(trackingKey, outputState.chunkType, outputState.chunkStartOffset, KalturaMediaManager.FILE_CHUNK_SIZE);
	
	response.log('Getting ' + videoKey);
	var This = this;
	KalturaCache.getMedia(videoKey, function (curChunk) {
		outputState.chunkStartOffset = chunkIndex * KalturaMediaManager.FILE_CHUNK_SIZE;
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, trackingKey, response);
	});
};

KalturaMediaManager.prototype.get = function(request, response, serverAdId){
	// TODO verify the call is from the CDN
	// TODO return caching headers
};

KalturaMediaManager.prototype.serve = function(request, response, entryId, cuePointId, renditionId, encodingId, sessionId, segmentIndex, outputStart, outputEnd){
	var adId = this.getCookie(request, cuePointId);
	var serverAdId = KalturaCache.getServerAdId(adId, encodingId);

	// TODO redirect ads to CDN URL with the serverAdId
	
	var This = this;

	var preSegmentId = KalturaCache.getPreSegmentId(cuePointId, renditionId);
	var postSegmentId = KalturaCache.getPostSegmentId(cuePointId, renditionId);

	var preAdMetadataKey = KalturaCache.getSegmentMediaMetadata(preSegmentId);
	var adMetadataKey = KalturaCache.getAdMediaMetadata(serverAdId);
	var blackMetadataKey = KalturaCache.getBlackMediaMetadata(encodingId);
	var postAdMetadataKey = KalturaCache.getSegmentMediaMetadata(postSegmentId);
	
	KalturaCache.getMulti([preAdMetadataKey, adMetadataKey, blackMetadataKey, postAdMetadataKey], function(data){
		preAdMetadata = data[preAdMetadataKey];
		adMetadata = data[adMetadataKey];
		blackMetadata = data[blackMetadataKey];
		postAdMetadata = data[postAdMetadataKey];

		if (adMetadata == null){
			response.log('Ad metadata is null');
		}
		else{
			response.log('Ad metadata length ' + adMetadata.length);
		}

		// build the layout of the output TS
		var outputLayout = stitcher.buildLayout(
			preAdMetadata,
			adMetadata,
			blackMetadata,
			postAdMetadata,
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
		var blackKey = KalturaCache.getBlackMedia(renditionId);
		var postAdKey = KalturaCache.getSegmentMedia(postSegmentId);
		var trackingKey = KalturaCache.getAdTrackingId(cuePointId, sessionId);

		// output the TS
		response.writeHead(200, {'Content-Type': 'video/MP2T'});
		This.outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKey, blackKey, postAdKey, trackingKey, response);
	});
};

/**
 * Returns the segment media from cache
 * 
 * @action media.segment
 */
KalturaMediaManager.prototype.segment = function(request, response, params){
	// TODO onPostSegment send beacon
	// TODO return caching headers - don't cache ads redirect, cache segments
	
	if (!params.e) {
		response.dir(params);
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}
	
	var decryptedParams = this.decrypt(params.e);
	delete params.e;
	for(var key in decryptedParams){
		params[key] = decryptedParams[key];
	}
	response.dir(params);

	var requiredParams = [
		'entryId', 
		'cuePointId', 
		'renditionId', 
		'encodingId',
		'segmentIndex',
		'outputStart',
		'outputEnd',
		'sessionId'
	];
	
	for(var i = 0; i < requiredParams.length; i++){
		if (!params[requiredParams[i]]) {
			response.error('Missing arguments');
			this.errorMissingParameter(response);
			return;
		}
	}

	this.serve(request, response, params.entryId, params.cuePointId, params.renditionId, params.encodingId, params.sessionId, parseInt(params.segmentIndex), parseInt(params.outputStart), parseInt(params.outputEnd));
};

module.exports.KalturaMediaManager = KalturaMediaManager;
