
var os = require('os');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
kaltura.tsCutter = require('../media/KalturaTsCutter');
kaltura.tsCutter.setLogger(KalturaLogger);


/**
 * @service segment
 */
var KalturaSegmentManager = function(){
};
util.inherits(KalturaSegmentManager, kaltura.KalturaManager);

KalturaSegmentManager.MAX_DVR_LENGTH = 24 * 60 * 60;

/**
 * Save the segment media to cache
 * 
 * @param segmentId
 * @param segmentPath
 */
KalturaSegmentManager.prototype.save = function(segmentId, segmentPath, expiry){

	var ffprobePath = 'bin/ffprobe';
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffprobePath){
		ffprobePath = KalturaConfig.config.bin.ffprobePath;
	}
	
	KalturaLogger.debug('Saving path[' + segmentPath + '] segment[' + segmentId + ']');
	var cmd = [
		'bin/ts_preparer', 
		segmentPath,
		ffprobePath,
		KalturaConfig.config.memcache.hostname,
		KalturaConfig.config.memcache.port, 
		expiry, 
		segmentId
	];
	cmd = cmd.join(' ');
	cmd.exec();
};

/**
 * Stitch the segment
 * 
 * @param segmentId
 * @param offset
 * @param portion
 * @param inputFiles Array
 */
KalturaSegmentManager.prototype.exec = function(segmentId, cutOffset, portion, inputFiles){
	var outputFile = os.tmpdir() + '/' + segmentId;
	var leftPortion = (portion == 'left');
		
	var ffmpegBin = 'bin/ffmpeg';
	var ffprobeBin = 'bin/ffprobe';
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffmpegPath){
		ffmpegBin = KalturaConfig.config.bin.ffmpegPath;
	}
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffprobePath){
		ffprobeBin = KalturaConfig.config.bin.ffprobePath;
	}

	var This = this;
	KalturaLogger.debug('tsCutter: ' + util.inspect({
		outputFile: outputFile, 
		ffmpegBin: ffmpegBin, 
		ffprobeBin: ffprobeBin, 
		cutOffset: cutOffset, 
		leftPortion: leftPortion, 
		inputFiles: inputFiles
	}));
	kaltura.tsCutter.cutTsFiles(outputFile, ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, function(){
		This.save(segmentId, outputFile, KalturaSegmentManager.MAX_DVR_LENGTH);
	});
};


/**
 * Stitch black segment and save to cache
 * 
 * @action segment.stitchBlack
 * @param encodingId
 */
KalturaSegmentManager.prototype.stitchBlack = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['encodingId']);
	if(!params)
		return;
	
	response.dir(params);

	var outputPath = os.tmpdir() + '/black-' + params.encodingId;
	
	var ffmpegPath = 'bin/ffmpeg';
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffmpegPath){
		ffmpegPath = KalturaConfig.config.bin.ffmpegPath;
	}
	
	var This = this;
	var blackEncodingParamsKey = KalturaCache.getBlackEncodingParams(params.encodingId);
	KalturaCache.get(blackEncodingParamsKey, function(blackEncodingParams){

		response.log('Handled');
		response.writeHead(200);
		response.end('OK');
		
		if(!blackEncodingParams)
			return;
		
		var cmd = [
			ffmpegPath,
			blackEncodingParams, 
			'-y', 
			outputPath
		];
		cmd = cmd.join(' ');
		
		var blackMediaKey = KalturaCache.getBlackMedia(params.encodingId);
		cmd.exec(function(){
			This.save(blackMediaKey, outputPath, KalturaSegmentManager.MAX_DVR_LENGTH);
		});
	});
};


/**
 * Stitch pre and post ad segment and save to cache
 * 
 * @action segment.stitch
 * @param segmentId
 * @param url1
 * @param url2
 * @param url3
 * @param offset
 * @param portion
 */
KalturaSegmentManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['segmentId', 'url1', 'url2', 'url3', 'offset', 'portion']);
	if(!params)
		return;
	
	response.dir(params);
	
	var This = this;
	var urls = [params.url1, params.url2, params.url3];
	this.downloadMultiHttpUrls(urls, null, function(localPaths){
		if(!This.run){
			response.log('Canceled');
			response.writeHead(200);
			response.end('Stopped');
			return;
		}
		
		response.log('Handled');
		response.writeHead(200);
		response.end('OK');

		This.exec(params.segmentId, params.offset, params.portion, localPaths);
	}, 
	function(err){
		This.errorResponse(response, 500, err);
	});
};

module.exports.KalturaSegmentManager = KalturaSegmentManager;
