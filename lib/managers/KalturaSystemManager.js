var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service system
 */
var KalturaSystemManager = function(){};
util.inherits(KalturaSystemManager, kaltura.KalturaManager);

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
