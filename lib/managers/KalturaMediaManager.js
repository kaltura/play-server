
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

KalturaMediaManager.prototype.serveSegment = function(response, segmentId){
	
};


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

KalturaMediaManager.prototype.serveAd = function(request, response, entryId, cuePointId, chunk, renditionId){
	var playerAdId = this.cache.getPlayerAdId(cuePointId, renditionId);
	var serverAdId = this.getCookie(request, playerAdId);
	var This = this;

	var preSegmentId = this.cache.getPreSegmentId(cuePointId, renditionId);
	var postSegmentId = this.cache.getPostSegmentId(cuePointId, renditionId);

	var preAdMetadataKey = this.cache.getSegmentMediaMetadata(preSegmentId);
	var adMetadataKey = this.cache.getAdMediaMetadata(serverAdId);
	var blackMetadataKey = this.cache.getBlackMediaMetadata(renditionId);
	var postAdMetadataKey = this.cache.getSegmentMediaMetadata(postSegmentId);
	
	this.cache.getMulti([preAdMetadataKey, adMetadataKey, blackMetadataKey, postAdMetadataKey], function(data){
		preAdMetadata = data[0];
		adMetadata = data[1];
		blackMetadata = data[2];
		postAdMetadata = data[3];

		if (adMetadata == null){
			response.log('Ad metadata is null');
		}
		else{
			response.log('Ad metadata length ' + adMetadata.length);
		}


		// TODO take from the URL
		var outputStart = chunk * 900000;
		var outputEnd = outputStart + 900000; // TODO that last one should be zero
		
		// build the layout of the output TS
		var outputLayout = stitcher.buildLayout(
			preAdMetadata,
			adMetadata,
			blackMetadata,
			postAdMetadata,
			chunk,
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
	//  TODO encrypt with some server secret
	KalturaLogger.dir(params);
	if (!params.segmentId && (!params.entryId || !params.cuePointId || !params.chunk || !params.renditionId)) {
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}

	if(params.segmentId){
		this.serveSegment(response, params.segmentId);
	}
	else if(params.cuePointId){
		this.serveAd(request, response, params.entryId, params.cuePointId, parseInt(params.chunk), params.renditionId);
	}
};

module.exports.KalturaMediaManager = KalturaMediaManager;
