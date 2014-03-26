
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

	getBlackEncodingParams : function(encodingId) {
		return 'blackEncodingParams-' + encodingId;
	},

	getAdId : function(sourceUrl) {
		return sourceUrl.md5();
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
		lifetime = parseInt(lifetime);
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

	touch : function(key, lifetime, callback, errorCallback) {
		lifetime = parseInt(lifetime);
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
			var This = this;
			this.server.get(key, function(err, value){
				if(err){
					cacheTouchCallback(err);
				}
				else{
					This.server.set(key, value, lifetime, cacheTouchCallback);
				}
			});
		}
	},

	add : function(key, value, lifetime, callback, errorCallback) {
		lifetime = parseInt(lifetime);
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
				var errMessage = 'Cache.getMulti [' + keys.join(', ') + ']:' + err;
				if(errorCallback){
					errorCallback(errMessage);
				}
				else{
					throw new Error(errMessage);
				}
			}
			else{
				KalturaLogger.log('Cache.getMulti [' + keys.join(', ') + ']: OK', stackSource);
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
		lifetime = parseInt(lifetime);
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
KalturaCache.init();
