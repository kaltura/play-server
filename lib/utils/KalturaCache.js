
var os = require('os');
var memcached = require('memcached');

KalturaCache = {
	config : null,
	server : null,
		
	init: function(){
		this.config = KalturaConfig.config.memcache;
		this.server = new memcached(this.config.hostname + ':' + this.config.port, this.config);
	},

	getManifestId : function(manifestUrl) {
		if(KalturaConfig.config.cache.hackWowzaUniqueSession && parseInt(KalturaConfig.config.cache.hackWowzaUniqueSession)){
    		// hack Wowza per session unique key
    		var str = manifestUrl.replace(/\/chunklist_w\d+_(b\d+).m3u8$/, 'chunklist_$1.m3u8');
		}
		
		return str.md5();
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
	
	getRenditionManifestHandled :function(manifestUrl) {
		return 'renditionManifestHandled-' + this.getManifestId(manifestUrl);
	}, 

	getManifestContent : function(manifestId) {
		return 'manifestContent-' + manifestId;
	},

	getAdHandled : function(serverAdId) {
		return 'adHandled-' + serverAdId;
	},

	getBlackHandled : function(encodingId) {
		return 'blackHandled-' + encodingId;
	},

	getAdMedia : function(serverAdId) {
		return 'adMedia-' + serverAdId;
	},

	getSegmentMedia : function(segmentId) {
		return 'segmentMedia-' + segmentId;
	},

	getBlackMedia : function(encodingId) {
		return 'blackMedia-' + encodingId;
	},

	getAdMediaMetadata : function(serverAdId) {
		return 'adMedia-' + serverAdId + '-metadata';
	},

	getSegmentMediaMetadata : function(segmentId) {
		return 'segmentMedia-' + segmentId + '-metadata';
	},

	getBlackMediaMetadata : function(encodingId) {
		return 'blackMedia-' + encodingId + '-metadata';
	},

	getLastUsedSegment : function(manifestUrl) {
		return 'lastUsedSegment-' + this.getManifestId(manifestUrl);
	},

	getEncodingParams : function(encodingId) {
		return 'encodingParams-' + encodingId;
	},

	getMediaInfo : function(encodingId) {
		return 'mediaInfo-' + encodingId;
	},

	getBlackEncodingParams : function(encodingId) {
		return 'blackEncodingParams-' + encodingId;
	},

	getServerAdId : function(adId, renditionId) {
		return adId + '-' + renditionId;
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
	
	getEntry : function(entryId) {
		return 'entry-' + entryId;
	},
	
	getCuePointUrl : function(cuePointId) {
		return 'cuePointUrl-' + cuePointId;
	},
	
	getAdTrackingId : function(cuePointId, userId) {
		return 'tracking-' + cuePointId + '-' + userId;
	},
	
	getAdFilePath: function(adFileId){
		return 'adPath-' + adFileId;
	},
	
	getAdFileHandled: function(adFileId){
		return 'adFileHandled-' + adFileId;
	},
	
	getStack : function() {
		return new Error();
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
			throw new Error('Cache.set [' + key + ']: lifetime [' + lifetime + '] is not numeric');
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
			this.server.touch(key, lifetime, cacheTouchCallback);
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
	}
};
KalturaCache.init();
