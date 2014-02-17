
var os = require('os');
var fs = require('fs');
var url = require('url');
var util = require('util');
var http = require('http');
var querystring = require('querystring');

var kaltura = module.exports = require('./KalturaBase');

var KalturaManager = function(config) {
	if(config)
		this.init(config);
};
util.inherits(KalturaManager, kaltura.KalturaBase);
	
KalturaManager.prototype.parsePlayServerParams = function(response, playServerParams){
	if (playServerParams.signature != this.getSignature(playServerParams.data)) {
		this.errorResponse(response, 403, 'Forbidden\n');
		return null;
	}
	
	var str = new Buffer(playServerParams.data, 'base64').toString('ascii');
	return JSON.parse(str);
};

KalturaManager.prototype.restore = function(request, response, params){
	params = this.parsePlayServerParams(response, params);
	if(!params)
		return;

	KalturaLogger.dir(params);
	if (!params.action || !params.params) {
		this.errorMissingParameter(response);
		return;
	}
	
	this.callRestorableAction(params.service, params.action, params.params);

	KalturaLogger.log('Request [' + response.requestId + '] Restored');
	response.writeHead(200);
	response.end();
};

KalturaManager.prototype.errorResponse = function(response, statusCode, body) {
	response.writeHead(statusCode, {
		'Content-Type' : 'text/plain',
		'Access-Control-Allow-Origin' : '*'
	});
	response.end(body);
};

KalturaManager.prototype.errorFileNotFound = function(response) {
	this.errorResponse(response, 404, 'Not found!\n');
};

KalturaManager.prototype.errorMissingParameter = function(response) {
	this.errorResponse(response, 400, 'Missing parameter\n');
};

module.exports.KalturaManager = KalturaManager;
