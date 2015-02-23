var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service system
 */
var KalturaSystemManager = function(){};
util.inherits(KalturaSystemManager, kaltura.KalturaManager);

/**
 * call after log file rotation
 * 
 * @action logRotate.
 * 
 * @param logName
 */
KalturaSystemManager.prototype.logRotate = function(request, response, params){
	response.dir(params);
	if(!params.fileName)
		return;
	KalturaLogger.rotateLogFile(params.fileName);
	return this.okResponse(response, 'OK', 'text/plain');			
};

/**
 * check if server is up
 * 
 * @action ping.
 * 
 */
KalturaSystemManager.prototype.ping = function(request, response, params){
	return this.okResponse(response, 'OK', 'text/plain');			
};


module.exports.KalturaSystemManager = KalturaSystemManager;
