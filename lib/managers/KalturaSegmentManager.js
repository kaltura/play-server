
var os = require('os');
var child_process = require('child_process');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service segment
 */
var KalturaSegmentManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaSegmentManager, kaltura.KalturaManager);


/**
 * Stitch the segment
 * 
 * @param segmentId
 * @param offset
 * @param portion
 * @param paths Array
 */
KalturaSegmentManager.prototype.exec = function(segmentId, offset, portion, paths){
	var outputPath = os.tmpdir() + '/' + segmentId;
	
	var ffmpegPath = 'ffmpeg';
	var ffprobePath = 'ffprobe';
	if(this.config.bin.ffmpegPath){
		ffmpegPath = this.config.bin.ffmpegPath;
	}
	if(this.config.segment.ffprobePath){
		ffprobePath = this.config.bin.ffprobePath;
	}
		
	var cmd = [
		'bin/ts_cutter',
		outputPath,
		ffmpegPath,
		ffprobePath, 
		offset, 
		portion
	];
	cmd = cmd.concat(paths).join(' ');
	
	var childProcess = child_process.exec(cmd, function (error, stdout, stderr) {
		KalturaLogger.log('cmd: ' + cmd);
		KalturaLogger.log('stdout: ' + stdout);
		
		if(stderr.length){
			KalturaLogger.error('cmd: ' + cmd);
			KalturaLogger.error('stderr: ' + stderr);
		}
		
	    if (error) {
	    	KalturaLogger.error('exec error: ' + error);
	    }
	    else{
	    	var segmentKey = This.cache.getSegmentMedia(segmentId);
	    	This.cache.setMedia(segmentKey, outputPath);
	    }
	});

	KalturaLogger.log('Started ts cutter process [' + childProcess.process.pid + ']');
};


/**
 * Stitch black segment and save to cache
 * 
 * @action stitchBlack
 * @param renditionId
 */
KalturaSegmentManager.prototype.stitchBlack = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['renditionId']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);

	var outputPath = os.tmpdir() + '/black-' + params.renditionId;
	
	var ffmpegPath = 'ffmpeg';
	if(this.config.bin.ffmpegPath){
		ffmpegPath = this.config.bin.ffmpegPath;
	}
	
	var This = this;
	var blackEncodingParamsKey = this.cache.getEncodingParams(params.renditionId);
	this.cache.get(blackEncodingParamsKey, function(blackEncodingParams){

		KalturaLogger.log('Request [' + response.requestId + '] handled');
		response.writeHead(200);
		response.end('OK');
		
		var cmd = [
			ffmpegPath,
			blackEncodingParams, 
			'-y', 
			outputPath
		];
		cmd = cmd.concat(paths).join(' ');
		
		var childProcess = child_process.exec(cmd, function (error, stdout, stderr) {
			KalturaLogger.log('Request [' + response.requestId + '] cmd: ' + cmd);
			KalturaLogger.log('Request [' + response.requestId + '] stdout: ' + stdout);
			
			if(stderr.length){
				KalturaLogger.error('Request [' + response.requestId + '] cmd: ' + cmd);
				KalturaLogger.error('Request [' + response.requestId + '] stderr: ' + stderr);
			}
			
		    if (error) {
		    	KalturaLogger.error('Request [' + response.requestId + '] exec error: ' + error);
		    }
		    else{
		    	var blackMediaKey = This.cache.getBlackMedia(params.renditionId);
		    	This.cache.setMedia(blackMediaKey, outputPath);
		    }
		});

		KalturaLogger.log('Request [' + response.requestId + '] started ffmpeg process [' + childProcess.process.pid + ']');
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
	
	KalturaLogger.dir(params);
	
	var This = this;
	var urls = [params.url1, params.url2, params.url3];
	this.downloadMultiHttpUrls(urls, null, function(localPaths){
		if(!This.run){
			KalturaLogger.log('Request [' + response.requestId + '] canceled');
			response.writeHead(200);
			response.end('Stopped');
			return;
		}
		
		KalturaLogger.log('Request [' + response.requestId + '] handled');
		response.writeHead(200);
		response.end('OK');

		This.exec(params.segmentId, params.offset, params.portion);
	}, 
	function(err){
		This.errorResponse(response, 500, err);
	});
};

module.exports.KalturaSegmentManager = KalturaSegmentManager;
