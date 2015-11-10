
var url = require('url');
var util = require('util');
var in_memory_cache = require('memory-cache');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service manifest
 */
var KalturaManifestManager = function(){
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

KalturaManifestManager.RENDITION_RETRY_INTERVAL = 5;
KalturaManifestManager.RENDITION_IN_MEMORY_CACHE_LIFETIME = 2; 

/**
 * calling startWatcher only if entry is not required
 * 
 * @param partnerId
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startWatcherExclusive = function(partnerId, entryId, manifestUrl, renditionsWatchParams) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + ']');
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	KalturaCache.add(entryRequiredKey, '\n', KalturaConfig.config.cache.entryHandled, function(){
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] setting entry required');
	}, function (err) {
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] entry required is set');
	});
	this.startStreamWatchers(partnerId, entryId, manifestUrl, renditionsWatchParams);
	this.startCuePointWatcher(partnerId, entryId);
};

/**
 * Trigger watching cue-points and rendition manifests for entry
 * 
 * @param partnerId
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startCuePointWatcher = function(partnerId, entryId) {
	var This = this;
	var watcherHandledKey = KalturaCache.getCuePointWatcherHandled(entryId);
	KalturaCache.add(watcherHandledKey, true, KalturaConfig.config.cache.cuePointWatcherHandled, function(){
		var cuePointsParams = {
				entryId: entryId
			};

		KalturaLogger.log('Entry [' + entryId + '] notify cue point manager');
		This.callPlayServerService('cuePoints', 'watch', partnerId, cuePointsParams);

	}, function (err){
		KalturaLogger.log('Entry [' + entryId + '] cue point watcher watcher already exists');
	});
};

/**
 * Trigger watching rendition manifests for entry if the corresponding watchers are not running
 * 
 * @param partnerId
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startStreamWatchers = function(partnerId, entryId, manifestUrl, renditionsWatchParams) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] validate stream watchers are up');
	for(var i = 0; i < renditionsWatchParams.length; i++){
		this.startStreamWatcher(partnerId, entryId, manifestUrl, renditionsWatchParams[i]);
	}	
};

/**
 * Trigger watching rendition manifest for specific rendition if the corresponding watcher is not running
 * 
 * @param partnerId
 * @param entryId
 * @param manifestUrl
 * @param renditionWatchParams
 */
KalturaManifestManager.prototype.startStreamWatcher = function(partnerId, entryId, manifestUrl, renditionWatchParams) {
	var This = this;
	var renditionManifestHandledKey = KalturaCache.getRenditionManifestHandled(renditionWatchParams.url);
	KalturaCache.add(renditionManifestHandledKey, false, KalturaConfig.config.cache.renditionManifest, function(){
		KalturaLogger.log('Entry [' + entryId + '] manifestHandledKey [' + renditionManifestHandledKey + '] stream watcher is not running, starting');
		This.callPlayServerService('stream', 'watch', partnerId, renditionWatchParams);				
	}, function(err){
		KalturaLogger.log('Entry [' + entryId + '] manifestHandledKey [' + renditionManifestHandledKey + '] stream watcher is already running');
	});
	
};

/**
 * @param attributes
 * @returns Array
 */
KalturaManifestManager.prototype.splitM3U8TagAttributes = function(attributes) {
	var result = [];
	var commaPos;
	var quotePos;
	while (attributes.length) {
		commaPos = attributes.indexOf(',');
		quotePos = attributes.indexOf('"');
		if (quotePos >= 0 && quotePos < commaPos) {
			quoteEndPos = attributes.indexOf('"', quotePos + 1);
			commaPos = attributes.indexOf(',', quoteEndPos);
		}
		if (commaPos < 0) {
			result.push(attributes);
			break;
		}
		result.push(attributes.slice(0, commaPos));
		attributes = attributes.slice(commaPos + 1);
	}
	return result;
};

/**
 * @param currentLine
 * @returns object
 */
KalturaManifestManager.prototype.parseM3U8TagAttributes = function(currentLine) {
	var attributes = currentLine.split(':', 2)[1];
	attributes = this.splitM3U8TagAttributes(attributes);
	var result = {};
	for (var i = 0; i < attributes.length; i++) {
		var splittedAtt = attributes[i].split('=', 2);
		if (splittedAtt.length > 1) {
			var value = splittedAtt[1].trim();
			if (value.startsWith('"') && value.endsWith('"'))
				value = value.slice(1, -1);
			result[splittedAtt[0]] = value;
		} else {
			result[splittedAtt[0]] = '';
		}
	}
	return result;
};

/**
 * @param entryId
 * @param manifestUrl
 * @param manifestContent
 * @returns string
 */
KalturaManifestManager.prototype.stitchMasterM3U8 = function(partnerId, entryId, uiConfId, manifestUrl, trackCuePoints, manifestContent) {
	KalturaLogger.log('Entry [' + entryId + '] manifest [' + manifestUrl + ']: ' + manifestContent);
	var attributes = {};
	var split = manifestContent.split('\n');
	var result = '';
	var renditionsWatchParams = [];
	var lowestBitrate = null;

	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var renditionManifestUrl = url.resolve(manifestUrl, currentLine);
			
			if(trackCuePoints){
				var renditionWatchParams = {
						entryId: entryId,
						url: renditionManifestUrl,
						masterUrl: manifestUrl
					};
					
					if (attributes['BANDWIDTH'])
						renditionWatchParams.bitrate = parseInt(attributes['BANDWIDTH']);
					if (attributes['RESOLUTION']) {
						var resolution = attributes['RESOLUTION'].split('x');
						renditionWatchParams.width = resolution[0];
						renditionWatchParams.height = resolution[1];
					}
					
					if(lowestBitrate == null || lowestBitrate > renditionWatchParams.bitrate)
						lowestBitrate = renditionWatchParams.bitrate;
					
					renditionsWatchParams.push(renditionWatchParams);
					
					var renditionId = KalturaCache.getManifestId(renditionManifestUrl);
					var encodedMasterUrl = new Buffer(manifestUrl).toString('base64');
					var renditionStitchParams = {
						entryId: entryId,
						uiConfId: uiConfId,
						playerConfig: '@PLAYER_CONFIG@',
						renditionId: renditionId,
						master: encodedMasterUrl,
						sessionId: '@SESSION_ID@',
						sessionStartTime: '@SESSION_START_TIME@'
					};
					
					var renditionUrl = this.getPlayServerUrl('manifest', 'rendition/a.m3u8', partnerId, renditionStitchParams);
					KalturaLogger.log('Entry [' + entryId + '] rendition URL [' + renditionUrl + ']');
					result += renditionUrl + '\n';
					
					attributes = {};
					continue;
			}
			else{
				result += renditionManifestUrl + '\n';
				continue;
			}
		}
		
		if (currentLine.startsWith('#EXT-X-STREAM-INF:')) {
			attributes = this.parseM3U8TagAttributes(currentLine);
		}
		
		result += currentLine + '\n';
	}

	if(trackCuePoints){
		for(var i = 0; i < renditionsWatchParams.length; i++){
			if(renditionsWatchParams[i].bitrate == lowestBitrate)
				renditionsWatchParams[i].lowestBitrate = true;
			else{
				renditionsWatchParams[i].lowestBitrate = false;
			}
		}
		
		this.startWatcherExclusive(partnerId, entryId, manifestUrl, renditionsWatchParams);

		var manifestId = KalturaCache.getManifestId(manifestUrl);
		var manifestContentKey = KalturaCache.getManifestContent(manifestId);
		var cache = {
			body: result,
			renditionsWatchParams: renditionsWatchParams
		};
		KalturaCache.set(manifestContentKey, cache, KalturaConfig.config.cache.masterManifest, null, function (err) {
			KalturaLogger.error('Failed to set manifest content for key: ' + manifestContentKey + ' err: ' + err);
		});
	}
	
	return result;
};


/**
 * @param response
 * @param manifestUrl
 * @param entryId
 */
KalturaManifestManager.prototype.fetchMaster = function(response, manifestUrl, entryId, trackCuePoints, callback, errorCallback){
	var This = this;
	var downloadMaster = function(){
		response.log('Download master [' + manifestUrl + ']');
		KalturaUtils.getHttpUrl(manifestUrl, null, function (manifestContent) {
			if(callback){
				callback({body: manifestContent}, false);
			}
		}, function (err) {
			if(errorCallback){
				errorCallback(err);
			}
		});
	};
	
	if(!trackCuePoints){
		downloadMaster();
	}
	else{
		var manifestId = KalturaCache.getManifestId(manifestUrl);
		var manifestContentKey = KalturaCache.getManifestContent(manifestId);
		KalturaCache.get(manifestContentKey, function(cache){
			if(cache){
				if(callback){
					callback(cache, true);
				}
				var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
				KalturaCache.touch(entryRequiredKey, KalturaConfig.config.cache.entryRequired);
			}
			else{
				response.log('Master manifest not found in cache');
				downloadMaster();
			}
		}, function (err) {
			response.log('Master manifest not found in cache: ' + err);
			downloadMaster();
		});
	}
};

/**
 * Returns the master manifest, from cache or from the cdn
 * 
 * @action manifest.master
 * 
 * @param url
 * @param entryId
 */
KalturaManifestManager.prototype.master = function(request, response, params){
	response.dir(params);
	var missingParams = this.getMissingParams(params, ['url', 'entryId']);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return;
	}
	
	// TODO authentication / token enforcement
	//allow to pass session id either as a parameters on the url or a flashvar on player config
	var sessionId; 
	var playerConfig = null;
	if(!params.playerConfig){
		params.playerConfig = null;
		KalturaLogger.debug("No player config was provided.");
	}
	else{
		playerConfig = JSON.parse(decodeURI(params.playerConfig));
	}
	
	if(playerConfig && playerConfig['sessionId']){
		sessionId = playerConfig['sessionId'];
	}
	else if ( params.sessionId ) {
		sessionId = params.sessionId;
	} else {
		sessionId = request.ip + '_' + Math.random();
	}
	
	var sessionStartTime = Math.floor(Date.now() / 1000);
	response.log('Handling master request for partner [' + params.partnerId + '] entry [' + params.entryId + '] session [' + sessionId + ']');
	
	var This = this;
	var doFetchMaster = function(trackCuePoints) {
		This.fetchMaster(response, params.url, params.entryId, trackCuePoints, function(data, fromCache){
			if(!response.headersSent){
				var body = data.body;
				if(trackCuePoints){
					if(fromCache){
			    		response.debug('Returns body from cache');
			    		This.startWatcherExclusive(params.partnerId, params.entryId, params.url, data.renditionsWatchParams);
					}
					else{
						response.log('Stitching [' + params.entryId + ']');			    
						body = This.stitchMasterM3U8(params.partnerId, params.entryId, params.uiConfId, params.url, trackCuePoints, body); 
					}
					
					// set unique id on user session
					var regex = new RegExp('%40SESSION_ID%40', 'g');
					body = body.replace(regex, sessionId);
					
					//set player config for user
					var regex = new RegExp('%40PLAYER_CONFIG%40', 'g');
					body = body.replace(regex, params.playerConfig);
					
					//set session start time
					var regex = new RegExp('%40SESSION_START_TIME%40', 'g');
					body = body.replace(regex, sessionStartTime);
					
					This.okResponse(response, body, 'application/vnd.apple.mpegurl');
				}
				else{
					response.log('Stitching original manifest for entry [' + params.entryId + ']');			    
 					body = This.stitchMasterM3U8(params.partnerId, params.entryId, params.uiConfId, params.url, trackCuePoints, body); 
 					This.okResponse(response, body, 'application/vnd.apple.mpegurl');
				}
			}
			else{
				response.log('Watchers not started, Headers where alreay sent to the client, original request probably got timed out!!!');
			}
		}, function(err){
			response.error(err);
			This.errorFileNotFound(response);
		});
	};
	
	This.isPermissionAllowedForPartner(params.partnerId, 'FEATURE_PLAY_SERVER', function(isAllowed) {
		if(isAllowed && params.uiConfId){
				var uiConfConfigKey = KalturaCache.getUiConfConfig(params.uiConfId);
				
				KalturaCache.get(uiConfConfigKey, function(uiConfConfig) {
					if(!uiConfConfig){
						This.getAndStoreUiConfConfig(params.uiConfId, params.entryId, params.partnerId, function(uiConfConfig) {
							if(uiConfConfig && uiConfConfig.trackCuePoints){								
								doFetchMaster(uiConfConfig.trackCuePoints);
							}
							else{								
								doFetchMaster(false);
							}
						});
					}
					else{
						KalturaCache.touch(uiConfConfigKey, KalturaConfig.config.cache.uiConfConfig);
						doFetchMaster(uiConfConfig.trackCuePoints);
					}
				});
		}
		else{
			doFetchMaster(false);
		}
	});
};

/**
 * Returns the rendition manifest from cache
 * 
 * @action rendition
 * 
 * @param renditionId
 * @param entryId
 */
KalturaManifestManager.prototype.getRenditionFromCache = function(request, response, partnerId, entryId, uiConfId, renditionId, masterUrl, sessionId, playerConfig, sessionStartTime){
	var This = this;
	var manifestContentKey = KalturaCache.getManifestContent(renditionId);
	
	var handleManifestContent = function(manifestContent){
			
		// set unique user session id on the manifest
		var regex = new RegExp('%40SESSION_ID%40', 'g');
		manifestContent = manifestContent.replace(regex, sessionId);
		
		// set player config for user
		var regex = new RegExp('%40PLAYER_CONFIG%40', 'g');
		manifestContent = manifestContent.replace(regex, playerConfig);
		
		// set session start time
		var regex = new RegExp('%40SESSION_START_TIME%40', 'g');
		manifestContent = manifestContent.replace(regex, sessionStartTime);
		
		This.okResponse(response, manifestContent, 'application/vnd.apple.mpegurl');
		
		var stitchParams = {
				entryId: entryId,
				uiConfId: uiConfId,
				playerConfig: playerConfig,
				sessionId: sessionId
		};
			
		var headers = {
				'User-Agent': request.headers['user-agent'],
				'x-forwarded-for': request.ip,
				'referer': request.headers['referer'],					
		};

		This.callPlayServerService('adIntegration', 'stitch', partnerId, stitchParams, headers);
	};

	if(response.retries){
		response.retries++;
	}
	else{
		response.retries = 1;
	}
	if(response.retries >= 6){
		response.log('Not found in cache');
		this.errorFileNotFound(response);
		return;
	}
					
	response.debug('Handling manifest content: entryId: [' + entryId + '], sessionId [' + sessionId + ']');
	
	var manifestContent = in_memory_cache.get(manifestContentKey);
	
	if(manifestContent){
		response.debug('Rendition [' + renditionId + '] returned from in memory cache');
		handleManifestContent(manifestContent);
	}
	else{
		KalturaCache.get(manifestContentKey, function(manifestContent) {
			if(manifestContent){
				response.debug('Rendition [' + renditionId + '] returned from cache');
				//first time its returned from memcached save also to in memory cache
				in_memory_cache.put(manifestContentKey, manifestContent, KalturaManifestManager.RENDITION_IN_MEMORY_CACHE_LIFETIME * 1000);
				handleManifestContent(manifestContent);
			}
			else{
				response.log('Rendition [' + renditionId + '] not found in cache');
				if(response.retries == 1){
					response.log('Restarting master manifest');
					// restarts master stitching
					This.fetchMaster(response, masterUrl, entryId, function(data, fromCache){
						var body = data.body;
						if(fromCache){
				    		response.log('Master returned body from cache, restarting watchers');
				    		This.startWatcherExclusive(partnerId, entryId, masterUrl, data.renditionsWatchParams);
						}
						else{
							response.log('Master not found in cache, stitching [' + entryId + ']');			    
							body = This.stitchMasterM3U8(partnerId, entryId, uiConfId, masterUrl, true, body);
						}
					}, function(err){
						response.error(err);
					});
				}
				
				// retry get from cache
				setTimeout(function(){
					response.log('Rendition [' + renditionId + '] retry [' + response.retries + ']');
					This.getRenditionFromCache(request, response, partnerId, entryId, uiConfId, renditionId, masterUrl, sessionId, playerConfig, sessionStartTime);
				}, KalturaManifestManager.RENDITION_RETRY_INTERVAL * 1000);
			}
		});			
	}
};


/**
 * Returns the rendition manifest from cache
 * 
 * @action rendition
 * 
 * @param renditionId
 * @param entryId
 */
KalturaManifestManager.prototype.rendition = function(request, response, params){
	response.dir(params);
	var missingParams = this.getMissingParams(params, ['renditionId', 'entryId', 'uiConfId', 'master', 'sessionId']);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return;
	}

	// TODO return caching headers
	var masterUrl = new Buffer(params.master, 'base64').toString('ascii');
	this.getRenditionFromCache(request, response, params.partnerId, params.entryId, params.uiConfId, params.renditionId, masterUrl, params.sessionId, params.playerConfig, params.sessionStartTime);
	var entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
	KalturaCache.touch(entryRequiredKey, KalturaConfig.config.cache.entryRequired);
};

module.exports.KalturaManifestManager = KalturaManifestManager;
