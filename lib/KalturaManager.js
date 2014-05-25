
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

/**
 * @type KalturaClient
 */
KalturaManager.prototype.client = null;

/**
 * Instantiate the client lib and start session
 */
KalturaManager.prototype.initClient = function(config){
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
	}, config.secret, config.userId, type, config.partnerId, config.expiry, config.privileges);
};


KalturaManager.prototype.parsePlayServerParams = function(response, playServerParams, requiredParams){
	if (playServerParams.signature != this.getSignature(playServerParams.data)) {
		response.error('Wrong signature');
		this.errorResponse(response, 403, 'Forbidden\n');
		return null;
	}
	
	var str = new Buffer(playServerParams.data, 'base64').toString('ascii');
	var params = JSON.parse(str);
	var missingParams = [];
	for(var i = 0; i < requiredParams.length; i++){
		var requiredParam = requiredParams[i];
		if(typeof params[requiredParam] === 'undefined'){
			missingParams.push(requiredParam);
		}
	}
	
	if(missingParams.length){
		response.error('Missing arguments');
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

KalturaManager.prototype.getEntry = function(entryId, callback){

	if(this.client == null)
		this.initClient(KalturaConfig.config.client);
		
	this.client.baseEntry.get(callback, entryId);		
};

KalturaManager.prototype.getMetadata = function(entryId, metadataProfileId, callback){
	if(this.client == null)
		this.initClient(KalturaConfig.config.client);
	var filter = new kaltura.client.objects.KalturaMetadataFilter();
	filter.metadataProfileIdEqual = metadataProfileId;
	filter.objectIdEqual = entryId;
	var pager = new kaltura.client.objects.KalturaFilterPager();
	this.client.metadata.listAction(filter, pager, function(metadataList){
		var metadata = null;
		if(metadataList.objects.length > 0)
			metadata = metadataList.objects[0];
		callback(metadata);
	});
};

module.exports.KalturaManager = KalturaManager;
