
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service media
 */
var KalturaMediaManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaMediaManager, kaltura.KalturaManager);

KalturaMediaManager.prototype.serveSegment = function(response, segmentId){
	
};

KalturaMediaManager.prototype.serveAd = function(request, response, playerAdId, chunk, renditionId){
	var serverAdId = this.getCookie(request, playerAdId);
	var This = this;
	var adMediaKey = this.cache.getAdMedia(serverAdId);
	this.cache.get(adMediaKey, function(data){
		if(data){
			This.stitchCuePoints(request, response, params.entryId, function(){
				KalturaLogger.log('Request [' + response.requestId + '] returned from cache');
				response.writeHead(200, {'Content-Type': 'video/MP2T'});
				response.end(data);
			});
		}		
		else{
			KalturaLogger.log('Request [' + response.requestId + '] not found in cache');
			This.errorFileNotFound(response);
		}
	});
};

/**
 * Returns the segment media from cache
 * 
 * @action media.segment
 */
KalturaMediaManager.prototype.segment = function(request, response, params){
	KalturaLogger.dir(params);
	if (!params.segmentId && (!params.playerId || !params.chunk || !params.renditionId)) {
		KalturaLogger.error('Request [' + response.requestId + '] missing arguments');
		this.errorMissingParameter(response);
		return;
	}

	if(params.segmentId){
		this.serveSegment(response, params.segmentId);
	}
	else if(params.playerId){
		this.serveAd(request, response, params.playerAdId, params.chunk, params.renditionId);
	}
};

module.exports.KalturaMediaManager = KalturaMediaManager;
