
var os = require('os');
var memcached = require('memcached');
var memcachedbin = require('./memcachedbin'); //TODO - move to a single cache
var memjs = require('memjs'); // TODO use this lib only
var path = require('path');

KalturaCache = {
	config : null,
	server : null,
	binserver: null,
	binserverSet: null,
	dataVersion: 0,
		
	init: function(){
		this.config = KalturaConfig.config.memcache;
		this.server = new memcached(this.config.hostname + ':' + this.config.port, this.config);
		
		this.binserver = new memcachedbin();
		this.binserver.host = this.config.hostname;
		this.binserver.port = this.config.port;

//		this.binserver.on('connect', function() {
//		TODO: start server async	
//		});

		this.binserver.connect();
		
		this.binserverSet = memjs.Client.create(this.config.hostname + ':' + this.config.port);
		
		if(this.config.dataVersion){
			this.dataVersion = parseInt(this.config.dataVersion);
		}
	},
	
	//KEY PREFIXES
	AD_MEDIA_KEY_PREFIX: 'adMedia',
	AD_HANDLED_KEY_PREFIX: 'adHandled',
	
	BLACK_HANDLED_KEY_PREFIX: 'blackHandled',
	BLACK_MEDIA_KEY_PREFIX: 'blackMedia',
	BLACK_ENCODING_PARAMS_KEY_PREFIX: 'blackEncodingParams',
	
	CUE_POINT_URL_KEY_PREFIX: 'cuePointUrl',
	CUE_POINT_HANDLED_KEY_PREFIX: 'cuePointHandled',
	CUE_POINT_WATCHER_HANDLED_KEY_PREFIX: 'cuePointWatcherHandled',
	CAN_PLAY_AD_KEY_PREFIX: 'canPlayAd',
	
	ENTRY_CUE_POINTS_KEY_PREFIX: 'entryCuePoints',
	ENTRY_ELAPSED_TIME_KEY_PREFIX: 'entryElapsedTime',
	ENTRY_REQUIRED_KEY_PREFIX: 'entryRequired',
	ENCODING_PARAMS_KEY_PREFIX: 'encodingParams',
	
	FILE_DOWNLOADING_KEY_PREFIX: 'fileDownloading',
	
	MASTER_MANIFEST_REQUIRED_KEY_PREFIX: 'masterRequired',
	MANIFEST_CONTENT_KEY_PREFIX: 'manifestContent',
	METADATA_READY_KEY_PREFIX: 'metadataReady',
	MEDIA_INFO_KEY_PREFIX: 'mediaInfo',
	
	OLDEST_SEGMENT_TIME_KEY_PREFIX: 'oldestSegmentTime',
	
	PROCESS_ACTIONS_KEY_PREFIX: 'processActions',
	
	RENDITION_MANIFEST_HANDLED_KEY_PREFIX: 'renditionManifestHandled',
	
	SERVER_PROCESSES_KEY_PREFIX: 'serverProcesses',
	SEGMENT_MEDIA_KEY_PREFIX: 'segmentMedia',
	SERVER_AD_ID_KEY_PREFIX: 'serverAdId',
	
	TRACKING_KEY_PREFIX: 'tracking',
	
	UI_CONF_CONFIG_KEY_PREFIX: 'uiConfConfig',
		
	//KEY SUFFIX
	METADATA_KEY_SUFFIX: 'metadata',
	
	
	getManifestId : function(manifestUrl) {
		if(KalturaConfig.config.cache.hackWowzaUniqueSession && parseInt(KalturaConfig.config.cache.hackWowzaUniqueSession)){
    		// hack Wowza per session unique key
			manifestUrl = manifestUrl.replace(/\/chunklist_w\d+_(b\d+).m3u8$/, 'chunklist_$1.m3u8');
		}
		
		return manifestUrl.md5();
	},

	getEncodingId : function(encodingParams){
		return encodingParams.md5();
	},
	
	getPid : function(pid){
		if(!pid){
			pid = process.pid;
		}
		return pid;
	},

	getSegmentId : function(portion, cuePointId, renditionId) {
		return (portion + '-' + cuePointId + '-' + renditionId).md5();
	},

	getPreSegmentId : function(cuePointId, renditionId) {
		return this.getSegmentId('left', cuePointId, renditionId);
	},

	getPostSegmentId : function(cuePointId, renditionId) {
		return this.getSegmentId('right', cuePointId, renditionId);
	},
	
	getStack : function() {
		return new Error();
	},
	
	getRenditionIdFromMediaInfo: function(mediaInfoKey){
		var keyPrefix = this.getKey(this.MEDIA_INFO_KEY_PREFIX, []) + '-';
		return mediaInfoKey.substring(keyPrefix.length);
	},
	
	buildEntryRequiredValue: function(renditionId){
		return '\n' + renditionId;
	},
	
	extractEntryRequiredValue: function(entryRequired){
		if(!entryRequired){
			return [];
		}
		return entryRequired.split('\n').unique();
	},
	
	buildSessionServerAdIdValue: function(sessionServerAdId, sequence){
		return '\n' + sequence + ';' + JSON.stringify(sessionServerAdId); 
	},
	
	extractSessionServerAdIdValue: function(sessionServerAdId){
		sessionServerAdId = sessionServerAdId.split('\n');
		var serverAdIds = [];
		
		for(var i = 0; i<= sessionServerAdId.length; i++){
			if(sessionServerAdId[i]){
				var serverAdId = sessionServerAdId[i].split(';');
				serverAdIds[serverAdId[0]]=JSON.parse(serverAdId[1]);
			}
		}
		
		return serverAdIds;
	},

	getKey: function(keyPrefix, params, keySuffix){
		var key = keyPrefix;
		for(var i = 0; i< params.length; i++){
			key += '-' + params[i];
		}
		if(keySuffix){
			key += '-' + keySuffix;
		}		
		
		key = 'v' + this.dataVersion + '-' + key;
		return key;
	},
	
	get : function(key, callback, errorCallback) {
		var stackSource = this.getStack();
		KalturaLogger.debug('Cache.get [' + key + ']...', stackSource);
		this.server.get(key, function(err, data){
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
		});
	},

	set : function(key, value, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			throw new Error('Cache.set [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		this.server.set(key, value, lifetime, function(err){
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
		});
	},

	touch : function(key, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			throw new Error('Cache.touch [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
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
			this.server.touch(key, lifetime, function(err, value){
				if(err){
					cacheTouchCallback(err);
				}
				else if(value){
					cacheTouchCallback();
				}
				else{
					cacheTouchCallback('value is null');
				}
			});
		}
		else{
			var This = this;
			this.server.get(key, function(err, value){
				if(err){
					cacheTouchCallback(err);
				}
				else if(value){
					This.server.set(key, value, lifetime, cacheTouchCallback);
				}
				else{
					cacheTouchCallback('value is null');
				}
			});
		}
	},

	add : function(key, value, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			throw new Error('Cache.set [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		this.server.add(key, value, lifetime, function(err){
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
		});
	},

	append : function(key, value, callback, errorCallback) {
		var stackSource = this.getStack();
		this.server.append(key, value, function(err){
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
		});
	},

	getMulti : function(keys, callback, errorCallback) {
		var stackSource = this.getStack();
		var missingAnswers = keys.length;
		var answers = {};
		
		keys.forEach(function(key, index, array){
			KalturaCache.server.get(key, function(err, data){
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
    		});
		});
	},

	del : function(key, callback, errorCallback) {
		var stackSource = this.getStack();
		return this.server.del(key, function(err){
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
		});
	},

	replace : function(key, value, lifetime, callback, errorCallback) {
		if(!lifetime || isNaN(lifetime)){
			throw new Error('Cache.set [' + key + ']: lifetime [' + lifetime + '] is not numeric');
		}
		lifetime = parseInt(lifetime);
		var stackSource = this.getStack();
		return this.server.replace(key, value, lifetime, function(err){
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
		});
	},
	
	getBinary : function(key, callback, errorCallback) {
		var stackSource = this.getStack();
		KalturaLogger.debug('Cache.getBinary [' + key + ']...', stackSource);
		this.binserver.get(key, function(err, data){
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
		});
	},
	
	getMultiBinary : function(keys, callback, errorCallback) {
		var stackSource = this.getStack();
		var missingAnswers = keys.length;
		var answers = {};
		
		keys.forEach(function(key, index, array){
			KalturaCache.binserver.get(key, function(err, data){
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
    		});
		});
	},
};
KalturaCache.init();
