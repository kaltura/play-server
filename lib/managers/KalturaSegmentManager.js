
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
 * @param segmentKey
 * @param segmentPath
 */
KalturaSegmentManager.prototype.save = function(segmentKey, segmentPath, expiry, callback, errorCallback){

	var ffprobePath = KalturaConfig.config.bin.binDir + '/ffprobe';
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffprobePath){
		ffprobePath = KalturaConfig.config.bin.ffprobePath;
	}
	
	KalturaLogger.debug('Saving path[' + segmentPath + '] segment[' + segmentKey + ']');
	var cmd = [
		KalturaConfig.config.bin.binDir + '/ts_preparer', 
		segmentPath,
		ffprobePath,
		KalturaConfig.config.memcache.hostname,
		KalturaConfig.config.memcache.port, 
		expiry, 
		segmentKey
	];
	cmd = cmd.join(' ');
	cmd.exec(callback, errorCallback);
};

/**
 * Stitch the segment
 * 
 * @param segmentId
 * @param offset
 * @param portion
 * @param inputFiles Array
 */
KalturaSegmentManager.prototype.exec = function(segmentId, cutOffset, portion, inputFiles, callback, errorCallback){
	var outputFile = os.tmpdir() + '/' + segmentId;
	var leftPortion = (portion == 'left');
		
	var ffmpegBin = KalturaConfig.config.bin.binDir + '/ffmpeg';
	var ffprobeBin = KalturaConfig.config.bin.binDir + '/ffprobe';
	if(KalturaConfig.config.bin.ffmpegPath){
		ffmpegBin = KalturaConfig.config.bin.ffmpegPath;
	}
	if(KalturaConfig.config.bin.ffprobePath){
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
		This.save(KalturaCache.getSegmentMedia(segmentId), outputFile, KalturaSegmentManager.MAX_DVR_LENGTH, callback, errorCallback);
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
	
	var ffmpegPath = KalturaConfig.config.bin.binDir + '/ffmpeg';
	if(KalturaConfig.config.bin.ffmpegPath){
		ffmpegPath = KalturaConfig.config.bin.ffmpegPath;
	}
	
	var This = this;
	var blackEncodingParamsKey = KalturaCache.getBlackEncodingParams(params.encodingId);
	KalturaCache.get(blackEncodingParamsKey, function(blackEncodingParams){

		response.debug('Handled');
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
	var localPaths = [];
	for(var i = 0; i < urls.length; i++){
		localPaths[i] = KalturaConfig.config.cloud.sharedBasePath + '/segments/' + urls[i].md5();
	}
	KalturaUtils.downloadMultiHttpUrls(urls, localPaths, function(localPaths){
		if(response.headersSent){
			response.debug('Headers where alreay sent to the client, attempting to exec stich segment, original request probably got timed out!!!');
			This.exec(params.segmentId, params.offset, params.portion, localPaths);
		}
		else{
			if(!This.run){
				response.log('Canceled');
				response.writeHead(200);
				response.end('Stopped');
				return;
			}
			This.exec(params.segmentId, params.offset, params.portion, localPaths, function(){
				response.debug('Handled');
				response.writeHead(200);
				response.end('OK');				
			}, function(err){
				This.errorResponse(response, 500, err);
			});
		}
	}, 
	function(err){
		This.errorResponse(response, 500, err);
	});
};

module.exports.KalturaSegmentManager = KalturaSegmentManager;
