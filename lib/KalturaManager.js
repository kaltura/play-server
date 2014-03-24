
var os = require('os');
var fs = require('fs');
var url = require('url');
var util = require('util');
var http = require('http');
var querystring = require('querystring');

var kaltura = module.exports = require('./KalturaBase');

var KalturaManager = function() {
};
util.inherits(KalturaManager, kaltura.KalturaBase);
	
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
	response.done();
};

module.exports.KalturaManager = KalturaManager;
