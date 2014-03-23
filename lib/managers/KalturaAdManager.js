
var os = require('os');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service ad
 */
var KalturaAdManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaAdManager, kaltura.KalturaManager);

KalturaAdManager.CACHE_EXPIRY = 0;

/**
 * Save the ad media to cache
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
		KalturaAdManager.CACHE_EXPIRY, 
		serverAdKey
	];
	cmd = cmd.join(' ');
	cmd.exec();
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
	cmd.exec(function(output){
		This.save(serverAdId, adPath);
	});
};


/**
 * Stitch ad
 * 
 * @action ad.stitch
 * 
 * @param serverAdId
 * @param url
 * @param headers
 * @param encodingId
 */
KalturaAdManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['serverAdId', 'url', 'headers', 'encodingId']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);

	var This = this;
	var options = {
		headers: params.headers
	};
	this.downloadHttpUrl(params.url, options, function(localPath){
		if(!This.run){
			response.log('canceled');
			response.writeHead(200);
			response.done('Stopped');
			return;
		}
		
		var encodingKey = This.cache.getEncodingParams(params.encodingId);
		This.cache.get(encodingKey, function(encodingParams){
			response.log('handled');
			response.writeHead(200);
			response.done('OK');
			
			This.exec(params.serverAdId, localPath, encodingParams);
		}, function(err){
			response.error(msg);
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
