
var os = require('os');
var fs = require('fs');
var url = require('url');
var util = require('util');
var http = require('http');
var querystring = require('querystring');

var kaltura = module.exports = require('./KalturaBase');
kaltura.client = require('./client/KalturaClient');

var KalturaManager = function() {
};
util.inherits(KalturaManager, kaltura.KalturaBase);

KalturaManager.prototype.MANIFEST_ADS_EXTENSION = 1;
KalturaManager.prototype.MANIFEST_NO_ADS_EXTENSION = 0;

/**
 * @type KalturaClient
 */
KalturaManager.prototype.client = null;

/**
 * @type boolean indicates that the client session started and could be used
 */
KalturaManager.prototype.sessionReady = null;

/**
 * Instantiate the client lib and start session
 */
KalturaManager.prototype.initClient = function(config, callback){
	KalturaLogger.log('Initializing client');
	var clientConfig = new kaltura.client.KalturaConfiguration(parseInt(config.partnerId));
	
	for(var configKey in config)
		clientConfig[configKey] = config[configKey];

	clientConfig.setLogger(KalturaLogger);
	clientConfig.clientTag = 'play-server-' + this.hostname;

	var This = this;
	var type = kaltura.client.enums.KalturaSessionType.ADMIN;
	this.sessionReady = false;
	this.client = new kaltura.client.KalturaClient(clientConfig);
	this.client.session.start(function(ks){
		This.sessionReady = true;
		This.client.setKs(ks); //TODO update ks after expiration
		if(callback)
			callback();
	}, config.secret, config.userId, type, config.partnerId, config.expiry, config.privileges);
};


KalturaManager.prototype.getMissingParams = function(params, requiredParams){
	var missingParams = [];
	for(var i = 0; i < requiredParams.length; i++){
		var requiredParam = requiredParams[i];
		if(typeof params[requiredParam] === 'undefined'){
			missingParams.push(requiredParam);
		}
	}
	return missingParams;
};


KalturaManager.prototype.parsePlayServerParams = function(response, playServerParams, requiredParams){
	if (playServerParams.signature != this.getSignature(playServerParams.data)) {
		response.error('Wrong signature');
		this.errorResponse(response, 403, 'Forbidden\n');
		return null;
	}
	
	var str = new Buffer(playServerParams.data, 'base64').toString('ascii');
	var params = JSON.parse(str);
	var missingParams = this.getMissingParams(params, requiredParams);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return null;
	}
		
	return params;
};

KalturaManager.prototype.start = function(){
	this.run = true;
};

KalturaManager.prototype.stop = function(){
	this.run = false;
};

KalturaManager.prototype.restore = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['action', 'params']);
	if(!params)
		return;

	KalturaLogger.dir(params);
	
	this.callRestorableAction(params.service, params.action, params.params);

	response.log('Restored');
	response.writeHead(200);
	response.end();
};

module.exports.KalturaManager = KalturaManager;
