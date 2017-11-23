
var os = require('os');
var memcached = require('memcached');
var memcachedbin = require('./memcachedbin'); //TODO - move to a single cache
var memjs = require('memjs'); // TODO use this lib only
var path = require('path');

KalturaCache = {
	config 		 : null,
	server 		 : null,
        binservers       : null,
        binserversSet    : null,
	dataVersion:     0,
		
	init: function(){
		this.config = KalturaConfig.config.memcache;
		
		this.server = new memcached(this.config.hostname + ':' + this.config.port, this.config);
		this.server.on('failure', function( details ){ KalturaLogger.error( "Server " + details.server + " went down due to: " +   details.messages.join( '' ) ) });
		this.server.on('issue',   function( details ){ KalturaLogger.error( "Server " + details.server + " encountered issues: " + details.messages.join( '' ) ) });

		var binserverSetOptions = {retries: this.config.retries || 5, conntimeout: this.config.conntimeout || 5000, timeout: this.config.timeout || 2000};

		var length = this.config.binHostnames.length;
		this.binservers = [];
		this.binserversSet = [];
		for (var i = 0; i < length; i++) {
			var serverName = this.config.binHostnames[i];
			this.binservers[i]  = new memcachedbin();
		        this.binservers[i].host = serverName;
			this.binservers[i].port = this.config.binPort;
		        this.binservers[i].connect();
			this.binserversSet[i] = memjs.Client.create(serverName + ':' + this.config.binPort,  binserverSetOptions);
		}

		if(this.config.dataVersion){
			this.dataVersion = parseInt(this.config.dataVersion);
		}
	},
	
	//KEY PREFIXES
	SEGMENT_FETCHED_PREFIX: 'segmentFetched',
	AD_MEDIA_KEY_PREFIX: 'adMedia',
	AD_HANDLED_KEY_PREFIX: 'adHandled',
	
	FILLER_HANDLED_KEY_PREFIX: 'fillerHandled',
	FILLER_MEDIA_KEY_PREFIX: 'fillerMedia',
	FILLER_ENCODING_PARAMS_KEY_PREFIX: 'fillerEncodingParams',
	
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
	POST_SEGMENT_STITCHED_KEY_PREFIX: 'postSegmentStitched',
	
	RENDITION_MANIFEST_HANDLED_KEY_PREFIX: 'renditionManifestHandled',
	
	SERVER_PROCESSES_KEY_PREFIX: 'serverProcesses',
	SEGMENT_MEDIA_KEY_PREFIX: 'segmentMedia',
	SERVER_AD_ID_KEY_PREFIX: 'serverAdId',
	
	TRACKING_KEY_PREFIX: 'tracking',
	
	UI_CONF_CONFIG_KEY_PREFIX: 'uiConfConfig',

	HEADERS_PREFIX: 'headers',

	//KEY SUFFIX
	METADATA_KEY_SUFFIX: 'metadata',

	LOCK_KEY_PREFIX: 'lock',

	LOCK_DEFAULT_TIMEOUT: 100,

	MAX_RETRIES_FOR_REND_DELETE: 10,

	hashString : function(str) {
		var hash = 5381,
			i    = str.length;
		while(i) {
			hash = (hash * 33) ^ str.charCodeAt(--i);
		}
		return hash >>> 0;
	},

	getBinServerByKey : function(key){
		var serverId = this.hashString(key) % this.binservers.length;
                KalturaLogger.log("id for key (" + key + ") = " + serverId);
		return this.binservers[serverId];
	},

	getBinServerSetByKey : function(key){
		var serverId = this.hashString(key) % this.binserversSet.length;
                KalturaLogger.log("id for key (" + key + ") = " + serverId);
		return this.binserversSet[serverId];
	},

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
	
	getPostSegmentStitchedId: function(cuePointId, adsSequenceId, segmentIndex){
		return (cuePointId + '-' + segmentIndex + '-' + adsSequenceId).md5();
	},
	
	getUiConfConfigId : function(uiConfConfig){
		return JSON.stringify(uiConfConfig).md5();
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

	removeRenditionIdFromEntryRequiredValue: function(entryRequired, renditionId, retries){
		var This = this;
		var lockKey = this.getKey(this.LOCK_KEY_PREFIX, [entryRequired]);
		var lockTimeout = this.LOCK_DEFAULT_TIMEOUT;
		if (KalturaConfig.config.cache.lock) {
			lockTimeout = KalturaConfig.config.cache.lock;
		}
		var recall = function() {
			setTimeout(function () {
				This.removeRenditionIdFromEntryRequiredValue(entryRequired, renditionId, retries++);
			}, lockTimeout / This.MAX_RETRIES_FOR_REND_DELETE);
		};

		this.add(lockKey, 1, lockTimeout, function() { // add fails if key exists
			KalturaLogger.debug("Removing " + renditionId + " from " + entryRequired + " values");
			This.get(entryRequired, function (data) {
				if (!data){
					KalturaLogger.log("EntryRequired value was null - deleting key");
					This.del(entryRequired);
					This.del(lockKey);
				} else {
					var newEntryRequired;
					var index = data.indexOf(renditionId);
					if ( index != -1) {
						newEntryRequired = data.substr(0, index).concat(data.substr(index + renditionId.length));
						if (newEntryRequired.trim().length > 0) {
							This.set(entryRequired, newEntryRequired, KalturaConfig.config.cache.entryRequired,
								function () {
									This.del(lockKey);
									KalturaLogger.debug("Successfully removed rendition " + renditionId + " from entryRequired " + entryRequired +
										" new value is : " + newEntryRequired);
								},
								function () {
									This.del(lockKey);
									KalturaLogger.debug("Failed to remove rendition " + renditionId + " from entryRequired " + entryRequired +
										" ,Though should have - retrying");
									recall();
								});
						} else {
							KalturaLogger.debug("After deletion of rendition " + renditionId + " entryRequired: " + entryRequired + " is empty - deleting it");
							This.del(entryRequired);
							This.del(lockKey);
						}
					} else {
						// this means that the rendition was not part of the required entry moving on
						This.del(lockKey);
					}
				}
			}, function () {
				KalturaLogger.error("Failed to get " + entryRequired + " key while trying to remove rendition :" + renditionId);
			});
		}, function(){
			KalturaLogger.debug("Failed to get lock for deleting rendition " + renditionId + " from entryRequired : " + entryRequired + " retrying");
			if (!retries)
				retries = 0;
			if (retries < This.MAX_RETRIES_FOR_REND_DELETE)
				recall();
			else {
				KalturaLogger.error("Failed to remove rendition id " + renditionId + " from entryRequired: " + entryRequired);
			}
		});

	},
	
	buildAdsSequenceId: function(serverAdIds){
		sequenceId = [];
		for(var i = 0; i<= serverAdIds.length; i++){
			if(!serverAdIds[i]){
				continue;
			}
			sequenceId.push(this.extractAdIdFromServerAdId(serverAdIds[i]));
		}
		return JSON.stringify(sequenceId).md5();
	},
	
	extractAdIdFromServerAdId: function(serverAdId){
		return serverAdId.id.split('-')[0];
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
		var This = this;
		This.server.get(key, function(err, data){
			if(err){
				var errMessage = 'Cache.get [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else {
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
		var cacheTouchCallback = function(err, isNullValue){
			if(err){
				var errMessage = 'Cache.touch [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else if(isNullValue){
	                                KalturaLogger.debug(errMessage);
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
					cacheTouchCallback('value is null', true);
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
		var timeInMs = Date.now();	
		var memcacheServer = this.getBinServerByKey(key);
		memcacheServer.connect();
		memcacheServer.get(key, function(err, data){
			if(err){
				var errMessage = 'Cache.getBinary [' + key + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
				}
			}
			else {
				var took = Date.now() - timeInMs;
				if (data)
					KalturaLogger.debug('Cache.getBinary [' + key + '], value size [' + data.length + '] took ' + took + ' miliseconds: OK', stackSource);
				else
                                        KalturaLogger.debug('Cache.getBinary [' + key + '], value is null, took ' + took + ' miliseconds', stackSource);
 
				if(callback)
					callback(data);
			}
		});
	},
	
	getMultiBinary : function(keys, callback, errorCallback) {
		var stackSource = this.getStack();
		var missingAnswers = keys.length;
		var answers = {};
                var timeInMs = Date.now();
		var This = this;
		keys.forEach(function(key, index, array){
                	var memcacheServer = This.getBinServerByKey(key);
                	memcacheServer.connect();
			memcacheServer.get(key, function(err, data){
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
                                var took = Date.now() - timeInMs;
                                if (data)
                                        KalturaLogger.debug('Cache.getMultiBinary [' + key + '], value size [' + data.length + '] took ' + took + ' miliseconds: OK', stackSource);
                                else
                                        KalturaLogger.debug('Cache.getMultiBinary [' + key + '], value is null, took ' + took + ' miliseconds', stackSource);

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
