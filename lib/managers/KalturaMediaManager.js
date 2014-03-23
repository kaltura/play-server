
var url = require('url');
var util = require('util');

var stitcher = require('../../bin/TsStitcher.node');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service media
 */
var KalturaMediaManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaMediaManager, kaltura.KalturaManager);

KalturaMediaManager.TS_PACKET_LENGTH = 188;
KalturaMediaManager.FILE_CHUNK_SIZE = 2500 * KalturaMediaManager.TS_PACKET_LENGTH;

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
		response.done();
		return;
	}

	response.log('Getting ' + videoKey);
	var This = this;
	this.cache.getMedia(videoKey, function (curChunk) {
		outputState.chunkStartOffset = chunkIndex * KalturaMediaManager.FILE_CHUNK_SIZE;
		This.outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, response);
	});
};

KalturaMediaManager.prototype.serve = function(request, response, entryId, cuePointId, renditionId, encodingId, segmentIndex, outputStart, outputEnd){
	var adId = this.getCookie(request, cuePointId);
	var serverAdId = this.cache.getServerAdId(adId, encodingId);
	var This = this;

	var preSegmentId = this.cache.getPreSegmentId(cuePointId, renditionId);
	var postSegmentId = this.cache.getPostSegmentId(cuePointId, renditionId);

	var preAdMetadataKey = this.cache.getSegmentMediaMetadata(preSegmentId);
	var adMetadataKey = this.cache.getAdMediaMetadata(serverAdId);
	var blackMetadataKey = this.cache.getBlackMediaMetadata(encodingId);
	var postAdMetadataKey = this.cache.getSegmentMediaMetadata(postSegmentId);
	
	this.cache.getMulti([preAdMetadataKey, adMetadataKey, blackMetadataKey, postAdMetadataKey], function(data){
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

		var preAdKey = This.cache.getSegmentMedia(preSegmentId);
		var adKey = This.cache.getAdMedia(serverAdId);
		var blackKey = This.cache.getBlackMedia(renditionId);
		var postAdKey = This.cache.getSegmentMedia(postSegmentId);

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
		KalturaLogger.dir(params);
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}
	params = this.decrypt(params.e);
	KalturaLogger.dir(params);

	var requiredParams = [
		'entryId', 
		'cuePointId', 
		'renditionId', 
		'encodingId',
		'segmentIndex',
		'outputStart',
		'outputEnd'
	];
	
	for(var i = 0; i < requiredParams.length; i++){
		if (!params[requiredParams[i]]) {
			response.error('Missing arguments');
			this.errorMissingParameter(response);
			return;
		}
	}

	this.serve(request, response, params.entryId, params.cuePointId, params.renditionId, params.encodingId, parseInt(params.segmentIndex), parseInt(params.outputStart), parseInt(params.outputEnd));
};

module.exports.KalturaMediaManager = KalturaMediaManager;
