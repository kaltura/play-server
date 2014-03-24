
var os = require('os');

var kaltura = module.exports = require('../KalturaManager');

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

	var ffprobePath = 'ffprobe';
	if(KalturaConfig.config.bin.ffprobePath){
		ffprobePath = KalturaConfig.config.bin.ffprobePath;
	}
	
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
 * @param paths Array
 */
KalturaSegmentManager.prototype.exec = function(segmentId, offset, portion, paths){
	var segmentPath = os.tmpdir() + '/' + segmentId;
	
	var ffmpegPath = 'ffmpeg';
	var ffprobePath = 'ffprobe';
	if(KalturaConfig.config.bin.ffmpegPath){
		ffmpegPath = KalturaConfig.config.bin.ffmpegPath;
	}
	if(KalturaConfig.config.segment.ffprobePath){
		ffprobePath = KalturaConfig.config.bin.ffprobePath;
	}
		
	var cmd = [
		'bin/ts_cutter',
		segmentPath,
		ffmpegPath,
		ffprobePath, 
		offset, 
		portion
	];
	cmd = cmd.concat(paths).join(' ');
	
	var This = this;
	cmd.exec(function(){
		This.save(segmentId, segmentPath, KalturaAdManager.MAX_DVR_LENGTH);
	});
};


/**
 * Stitch black segment and save to cache
 * 
 * @action stitchBlack
 * @param encodingId
 */
KalturaSegmentManager.prototype.stitchBlack = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['encodingId']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);

	var outputPath = os.tmpdir() + '/black-' + params.encodingId;
	
	var ffmpegPath = 'ffmpeg';
	if(KalturaConfig.config.bin.ffmpegPath){
		ffmpegPath = KalturaConfig.config.bin.ffmpegPath;
	}
	
	var This = this;
	var blackEncodingParamsKey = KalturaCache.getEncodingParams(params.encodingId);
	KalturaCache.get(blackEncodingParamsKey, function(blackEncodingParams){

		response.log('Handled');
		response.writeHead(200);
		response.done('OK');
		
		var cmd = [
			ffmpegPath,
			blackEncodingParams, 
			'-y', 
			outputPath
		];
		cmd = cmd.concat(paths).join(' ');
		
		var blackMediaKey = KalturaCache.getBlackMedia(params.encodingId);
		cmd.exec(function(){
			This.save(blackMediaKey, outputPath, KalturaAdManager.MAX_DVR_LENGTH);
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
			response.done('Stopped');
			return;
		}
		
		response.log('Handled');
		response.writeHead(200);
		response.done('OK');

		This.exec(params.segmentId, params.offset, params.portion);
	}, 
	function(err){
		This.errorResponse(response, 500, err);
	});
};

module.exports.KalturaSegmentManager = KalturaSegmentManager;
