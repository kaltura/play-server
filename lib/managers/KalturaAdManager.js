
var os = require('os');
var child_process = require('child_process');

var kaltura = module.exports = require('../KalturaManager');

var KalturaAdManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaAdManager, kaltura.KalturaManager);

KalturaAdManager.prototype.execCut = function(serverAdId, sourcePath, encodingParams){
	var outputPath = os.tmpdir() + '/' + serverAdId;
	
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
		outputPath];
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
	    	This.cache.setMedia(serverAdKey, outputPath);
	    }
	});

	KalturaLogger.log('Started ffmpeg process [' + childProcess.process.pid + ']');
};

KalturaAdManager.prototype.cut = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['serverAdId', 'url', 'encodingParamsId']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);

	var This = this;
	this.downloadHttpUrl(params.url, null, function(localPath){
		var encodingParamsKey = This.cache.getEncodingParams(params.encodingParamsId);
		This.cache.get(encodingParamsKey, function(encodingParams){
			KalturaLogger.log('Request [' + response.requestId + '] handled');
			response.writeHead(200);
			response.end('OK');
			
			This.execCut(params.serverAdId, localPath, encodingParams);
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
