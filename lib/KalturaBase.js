
var os = require('os');
var fs = require('fs');
var url = require('url');
var util = require('util');
var http = require('http');
var crypto = require('crypto');
var memcached = require('memcached');
var querystring = require('querystring');

var kaltura = {
	client: require('./client/KalturaClientBase')
};

// add startsWith/endsWith functions to string
if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function(str) {
		return this.slice(0, str.length) == str;
	};
}

if (typeof String.prototype.endsWith != 'function') {
	String.prototype.endsWith = function(str) {
		return this.slice(-str.length) == str;
	};
}

if (typeof String.prototype.md5 != 'function') {
	String.prototype.md5 = function() {
		return crypto.createHash('md5').update(new Buffer(this)).digest('hex');
	};
}

KalturaLogger = {
	prefix: function(stackSource){
		var d = new Date();
		var time = d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
		
		if(!stackSource)
			stackSource = new Error();
		var stack = stackSource.stack.split('\n');
		var stackLevel = 3;
		var line = stack[stackLevel].trim().split(' ');
		line = line[1];
		if(line.startsWith('Object.'))
			line = line.substr(7);
		else if(line.indexOf('/') > 0)
			line = line.substr(line.lastIndexOf('/') + 1);
		else if(line.indexOf('\\') > 0)
			line = line.substr(line.lastIndexOf('\\') + 1);
		
		return '[' + process.pid + '][' + time + '][' + line + ']';
	},
	
	debug: function(str, stackSource){
		// TODO check configuration to know if debug enabled
		console.log(this.prefix(stackSource) + ' DEBUG: ' + str);
	},
	
	log: function(str, stackSource){
		console.log(this.prefix(stackSource) + ' INFO: ' + str);
	},
	
	error: function(str, stackSource){
		console.error(this.prefix(stackSource) + ' ERROR: ' + str);
	},
	
	dir: function(object, stackSource){
		console.log(this.prefix(stackSource) + ' INFO: ');
		console.dir(object);
	}
};

util.inherits(KalturaLogger, kaltura.client.IKalturaLogger);


var KalturaCache = function(config) {
	this.config = config;
	this.server = new memcached(config.hostname + ':' + config.port, config);
};

KalturaCache.prototype = {
	config : null,
	server : null,

	getManifestId : function(manifestUrl) {
		return manifestUrl.md5();
	},

	getServerProcesses : function() {
		return 'serverProcesses-' + os.hostname();
	},

	getProcessActions : function(pid) {
		if(!pid){
			pid = process.pid;
		}
			
		return 'processActions-' + pid;
	},

	getCuePoints : function(entryId) {
		return 'entryCuePoints-' + entryId;
	},

	getElapsedTime : function(entryId) {
		return 'entryElapsedTime-' + entryId;
	},

	getEntryRequired : function(entryId) {
		return 'entryRequired-' + entryId;
	},
	
	getFlavorManifestHandled :function(manifestUrl) {
		return 'flavorManifestHandled-' + this.getManifestId(manifestUrl);
	}, 

	getManifestContent : function(manifestId) {
		return 'manifestContent-' + manifestId;
	},

	getAdHandled : function(serverAdId) {
		return ''; // TODO
	},

	getAdMedia : function(serverAdId) {
		return ''; // TODO
	},

	getLastUsedSegment : function(manifestUrl) {
		return 'lastUsedSegment-' + this.getManifestId(manifestUrl);
	},

	getSegmentMedia : function(segmentId) {
		return ''; // TODO
	},

	getPlayerAdId : function(entryId, cuePointId) {
		return 'player-' + entryId + '-' + cuePointId;
	},

	getPreSegmentId : function(entryId, encodingParamsId) {
		return 'pre-' + entryId + '-' + encodingParamsId;
	},

	getPostSegmentId : function(entryId, encodingParamsId) {
		return 'post-' + entryId + '-' + encodingParamsId;
	},

	get : function(key, callback, errorCallback) {
		var stackSource = new Error();
		this.server.get(key, function(err, data){
			if(err){
				var errMessage = 'Cache.get [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.get [' + key + ']: OK', stackSource);
				if(callback)
					callback(data);
			}
		});
	},

	set : function(key, value, lifetime, callback, errorCallback) {
		var stackSource = new Error();
		this.server.set(key, value, lifetime, function(err){
			if(err){
				var errMessage = 'Cache.set [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.set [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		});
	},

	touch : function(key, value, lifetime, callback, errorCallback) {
		var stackSource = new Error();
		var cacheTouchCallback = function(err){
			if(err){
				var errMessage = 'Cache.touch [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.touch [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		};
		
		if(parseInt(this.config.touchEnabled)){
			this.server.touch(key, lifetime, cacheTouchCallback);
		}
		else{
			this.server.set(key, value, lifetime, cacheTouchCallback);
		}
	},

	add : function(key, value, lifetime, callback, errorCallback) {
		var stackSource = new Error();
		this.server.add(key, value, lifetime, function(err){
			if(err){
				var errMessage = 'Cache.add [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.add [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		});
	},

	append : function(key, value, callback, errorCallback) {
		var stackSource = new Error();
		this.server.append(key, value, function(err){
			if(err){
				var errMessage = 'Cache.append [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.append [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		});
	},

	getMulti : function(keys, callback, errorCallback) {
		var stackSource = new Error();
		return this.server.getMulti(keys, function(err, data){
			if(err){
				var errMessage = 'Cache.getMulti [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.getMulti [' + key + ']: OK', stackSource);
				if(callback)
					callback(data);
			}
		});
	},

	del : function(key, callback, errorCallback) {
		var stackSource = new Error();
		return this.server.del(key, function(err){
			if(err){
				var errMessage = 'Cache.del [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.del [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		});
	},

	replace : function(key, value, lifetime, callback, errorCallback) {
		var stackSource = new Error();
		return this.server.replace(key, value, lifetime, function(err){
			if(err){
				var errMessage = 'Cache.replace [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.replace [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		});
	}
};

var KalturaBase = function(config) {
	if(config)
		this.init(config);
};

KalturaBase.processData = null;
KalturaBase.prototype = {
	hostname: os.hostname(),
	config : null,

	init : function(config) {
		this.config = config;

		if(!this.cache)
			this.cache = new KalturaCache(config.memcache);
	},

	getUniqueId : function(){
		return Math.floor(Math.random() * 10000000000000001).toString(36);
	},

	getSignature : function(data){
		return (this.config.cloud.secret + data).md5();
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
			if (response.statusCode != 200 && errorCallback) { // TODO check whether redirect can be handled automatically by node
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
				localPaths[i] = os.tmpdir() + '/' + this.getUniqueId();
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

	downloadHttpUrl : function(urlStr, localPath, successCallback, errorCallback) {
		
		if(!localPath){
			localPath = os.tmpdir() + '/' + this.getUniqueId();
		}
		
		parsedUrl = url.parse(urlStr);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};

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
		
		var playServerUrl = this.getPlayServerUrl(service, action, signedParams, this.config.cloud.internalDomain);
		KalturaLogger.log('Call [' + playServerUrl + ']');
		this.getHttpUrl(playServerUrl, successCallback, failureCallback);
	},

	getPlayServerUrl : function(service, action, params, domain){
		if(!domain)
			domain = this.config.cloud.domain;
		
		var port = this.config.cloud.domainPort;
		if(!port){
			port = this.config.cloud.httpPort;
		}
		
		var playServerUrl = 'http://' + domain + ':' + port;
		playServerUrl += '/' + service + '/' + action;
		playServerUrl += '?' + querystring.stringify(params);
		
		return playServerUrl;
	},

	callRestorableAction : function(service, action, params){
		var actionId = this.getUniqueId();
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
		
		var processActionsKey = this.cache.getProcessActions();
		if(KalturaBase.processData){
			KalturaBase.processData[actionData.actionId] = actionData;
			this.cache.replace(processActionsKey, KalturaBase.processData, 600, savedSuccessfully, function(err){});
		}
		else{
			KalturaBase.processData = {};
			KalturaBase.processData[actionData.actionId] = actionData;
			this.cache.add(processActionsKey, KalturaBase.processData, 600, function(){
				KalturaBase.processActionsInterval = setInterval(function(){
					This.cache.touch(processActionsKey, KalturaBase.processData, 600);
				}, 500000);
				savedSuccessfully();
			}, function(err){
				This.cache.replace(processActionsKey, KalturaBase.processData, 600, savedSuccessfully, function(err){});
			});
		}
	},

	unstoreAction : function(actionData){
		KalturaLogger.log('Action [' + actionData.actionId + ']');
		
		delete KalturaBase.processData[actionData.actionId];
		
		var processActionsKey = this.cache.getProcessActions();
		this.cache.replace(processActionsKey, KalturaBase.processData, 600);
	},

	errorResponse : function(response, statusCode, body) {
		response.writeHead(statusCode, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.end(body);
	},

	errorFileNotFound : function(response) {
		this.errorResponse(response, 404, 'Not found!\n');
	},

	errorMissingParameter : function(response) {
		this.errorResponse(response, 400, 'Missing parameter\n');
	}
};

module.exports.KalturaBase = KalturaBase;
