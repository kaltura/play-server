
var os = require('os');
var url = require('url');
var querystring = require('querystring');

var KalturaChildProcess = function(){
	KalturaLogger.log('Initializing');

	this.managers = {};
	this.start();
};

KalturaChildProcess.prototype = require('./KalturaServer').extend();

KalturaChildProcess.prototype.start = function(){
	var httpPort = this.config.cloud.httpPort;
	KalturaLogger.log('Listening on port [' + httpPort + ']');
	var This = this;
	this.webServer.on('request', function(request, response) {
		return This.handleRequest(request, response);
	});
	this.webServer.listen(httpPort);
};

KalturaChildProcess.prototype.parseUrl = function(str) {
	var urlInfo = url.parse(str);

	var pathParts = urlInfo.pathname.split('/');
	if(pathParts.length < 3)
		return null;

	urlInfo.service = pathParts[1][0].toUpperCase() + pathParts[1].substr(1).toLowerCase();
	urlInfo.action = pathParts[2].toLowerCase();
	urlInfo.params = querystring.parse(urlInfo.query);
	
	var paramName = null;
	for(var i = 3; i < pathParts.length; i++){
		if(paramName == null){
			paramName = pathParts[i];
		}
		else{
			urlInfo.params[paramName] = pathParts[i];
			paramName = null;
		}
	}
	
	return urlInfo;
};

KalturaChildProcess.prototype.handleRequest = function(request, response) {

	response.requestId = this.getUniqueId();
	
	KalturaLogger.log('Request [' + response.requestId + ']: ' + request.url);
    
	response.setHeader("X-Me", this.hostname);
	response.setHeader("X-Kaltura-Session", response.requestId);
	
	var errorMessage = 'Service not found';
	var urlInfo = this.parseUrl(request.url);
	if(urlInfo){

		KalturaLogger.log('Request [' + response.requestId + '] service [' + urlInfo.service + '] action [' + urlInfo.action + ']');

	    var service = this.managers[urlInfo.service];
		if(!service){	
			var serviceModule = './managers/Kaltura' + urlInfo.service + 'Manager';
			try{
				service = require(serviceModule).init(this.config);
			}
			catch(err){
				KalturaLogger.error(err);
				errorMessage = 'Service [' + urlInfo.service + '] not found';
			}

			if(service){
				if(service[urlInfo.action] && typeof service[urlInfo.action] === 'function'){
					service[urlInfo.action].apply(service, [request, response, urlInfo.params]);
					return;
				}
				errorMessage = 'Action [' + urlInfo.action + '] not found in service [' + urlInfo.service + ']';
			}
		}
	}

	KalturaLogger.error('Request [' + response.requestId + '] ' + errorMessage);
    response.writeHead(404, {
        'Content-type': 'text/plain'
    });
    response.end(errorMessage);
};

module.exports = new KalturaChildProcess();
