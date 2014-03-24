
var os = require('os');
var fs = require('fs');
var url = require('url');
var util = require('util');
var http = require('follow-redirects').http;
var crypto = require('crypto');
var querystring = require('querystring');

var KalturaUtils = require('./utils/KalturaUtils');
var KalturaCache = require('./utils/KalturaCache');
var KalturaLogger = require('./utils/KalturaLogger');
var KalturaConfig = require('./utils/KalturaConfig');

var kaltura = {
	client: require('./client/KalturaClientBase')
};

var KalturaBase = function() {
};

KalturaBase.processData = null;
KalturaBase.prototype = {
	hostname: os.hostname(),

	getSignature : function(data){
		return (KalturaConfig.config.cloud.secret + data).md5();
	},

	getHttpUrl : function(urlStr, successCallback, errorCallback) {
		parsedUrl = url.parse(urlStr);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};

		var request = http.request(options, function(response) {
			if (response.statusCode != 200 && errorCallback) {
				return errorCallback('Invalid http status: ' + response.statusCode);
			}

			var fullData = '';
			response.on('data', function(data) {
				fullData += data;
			});
			response.on('end', function() {
				if(successCallback){
					successCallback(fullData);
				}
			});
		});

		request.on('error', function(e) {
			if(errorCallback){
				errorCallback(e.message);
			}
		});

		request.end();
	},

	downloadMultiHttpUrls : function(urls, localPaths, successCallback, errorCallback) {
		var missingResults = urls.length;

		if(!localPaths){
			localPaths = [];
			for(var i = 0; i < urls.length; i++){
				localPaths[i] = os.tmpdir() + '/' + KalturaUtils.getUniqueId();
			}
		}
		
		var singleSuccessCallback = function(){
			missingResults--;
			
			if(!missingResults){
				successCallback(localPaths);
			}
		};
		
		for(var i = 0; i < urls.length; i++){
			this.downloadHttpUrl(urls[i], localPaths[i], singleSuccessCallback, errorCallback);
		}
	},

	downloadHttpUrl : function(urlStr, options, successCallback, errorCallback) {
		
		var localPath = null;
		if(typeof options === 'object'){
			if(options.localPath){
				localPath = options;
			}
		}
		else{
			localPath = options;
			options = {};
		}
		if(!localPath){
			localPath = os.tmpdir() + '/' + KalturaUtils.getUniqueId();
		}
		
		parsedUrl = url.parse(urlStr);
		options.hostname = parsedUrl.hostname;
		options.port = parsedUrl.port;
		options.path = parsedUrl.path;
		options.method = 'GET';

		var localFile = fs.createWriteStream(localPath);
		var request = http.request(options, function(response) {
			response.pipe(localFile);

			localFile.on('finish', function() {
				localFile.close();
				successCallback(localPath);
		    });
		});

		request.on('error', function(e) {
			errorCallback(e.message);
		});

		request.end();
	},
	
	callPlayServerService : function(service, action, params, successCallback, failureCallback){

		var data = new Buffer(JSON.stringify(params)).toString('base64');
		var signedParams = {
			data: data, 
			signature: this.getSignature(data)
		};
		
		var playServerUrl = this.getPlayServerUrl(service, action, signedParams, KalturaConfig.config.cloud.internalDomain);
		KalturaLogger.log('Call [' + playServerUrl + ']');
		this.getHttpUrl(playServerUrl, successCallback, failureCallback);
	},

	encrypt : function(params){
		if(!this.cipher){
			this.cipher = crypto.createCipher('aes-256-cbc', KalturaConfig.config.cloud.secret);
		}

		this.cipher.update(querystring.stringify(params), 'utf8', 'base64');
		var encrypted = this.cipher.final('base64');
		return {e: encrypted};
	},

	decrypt : function(encrypted){
		if(!this.decipher){
			this.decipher = crypto.createDecipher('aes-256-cbc', KalturaConfig.config.cloud.secret);
		}

		this.decipher.update(encrypted, 'base64', 'utf8');
		var decrypted = this.decipher.final('utf8');
		
		return querystring.parse(decrypted);
	},

	getPlayServerUrl : function(service, action, params, domain){
		if(!domain)
			domain = KalturaConfig.config.cloud.domain;
		
		var port = KalturaConfig.config.cloud.domainPort;
		if(!port){
			port = KalturaConfig..cloud.httpPort;
		}
		
		if(params.encrypt){
			delete params.encrypt;
			params = this.encrypt(params);
		}
		
		var playServerUrl = 'http://' + domain + ':' + port;
		playServerUrl += '/' + service + '/' + action;
		playServerUrl += '?' + querystring.stringify(params);
		
		return playServerUrl;
	},

	callRestorableAction : function(service, action, params){
		var actionId = KalturaUtils.getUniqueId();
		var actionData = {
			actionId: actionId, 
			service: service, 
			action: action, 
			params: params
		};
		
		var This = this;
		this[action](params, function(){
			This.unstoreAction(actionData);
		});
		
		this.storeAction(actionData);
	},

	restoreAction : function(actionData){
		KalturaLogger.log('Action [' + actionData.actionId + ']');
		actionData.params.restored = true;
		this.callPlayServerService(actionData.service, 'restore', actionData);
	},

	storeAction : function(actionData){
		KalturaLogger.log('Action [' + actionData.actionId + ']');

		var This = this;
		var savedSuccessfully = function(err){
			KalturaLogger.log('Action [' + actionData.actionId + '] saved successfully');	
		};
		
		var processActionsKey = KalturaCache.getProcessActions();
		if(KalturaBase.processData){
			KalturaBase.processData[actionData.actionId] = actionData;
			KalturaCache.replace(processActionsKey, KalturaBase.processData, 600, savedSuccessfully, function(err){});
		}
		else{
			KalturaBase.processData = {};
			KalturaBase.processData[actionData.actionId] = actionData;
			KalturaCache.add(processActionsKey, KalturaBase.processData, 600, function(){
				KalturaBase.processActionsInterval = setInterval(function(){
					KalturaCache.set(processActionsKey, KalturaBase.processData, 600);
				}, 500000);
				savedSuccessfully();
			}, function(err){
				KalturaCache.replace(processActionsKey, KalturaBase.processData, 600, savedSuccessfully, function(err){});
			});
		}
	},

	unstoreAction : function(actionData){
		KalturaLogger.log('Action [' + actionData.actionId + ']');
		
		delete KalturaBase.processData[actionData.actionId];
		
		var processActionsKey = KalturaCache.getProcessActions();
		KalturaCache.replace(processActionsKey, KalturaBase.processData, 600);
	},

	setCookie : function(response, key, value, maxAge) {
		var options = {};
		
		if(maxAge){
			options.maxAge = maxAge;
		}
		
		response.setHeader('Set-Cookie', [key + '=' + value, options]);
	},

	getCookie : function(request, cookie) {
	    var cookies = request.headers.cookie.split(';');
		for(var i = 0; i < cookies.length; i++) {
			var parts = cookies[i].split('=');
			if(parts.shift().trim() == cookie){
				return unescape(parts.join('='));
			}
		};
		return null;
	},

	errorResponse : function(response, statusCode, body) {
		response.writeHead(statusCode, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.done(body);
	},

	errorFileNotFound : function(response) {
		this.errorResponse(response, 404, 'Not found!\n');
	},

	errorMissingParameter : function(response) {
		this.errorResponse(response, 400, 'Missing parameter\n');
	}
};

module.exports.KalturaBase = KalturaBase;
