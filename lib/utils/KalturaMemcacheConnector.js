let util = require('util');
var os = require('os');
var memcached = require('memcached');
var memcachedbin = require('./memcachedbin'); //TODO - move to a single cache
var memjs = require('memjs'); // TODO use this lib only
var path = require('path');
const continuationLocalStorage = require('continuation-local-storage');

KalturaMemcache = {
	config : null,
	server : null,
	binserver: null,
	dataVersion: 0,

	init: function(){
		this.config = KalturaConfig.config.memcache;
		if ('timeout' in this.config) //time is string as default and memcached require number
			this.config.timeout = parseInt(this.config.timeout);

		this.server = new memcached(this.config.hostname + ':' + this.config.port, this.config);
		
		this.binserver = new memcachedbin();
		this.binserver.host = this.config.hostname;
		this.binserver.port = this.config.port;

		this.binserver.connect();

		if (this.config.dataVersion)
			this.dataVersion = parseInt(this.config.dataVersion);
	},

	_namespace: function()
	{
		return continuationLocalStorage.getNamespace('play-server');
	},

	getDataVersion: function()
	{
		return this.dataVersion;
	},

	get : function(key, callback, errorCallback, is_encrypted) {
		const namespace = this._namespace();
		var stackSource = this.getStack();
		KalturaLogger.debug('Cache.get [' + key + ']...', stackSource);
		this.server.get(key,  namespace.bind(function(err, data){
			if(err){
				var errMessage = 'Cache.get [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.get [' + key + ']: OK', stackSource);
				if(callback)
					callback(data);
			}
		}));
	},
	set : function(key, value, lifetime, callback, errorCallback, is_encrypted) {
		if(!lifetime || isNaN(lifetime)){
			KalturaLogger.error('Cache.set [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		const namespace = this._namespace();
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		this.server.set(key, value, lifetime, namespace.bind(function(err){
			if(err){
				var errMessage = 'Cache.set [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.set [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		}));
	},

	touch : function(key, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			KalturaLogger.error('Cache.touch [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		const namespace = this._namespace();
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		var cacheTouchCallback = function(err){
			if(err){
				var errMessage = 'Cache.touch [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.touch [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		};
		
		if(parseInt(this.config.touchEnabled)){
			this.server.touch(key, lifetime, namespace.bind(function(err, value){
				if(err){
					cacheTouchCallback(err);
				}
				else if(value){
					cacheTouchCallback();
				}
				else{
					cacheTouchCallback('value is null');
				}
			}));
		}
		else{
			var This = this;
			this.server.get(key, namespace.bind(function(err, value){
				if(err){
					cacheTouchCallback(err);
				}
				else if(value){
					This.server.set(key, value, lifetime, cacheTouchCallback);
				}
				else{
					cacheTouchCallback('value is null');
				}
			}));
		}
	},

	add : function(key, value, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			KalturaLogger.error('Cache.add [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		const namespace = this._namespace();
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		this.server.add(key, value, lifetime, namespace.bind(function(err){
			if(err){
				var errMessage = 'Cache.add [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.add [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		}));
	},

	append : function(key, value, callback, errorCallback) {
		var stackSource = this.getStack();
		const namespace = this._namespace();
		this.server.append(key, value, namespace.bind(function(err){
			if(err){
				var errMessage = 'Cache.append [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.append [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		}));
	},

	getMulti : function(keys, callback, errorCallback, is_encrypted) {
		var stackSource = this.getStack();
		const namespace = this._namespace();
		var missingAnswers = keys.length;
		var answers = {};
		var This = this;
		keys.forEach(function(key, index, array){
			This.server.get(key, namespace.bind(function(err, data){
    			if(err){
    				var errMessage = 'Cache.getMulti [' + key + ']:' + err;
    				if(errorCallback){
    					errorCallback(errMessage);
    				}
    				else{
    					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
    				}
    			}
    			else{
    				KalturaLogger.debug('Cache.getMulti [' + key + ']: OK', stackSource);
    				answers[key] = data;
        			missingAnswers--;
    				if(!missingAnswers && callback)
    					callback(answers);
    			}
    		}));
		});
	},

	del : function(key, callback, errorCallback) {
		var stackSource = this.getStack();
		const namespace = this._namespace();
		return this.server.del(key, namespace.bind(function(err){
			if(err){
				var errMessage = 'Cache.del [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.del [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		}));
	},

	replace : function(key, value, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			KalturaLogger.error('Cache.set [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		const namespace = this._namespace();
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		return this.server.replace(key, value, lifetime, namespace.bind(function(err){
			if(err){
				var errMessage = 'Cache.replace [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.replace [' + key + ']: OK', stackSource);
				if(callback)
					callback();
			}
		}));
	},

	getStack: function()
	{
		return new Error();
	},

	getBinary : function(key, callback, errorCallback) {
		var stackSource = this.getStack();
		const namespace = this._namespace();
		KalturaLogger.debug('Cache.getBinary [' + key + ']...', stackSource);
		this.binserver.get(key, namespace.bind(function(err, data){
			if(err){
				var errMessage = 'Cache.getBinary [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else{
				KalturaLogger.debug('Cache.getBinary [' + key + ']: OK', stackSource);
				if(callback)
					callback(data);
			}
		}));
	},
	
	getMultiBinary : function(keys, callback, errorCallback) {
		var stackSource = this.getStack();
		const namespace = this._namespace();
		var missingAnswers = keys.length;
		var answers = {};
		var This = this;
		keys.forEach(function(key, index, array){
			This.binserver.get(key, namespace.bind(function(err, data){
    			if(err){
    				var errMessage = 'Cache.getMultiBinary [' + key + ']:' + err;
    				if(errorCallback){
    					errorCallback(errMessage);
    				}
    				else{
    					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
    				}
    			}
    			else{
    				KalturaLogger.debug('Cache.getMultiBinary [' + key + ']: OK', stackSource);
    				answers[key] = data;
        			missingAnswers--;
    				if(!missingAnswers && callback)
    					callback(answers);
    			}
    		}));
		});
	},
};
KalturaMemcache.init();
module.exports = KalturaMemcache;
