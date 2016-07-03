var os = require('os');
const kalturaCacheManager = require('./KalturaCacheManager');

var memjs = require('memjs'); // TODO use this lib only
var path = require('path');

KalturaCache = {
	binserverSet: null,
	cacheInstance: null,

	init: function() {

		this.binserverSet = memjs.Client.create(KalturaConfig.config.memcache.hostname + ':' + KalturaConfig.config.memcache.port);
		this.cacheInstance = kalturaCacheManager.getInstance();
		//let cacheInstance = kalturaCacheManager.getInstance();

	},

	//KEY PREFIXES
	AD_MEDIA_KEY_PREFIX: 'adMedia',
	AD_HANDLED_KEY_PREFIX: 'adHandled',
	CUE_POINT_URL_KEY_PREFIX: 'cuePointUrl',
	CUE_POINT_HANDLED_KEY_PREFIX: 'cuePointHandled',
	CUE_POINT_WATCHER_HANDLED_KEY_PREFIX: 'cuePointWatcherHandled',
	CAN_PLAY_AD_KEY_PREFIX: 'canPlayAd',
	ENTRY_CUE_POINTS_KEY_PREFIX: 'entryCuePoints',
	ENTRY_ELAPSED_TIME_KEY_PREFIX: 'entryElapsedTime',
	ENTRY_REQUIRED_KEY_PREFIX: 'entryRequired',
	ENCODING_PARAMS_KEY_PREFIX: 'encodingParams',
	FILLER_HANDLED_KEY_PREFIX: 'fillerHandled',
	FILLER_MEDIA_KEY_PREFIX: 'fillerMedia',
	FILLER_ENCODING_PARAMS_KEY_PREFIX: 'fillerEncodingParams',
	FILE_DOWNLOADING_KEY_PREFIX: 'fileDownloading',
	LOCK_KEY_PREFIX: 'lock',
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

	//KEY SUFFIX
	METADATA_KEY_SUFFIX: 'metadata',

	LOCK_DEFAULT_TIMEOUT: 100,

	MAX_RETRIES_FOR_REND_DELETE: 10,


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
		key = 'v' + this.cacheInstance.getDataVersion() + '-' + key;
		return key;
	},


	get : function(key, callback, errorCallback, is_encrypted)
	{
		this.cacheInstance.get(key, callback, errorCallback, is_encrypted);
	},

	set : function(key, value, lifetime, callback, errorCallback, is_encrypted)
	{
		this.cacheInstance.set(key, value, lifetime, callback, errorCallback, is_encrypted );
	},

	touch : function(key, lifetime, callback, errorCallback)
	{
		this.cacheInstance.touch(key, lifetime, callback, errorCallback);
	},

	add : function(key, value, lifetime, callback, errorCallback, is_encrypted)
	{
		this.cacheInstance.add(key, value, lifetime, callback, errorCallback, is_encrypted );
	},

	append : function(key, value, callback, errorCallback, is_encrypted)
	{
		this.cacheInstance.append(key, value, callback, errorCallback, is_encrypted );
	},

	getMulti : function(keys, callback, errorCallback, is_encrypted)
	{
		this.cacheInstance.getMulti(keys, callback, errorCallback, is_encrypted);
	},

	del : function(key, callback, errorCallback)
	{
		this.cacheInstance.del(key, callback, errorCallback);
	},

	replace : function(key, value, lifetime, callback, errorCallback, is_encrypted)
	{
		this.cacheInstance.replace(key, value, lifetime, callback, errorCallback, is_encrypted );
	},

	getBinary : function(key, callback, errorCallback)
	{
		this.cacheInstance.getBinary(key, callback, errorCallback);
	},

	getMultiBinary : function(keys, callback, errorCallback)
	{
		this.cacheInstance.getMultiBinary(keys, callback, errorCallback);
	},
};
KalturaCache.init();
