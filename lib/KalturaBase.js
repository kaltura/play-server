
var os = require('os');
var fs = require('fs');
var url = require('url');
var http = require('http');
var crypto = require('crypto');
var memcached = require('memcached');
var querystring = require('querystring');

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
	prefix: function(){
		var d = new Date();
		var time = d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
		
		var stack = new Error().stack.split('\n');
		var line = stack[3].trim().split(' ');
		line = line[1];
		if(line.startsWith('Object.'))
			line = line.substr(7);
		else if(line.indexOf('/') > 0)
			line = line.substr(line.lastIndexOf('/') + 1);
		else if(line.indexOf('\\') > 0)
			line = line.substr(line.lastIndexOf('\\') + 1);
		
		return '[' + process.pid + '][' + time + '][' + line + ']';
	},
	
	log: function(str){
		console.log(this.prefix() + ' ' + str);
	},
	
	error: function(str){
		console.error(this.prefix() + ' ' + str);
	},
	
	dir: function(object){
		console.log(this.prefix() + ': ');
		console.dir(object);
	}
};


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

	getManifestRequired : function(entryId) {
		return 'manifestRequired-' + entryId;
	},
	
	getFlavorManifestHandled :function(manifestUrl) {
		return 'flavorManifestHandled-' + this.getManifestId(manifestUrl);
	}, 

	getManifestContent : function(manifestId) {
		return 'manifestContent-' + manifestId;
	},

	getEntryRequired : function(entryId) {
		return ''; // TODO
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

	getPostSegmentId : function(entryId, params) {
		return ''; // TODO
	},

	getPreSegmentId : function(entryId, params) {
		return ''; // TODO
	},

	get : function(key, callback) {
		this.server.get(key, function(err, data){
			if(err){
				KalturaLogger.error('Cache.get [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.get [' + key + ']: OK');
			}
			if(callback)
				callback(err, data);
		});
	},

	set : function(key, value, lifetime, callback) {
		this.server.set(key, value, lifetime, function(err){
			if(err){
				KalturaLogger.error('Cache.set [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.set [' + key + ']: OK');
			}
			if(callback)
				callback(err);
		});
	},

	touch : function(key, value, lifetime, callback) {
		var delegatedCallback = function(err){
			if(err){
				KalturaLogger.error('Cache.touch [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.touch [' + key + ']: OK');
			}
			if(callback)
				callback(err);
		};
		
		if(this.config.touchEnabled){
			this.server.touch(key, lifetime, delegatedCallback);
		}
		else{
			this.server.set(key, value, lifetime, delegatedCallback);
		}
	},

	add : function(key, value, lifetime, callback) {
		this.server.add(key, value, lifetime, function(err){
			if(err){
				KalturaLogger.error('Cache.add [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.add [' + key + ']: OK');
			}
			if(callback)
				callback(err);
		});
	},

	append : function(key, value, callback) {
		this.server.append(key, value, function(err){
			if(err){
				KalturaLogger.error('Cache.append [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.append [' + key + ']: OK');
			}
			if(callback)
				callback(err);
		});
	},

	getMulti : function(keys, callback) {
		return this.server.getMulti(keys, function(err, data){
			if(err){
				KalturaLogger.error('Cache.getMulti [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.getMulti [' + key + ']: OK');
			}
			if(callback)
				callback(err, data);
		});
	},

	del : function(key, callback) {
		return this.server.del(key, function(err){
			if(err){
				KalturaLogger.error('Cache.del [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.del [' + key + ']: OK');
			}
			if(callback)
				callback(err);
		});
	},

	replace : function(key, value, lifetime, callback) {
		return this.server.replace(key, value, lifetime, function(err){
			if(err){
				KalturaLogger.error('Cache.replace [' + key + ']:' + err);
			}
			else{
				KalturaLogger.log('Cache.replace [' + key + ']: OK');
			}
			if(callback)
				callback(err);
		});
	}
};

var KalturaBase = function() {
};

KalturaBase.processData = null;
KalturaBase.prototype = {
	hostname: os.hostname(),
	config : null,

	init : function(config) {
		KalturaLogger.log('Initializing');

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

		var This = this;
		var request = http.request(options, function(response) {
			if (response.statusCode != 200) { // TODO check whether redirect can be handled automatically by node
				KalturaLogger.error('Invalid http status: ' + response.statusCode);
				return;
			}

			fullData = '';
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
		
		var playServerUrl = 'http://' + domain + ':' + this.config.cloud.httpPort;
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
			if(err){
				KalturaLogger.error('Action [' + actionData.actionId + '] not saved: ' + err);
			}
			else{
				KalturaLogger.log('Action [' + actionData.actionId + '] saved successfully');	
			}
		};
		
		var processActionsKey = this.cache.getProcessActions();
		if(KalturaBase.processData){
			KalturaBase.processData[actionData.actionId] = actionData;
			this.cache.replace(processActionsKey, KalturaBase.processData, 600, savedSuccessfully);
		}
		else{
			KalturaBase.processData = {};
			KalturaBase.processData[actionData.actionId] = actionData;
			this.cache.add(processActionsKey, KalturaBase.processData, 600, function(err){
				if(err){
					This.cache.replace(processActionsKey, KalturaBase.processData, 600, savedSuccessfully);
				}
				else{
					KalturaBase.processActionsInterval = setInterval(function(){
						This.cache.touch(processActionsKey, KalturaBase.processData, 600);
					}, 500000);
					savedSuccessfully();
				}
			});
		}
	},

	unstoreAction : function(actionData){
		KalturaLogger.log('Action [' + actionData.actionId + ']');
		
		delete KalturaBase.processData[actionData.actionId];
		
		var processActionsKey = this.cache.getProcessActions();
		this.cache.replace(processActionsKey, KalturaBase.processData, 600);
	}
};

module.exports = new KalturaBase();
