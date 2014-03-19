
var os = require('os');
var child_process = require('child_process');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service ad
 */
var KalturaAdManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaAdManager, kaltura.KalturaManager);


/**
 * Save the ad media to memcache
 * 
 * @param serverAdId
 * @param adPath
 */
KalturaAdManager.prototype.save = function(serverAdId, adPath){

	var serverAdKey = This.cache.getAdMedia(serverAdId);
	
	var ffprobePath = 'ffprobe';
	if(this.config.bin.ffprobePath){
		ffprobePath = this.config.bin.ffprobePath;
	}
	
	var cmd = [
		'bin/ts_preparer', 
		adPath,
		ffprobePath,
		this.config.memcache.hostname,
		this.config.memcache.port, 
		0, 
		serverAdKey
	];
	cmd = cmd.join(' ');

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
	});

	KalturaLogger.log('Started ts preparer process [' + childProcess.process.pid + ']');
};


/**
 * Executes ffmpef 
 * 
 * @param serverAdId
 * @param sourcePath
 * @param encodingParams
 */
KalturaAdManager.prototype.exec = function(serverAdId, sourcePath, encodingParams){
	var adPath = os.tmpdir() + '/' + serverAdId;
	
	var ffmpegPath = 'ffmpeg';
	if(this.config.bin.ffmpegPath){
		ffmpegPath = this.config.bin.ffmpegPath;
	}
	
	var cmd = [
		ffmpegPath, 
		'-i',
		sourcePath, 
		encodingParams, 
		'-y',
		adPath];
	cmd = cmd.join(' ');
	
	var This = this;
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
	    	var serverAdKey = This.cache.getAdMedia(serverAdId);
	    	This.cache.setMedia(serverAdKey, adPath);
	    }
	});

	KalturaLogger.log('Started ffmpeg process [' + childProcess.process.pid + ']');
};


/**
 * Stitch ad
 * 
 * @action ad.stitch
 * 
 * @param serverAdId
 * @param url
 * @param headers
 * @param renditionId
 */
KalturaAdManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['serverAdId', 'url', 'headers', 'renditionId']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);

	var This = this;
	var options = {
		headers: params.headers
	};
	this.downloadHttpUrl(params.url, options, function(localPath){
		if(!This.run){
			KalturaLogger.log('Request [' + response.requestId + '] canceled');
			response.writeHead(200);
			response.end('Stopped');
			return;
		}
		
		var renditionKey = This.cache.getEncodingParams(params.renditionId);
		This.cache.get(renditionKey, function(encodingParams){
			KalturaLogger.log('Request [' + response.requestId + '] handled');
			response.writeHead(200);
			response.end('OK');
			
			This.exec(params.serverAdId, localPath, encodingParams);
		}, function(err){
			var msg = 'Request [' + response.requestId + '] Cache Error: ' + err;
			KalturaLogger.error(msg);
			This.errorResponse(response, 500, msg);
		});
	}, 
	function(err){
		var msg = 'Request [' + response.requestId + '] HTTP Error: ' + err;
		KalturaLogger.error(msg);
		This.errorResponse(response, 500, msg);
	});
};


module.exports.KalturaAdManager = KalturaAdManager;
