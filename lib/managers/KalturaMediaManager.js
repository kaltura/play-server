
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


KalturaMediaManager.prototype.outputStitchedSegment = function(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, response) {
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

	response.log('Getting ' + videoKey);
	var This = this;
	KalturaCache.getMedia(videoKey, function (curChunk) {
		outputState.chunkStartOffset = chunkIndex * KalturaMediaManager.FILE_CHUNK_SIZE;
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, response);
	});
};

KalturaMediaManager.prototype.get = function(request, response, params){
	// TODO verify the call is from the CDN
	// TODO check if can remove cuePointId, renditionId parameters for ad segments
	
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

		// output the TS
		response.writeHead(200, {'Content-Type': 'video/MP2T'});
		This.outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKey, blackKey, postAdKey, response);
	});
};

/**
 * Returns the segment media from cache
 * 
 * @action media.segment
 */
KalturaMediaManager.prototype.segment = function(request, response, params){
	if (!params.e) {
		response.dir(params);
		response.error('Missing arguments [e]');
		this.errorMissingParameter(response);
		return;
	}
	
	var decryptedParams = this.decrypt(params.e);
	delete params.e;
	for(var key in decryptedParams){
		params[key] = decryptedParams[key];
	}
	
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

	var adId = this.getCookie(request, params.cuePointId);
	params.serverAdId = KalturaCache.getServerAdId(adId, params.encodingId);

	var trackingKey = KalturaCache.getAdTrackingId(params.cuePointId, params.sessionId);
	delete params.sessionId;
	response.dir(params);
	KalturaAdIntegrationHandler.sendBeacon(trackingKey, parseInt(params.segmentIndex), parseInt(params.outputStart), parseInt(params.outputEnd));
	
	params.encrypt = true;
	var redirectUrl = this.getPlayServerUrl('media', 'get', params);
	// TODO return caching headers - don't cache ads redirect, cache segments
	response.writeHead(302, {
		 'Location' : redirectUrl,
		 'Cache-Control': '' //TODO
	 });
	 response.end();
};

module.exports.KalturaMediaManager = KalturaMediaManager;
