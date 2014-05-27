
var os = require('os');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service ad
 */
var KalturaAdManager = function(){
};
util.inherits(KalturaAdManager, kaltura.KalturaManager);

/**
 * Save the ad media to cache
 * 
 * @param serverAdId
 * @param adPath
 */
KalturaAdManager.prototype.save = function(serverAdId, adPath){

	var serverAdKey = KalturaCache.getAdMedia(serverAdId);
	
	var ffprobePath = 'ffprobe';
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffprobePath){
		ffprobePath = KalturaConfig.config.bin.ffprobePath;
	}
	
	var cmd = [
		'bin/ts_preparer', 
		adPath,
		ffprobePath,
		KalturaConfig.config.memcache.hostname,
		KalturaConfig.config.memcache.port, 
		KalturaConfig.config.cache.adMedia, 
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
	if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffmpegPath){
		ffmpegPath = KalturaConfig.config.bin.ffmpegPath;
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
	params = this.parsePlayServerParams(response, params, ['serverAdId', 'encodingId', 'sharedFilePath']);
	if(!params)
		return;
	
	response.dir(params);

	var This = this;
		
	var encodingKey = KalturaCache.getEncodingParams(params.encodingId);
	KalturaCache.get(encodingKey, function(encodingParams){
		response.log('handled');
		response.writeHead(200);
		response.end('OK');
			
		This.exec(params.serverAdId, params.sharedFilePath, encodingParams);
	}, function(err){
		response.error(msg);
		This.errorResponse(response, 500, msg);
	});

};


module.exports.KalturaAdManager = KalturaAdManager;
