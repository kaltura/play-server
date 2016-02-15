var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service testAdServer
 * 
 * The service is intended for testing purposes. It simulates different VAST responses for different users
 */
var KalturaTestAdServerManager = function(){
	this.vastPool = [];
	if(KalturaConfig.config.testAdServer.vastUrls){
		this.vastPool = KalturaConfig.config.testAdServer.vastUrls.split(',');
	}
};
util.inherits(KalturaTestAdServerManager, kaltura.KalturaManager);

/**
 * Dummy ad server
 * 
 * @action getVast.
 * 
 * @param eventType
 */
KalturaTestAdServerManager.prototype.getVast = function(request, response, params){
	response.dir(params);
	if(this.vastPool.length == 0){
		response.end('Vast pool is empty');
		return;
	}
	var randomAdId = Math.floor(Math.random()*this.vastPool.length);
	var This = this;
	var vastUrl = this.vastPool[randomAdId];
	KalturaLogger.log('selected vast url: ' + vastUrl);
	KalturaUtils.getHttpUrl(vastUrl, null, function(vastContent){
		response.log('handled');
		This.okResponse(response, vastContent, 'text/xml');		
		},function (err) {
			response.end('Not found');
	});
};

/**
 * Dummy ad server
 * 
 * @action trackBeacon.
 * 
 * @param eventType
 */
KalturaTestAdServerManager.prototype.trackBeacon = function(request, response, params){
	response.log('Handled beacon');
	response.dir(params);
	response.writeHead(200);
	response.end('OK');
};

module.exports.KalturaTestAdServerManager = KalturaTestAdServerManager;
