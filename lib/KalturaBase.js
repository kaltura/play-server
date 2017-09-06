
var os = require('os');
var util = require('util');
var crypto = require('crypto');
var querystring = require('querystring');
var url = require('url');

var kaltura = {
	client: require('./client/KalturaClient')
};

require('./utils/KalturaUtils');
require('./utils/KalturaConfig');
require('./utils/KalturaCache');
require('./utils/KalturaLogger');

var KalturaBase = function() {
};

KalturaBase.processData = null;
KalturaBase.prototype = {
	hostname: os.hostname(),

	getSignature : function(data){
		return (KalturaConfig.config.cloud.secret + data).md5();
	},

	callPlayServerService : function(service, action, partnerId, params, headers, successCallback, failureCallback){
		if(params && params.partnerId){
			delete params.partnerId;
		}
		var data = new Buffer(JSON.stringify(params)).toString('base64');
		var signedParams = {
			data: data, 
			signature: this.getSignature(data)
		};
		
		var playServerUrl = this.getPlayServerUrl(service, action, partnerId, signedParams);
		KalturaLogger.log('Call [' + playServerUrl + ']');
		KalturaUtils.getHttpUrl(playServerUrl, headers, successCallback, failureCallback);
	},

	encrypt : function(params, encryptedParams){
		var cipher = crypto.createCipher('AES-256-CBC', KalturaConfig.config.cloud.secret);

		var encrypted;
		try{
			encrypted = cipher.update(querystring.stringify(encryptedParams), 'utf8', 'base64');
			encrypted += cipher.final('base64');
		}
		catch(exception){
			KalturaLogger.error(exception.stack);
			return null;
		}
		
		params.e = encrypted.split('/').join('_');
		return params;
	},

	decrypt : function(params){
		var decipher = crypto.createDecipher('AES-256-CBC', KalturaConfig.config.cloud.secret);

		var encrypted = params.e.split('_').join('/');
		delete params.e;
		
		var decrypted;
		try{
			decrypted = decipher.update(encrypted, 'base64', 'utf8');
			decrypted += decipher.final('utf8');
		}
		catch(exception){
			KalturaLogger.error(exception.stack);
			return null;
		}
		
		var decryptedParams = querystring.parse(decrypted);
		
		for(var key in decryptedParams){
			params[key] = decryptedParams[key];
		}
		
		return params;
	},

	getPlayServerUrl : function(service, action, partnerId, params, encryptedParams, domain){
		if(!domain && KalturaConfig.config[service].domain){
			domain = KalturaConfig.config[service].domain;
		}
		if(!domain){
			domain = KalturaConfig.config.cloud.domain;
		}
				
		var port = KalturaConfig.config[service].domainPort;
		if(!port){
			port = KalturaConfig.config.cloud.httpPort;
		}
		
		if(!params){
			params = {};
		}
		
		if(params.partnerId){
			delete params.partnerId;
		}
		
		if(encryptedParams && typeof encryptedParams != 'undefined'){
			params = this.encrypt(params, encryptedParams);
		}
		
		var playServerUrl = 'http://' + domain + ':' + port;
		playServerUrl += '/p/' + partnerId;
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
		KalturaLogger.debug('Action [' + actionData.actionId + ']');
		actionData.params.restored = true;
		this.callPlayServerService(actionData.service, 'restore', actionData.params.partnerId, actionData);
	},

	storeAction : function(actionData){
		KalturaLogger.debug('Action [' + actionData.actionId + ']');

		var savedSuccessfully = function(err){
			KalturaLogger.debug('Action [' + actionData.actionId + '] saved successfully');	
		};
		
		var processActionsKey = KalturaCache.getKey(KalturaCache.PROCESS_ACTIONS_KEY_PREFIX, [KalturaCache.getPid()]);
		if(KalturaBase.processData){
			KalturaBase.processData[actionData.actionId] = actionData;
			KalturaCache.set(processActionsKey, KalturaBase.processData, KalturaConfig.config.cache.restoreableAction, savedSuccessfully);
		}
		else{
			KalturaBase.processData = {};
			KalturaBase.processData[actionData.actionId] = actionData;
			KalturaCache.add(processActionsKey, KalturaBase.processData, KalturaConfig.config.cache.restoreableAction, function(){
				KalturaBase.processActionsInterval = setInterval(function(){
					KalturaCache.set(processActionsKey, KalturaBase.processData, KalturaConfig.config.cache.restoreableAction);
				}, (KalturaConfig.config.cache.restoreableAction - 5) * 1000);
				savedSuccessfully();
			}, function(err){
				KalturaCache.set(processActionsKey, KalturaBase.processData, KalturaConfig.config.cache.restoreableAction, savedSuccessfully, function(err){});
			});
		}
	},

	unstoreAction : function(actionData){
		KalturaLogger.debug('Action [' + actionData.actionId + ']');
		
		delete KalturaBase.processData[actionData.actionId];
		
		var processActionsKey = KalturaCache.getKey(KalturaCache.PROCESS_ACTIONS_KEY_PREFIX, [KalturaCache.getPid()]);
		KalturaCache.set(processActionsKey, KalturaBase.processData, KalturaConfig.config.cache.restoreableAction);
	},

	setCookie : function(response, key, value, maxAge) {
		var options = {};
		
		if(maxAge){
			options.maxAge = maxAge;
		}
		
		response.setHeader('Set-Cookie', [key + '=' + value, options]);
	},

	getCookie : function(request, cookie) {
		if(!request.headers.cookie)
			return null;
		
	    var cookies = request.headers.cookie.split(';');
		for(var i = 0; i < cookies.length; i++) {
			var parts = cookies[i].split('=');
			if(parts.shift().trim() == cookie){
				return unescape(parts.join('='));
			}
		};
		return null;
	},

	okResponse: function(response, body, contentType){
		if(!response.headersSent) {
			response.writeHead(200, {
				'Content-Type': contentType,
				'Cache-Control': 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
				'Pragma': 'no-cache',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
			});
			response.end(body);
		}
	},
	
	redirectResponse: function(response, location){
		if(!response.headersSent) {
			response.writeHead(302, {
				'Location': location,
				'Cache-Control': 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
				'Pragma': 'no-cache',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
			});
			response.end();
		}
	},
	
	dumpResponse: function(response, location){
		parsedUrl = url.parse(location);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};

		var This = this;
		var httpModule = KalturaUtils.getHttpModuleByProtocol(parsedUrl.protocol);
		var request = httpModule.request(options, function(downloadResponse) {
			if (downloadResponse.statusCode != 200) {
				This.errorResponse(response, downloadResponse.statusCode, 'Failed to download url [' + location + ']');
				return;
			}
			downloadResponse.on('data', function(data) {
				response.write(data);		
			});
			downloadResponse.on('end', function() {
				response.log('Finished downloading from url [' + location + ']');
				response.end();			
			});
		});

		request.on('error', function(e) {
			This.errorResponse(response, 404, 'Failed to download url [' + location + ']');
		});

		request.end();			
	},
	
	errorResponse : function(response, statusCode, body) {
		if(!response.headersSent){
			response.writeHead(statusCode, {
				'Content-Type' : 'text/plain',
				'Access-Control-Allow-Origin' : '*',
				'Cache-Control': 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
				'Pragma': 'no-cache'
			});
			response.end(body);
		}
	},

	errorFileNotFound : function(response) {
		this.errorResponse(response, 404, 'Not found!\n');
	},

	errorMissingParameter : function(response) {
		this.errorResponse(response, 400, 'Missing parameter\n');
	},

	errorFaultyParameter : function(response) {
		this.errorResponse(response, 400, 'Faulty parameter\n');
	}
};

module.exports.KalturaBase = KalturaBase;
