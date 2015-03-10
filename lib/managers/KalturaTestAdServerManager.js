var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service testAdServer
 */
var KalturaTestAdServerManager = function(){
    this.vastPool = [
        'http://projects.kaltura.com/vast/vast1.xml', 
        'http://projects.kaltura.com/vast/vast2.xml',
        'http://projects.kaltura.com/vast/vast3.xml',
        'http://projects.kaltura.com/vast/vast4.xml',
        'http://projects.kaltura.com/vast/vast5.xml',
        'http://projects.kaltura.com/vast/vast6.xml',
        'http://projects.kaltura.com/vast/vast7.xml',
        'http://projects.kaltura.com/vast/vast8.xml',
        'http://projects.kaltura.com/vast/vast9.xml',
        'http://projects.kaltura.com/vast/vast10.xml',
    ];	
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
	var randomAdId = Math.floor(Math.random()*10);
	var This = this;
	var vastUrl = this.vastPool[randomAdId];
	this.getHttpUrl(vastUrl, null, function(vastContent){
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
