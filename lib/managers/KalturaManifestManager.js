
var url = require('url');
var util = require('util');
require('../utils/KalturaUiConfParser');

var kaltura = module.exports = require('../KalturaManager');
require('../adIntegration/KalturaAdIntegrationHandler');

/**
 * @service manifest
 */
var KalturaManifestManager = function(){
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

KalturaManifestManager.RENDITION_RETRY_INTERVAL = 5;

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
	
	var This = this;
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	KalturaCache.add(entryRequiredKey, ' ', KalturaConfig.config.cache.entryHandled, function(){
		This.startWatcher(partnerId, entryId, manifestUrl, renditionsWatchParams);
	}, function (err) {
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] watcher already exists');
	});
};

/**
 * Trigger watching cue-points and rendition manifests for entry
 * 
 * @param partnerId
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startWatcher = function(partnerId, entryId, manifestUrl, renditionsWatchParams) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] notify stream manager');

	for(var i = 0; i < renditionsWatchParams.length; i++){
		this.callPlayServerService('stream', 'watch', partnerId, renditionsWatchParams[i]);
	}

	var cuePointsParams = {
		entryId: entryId
	};
	
	var This = this;
	
	var entryAdTrackRequiredKey = KalturaCache.getEntryAdTrackRequired(entryId);
	KalturaCache.get(entryAdTrackRequiredKey, function(entryAdTrackRequired) {
		if(entryAdTrackRequired){
			This.callPlayServerService('cuePoints', 'watch', partnerId, cuePointsParams);
		}
		else{
			KalturaLogger.log('Track cue points is disabled for entry ' + entryId + ' will not watch cue points');
		}
	}, function(err) {
		KalturaLogger.log('Error whhile retrieving entry ad track required');
	});
};


/**
 * @param attributes
 * @returns Array
 */
KalturaManifestManager.prototype.splitM3U8TagAttributes = function(attributes) {
	var result = [];
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
KalturaManifestManager.prototype.stitchMasterM3U8 = function(partnerId, entryId, manifestUrl, manifestContent) {
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
				renditionId: renditionId,
				master: encodedMasterUrl,
				sessionId: '@SESSION_ID@' 					
			};
			
			var renditionUrl = this.getPlayServerUrl('manifest', 'rendition', partnerId, renditionStitchParams);
			KalturaLogger.log('Entry [' + entryId + '] rendition URL [' + renditionUrl + ']');
			result += renditionUrl + '\n';
			
			attributes = {};
			continue;
		}
		if (currentLine.startsWith('#EXT-X-STREAM-INF:')) {
			attributes = this.parseM3U8TagAttributes(currentLine);
		}
		
		result += currentLine + '\n';
	}

	for(var i = 0; i < renditionsWatchParams.length; i++){
		if(renditionsWatchParams[i].bitrate == lowestBitrate)
			renditionsWatchParams[i].lowestBitrate = true;
	}
	
	this.startWatcherExclusive(partnerId, entryId, manifestUrl, renditionsWatchParams);

	var manifestId = KalturaCache.getManifestId(manifestUrl);
	var manifestContentKey = KalturaCache.getManifestContent(manifestId);
	var cache = {
		body: result,
		renditionsWatchParams: renditionsWatchParams
	};
	KalturaCache.add(manifestContentKey, cache, KalturaConfig.config.cache.masterManifest, null, function (err) {
		// probably already added by a different request
	});
	
	return result;
};


/**
 * @param response
 * @param manifestUrl
 * @param entryId
 */
KalturaManifestManager.prototype.fetchMaster = function(response, manifestUrl, entryId, callback, errorCallback){

	var This = this;
	var downloadMaster = function(){
		response.log('Download master [' + manifestUrl + ']');
		This.getHttpUrl(manifestUrl, function (manifestContent) {
			if(callback){
				callback({body: manifestContent}, false);
			}
		}, function (err) {
			if(errorCallback){
				errorCallback(err);
			}
		});
	};

	var manifestId = KalturaCache.getManifestId(manifestUrl);
	var manifestContentKey = KalturaCache.getManifestContent(manifestId);
	KalturaCache.get(manifestContentKey, function(cache){
		if(cache){
			if(callback){
				callback(cache, true);
			}
			KalturaCache.touchEntryRequired(entryId);
		}
		else{
			response.log('Master manifest not found in cache');
			downloadMaster();
		}
	}, function (err) {
		response.log('Master manifest not found in cache: ' + err);
		downloadMaster();
	});
};

/**
 * get the current ui conf config file from Kaltura and store it in the cache
 * @param uiConfId
 * @param entryId
 * @param partnerId
 * @param callback
 */
KalturaManifestManager.prototype.getAndStoreUiConfConfig = function(uiConfId, entryId, partnerId, callback){
	var callUiConfGetService = function(uiConfId){
		This.impersonate(partnerId);
		This.client.uiConf.get(function(result){
			This.unimpersonate(KalturaConfig.config.client);
			if(result.objectType == 'KalturaAPIException'){
				KalturaLogger.error('Client [uiConf.get][' + result.code + ']: ' + result.message);
				callback(null);
			}
			else{
				var uiConfConfig = KalturaUiConfParser.parseUiConfConfig(uiConfId, JSON.parse(result.config));
				var uiConfConfigfKey = KalturaCache.getUiConfConfig(uiConfId);
				KalturaCache.set(uiConfConfigfKey, uiConfConfig, KalturaConfig.config.cache.uiConfConfig);
			
				if(uiConfConfig && uiConfConfig.trackCuePoints){
					var entryAdTrackRequiedKey = KalturaCache.getEntryAdTrackRequired(entryId);
					KalturaCache.set(entryAdTrackRequiedKey, true, KalturaConfig.config.cache.entryAdTrackRequied, function() {
						if(callback){
							callback(uiConfConfig);
						}						
					});
				}
				else{
					var entryAdTrackNotRequiedKey = KalturaCache.getEntryAdTrackNotRequired(entryId);
					KalturaCache.set(entryAdTrackNotRequiedKey, true, KalturaConfig.config.cache.entryAdTrackRequied, function() {
						if(callback){
							callback(uiConfConfig);
						}					
					});
				}
			}
		}, uiConfId);
	};
	
	var This = this;
	
	if(This.client == null){
		This.initClient(KalturaConfig.config.client, function(){
			callUiConfGetService(uiConfId);
		});
	}
	else{
		callUiConfGetService(uiConfId);
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
	var sessionId = request.ip + '_' + Math.random();
	
	if(params.uiConfId){		
		if(!params.playerConfig){
			params.playerConfig = { 'uiConfId': params.uiConfId};
		}		
		else{
			params.playerConfig.uiConfId = params.uiConfId;
		}			
	}	
	
	if(params.playerConfig){
		// TODO take ui-conf id ad server headers and as server POST data
		var playerConfigKey = KalturaCache.getPlayerConfig(sessionId);
		KalturaCache.set(playerConfigKey, params.playerConfig, KalturaConfig.config.cache.playerConfig, function() {
			KalturaLogger.log('player config saved for session ' + sessionId + JSON.stringify(params.playerConfig));
		}, function() {
			KalturaLogger.log('failed to save player config for session ' + sessionId);
		});
	}
	
	var This = this;
	
	var doFetchMaster = function() {
		This.fetchMaster(response, params.url, params.entryId, function(data, fromCache){
			var body = data.body;
			if(fromCache){
	    		response.log('Returns body from cache');
	    		This.startWatcher(params.partnerId, params.entryId, params.url, data.renditionsWatchParams); 
			}
			else{
				response.log('Stitching [' + params.entryId + ']');			    
				body = This.stitchMasterM3U8(params.partnerId, params.entryId, params.url, body); 
			}
			// set unique id on user session
			var regex = new RegExp('%40SESSION_ID%40', 'g');
			body = body.replace(regex, sessionId);
			response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
			response.end(body);
		}, function(err){
			response.error(err);
			This.errorFileNotFound(response);
		});
	};
	
	This.isPermissionAllowedForPartner(params.partnerId, 'FEATURE_PLAY_SERVER', function(isAllowed) {
		if(isAllowed){
			if(params.uiConfId){
				var uiConfConfigKey = KalturaCache.getUiConfConfig(params.uiConfId);
				KalturaCache.get(uiConfConfigKey, function(uiConfConfig) {
					if(!uiConfConfig){
						This.getAndStoreUiConfConfig(params.uiConfId, params.entryId, params.partnerId, function() {
							doFetchMaster();
						});
					}
					else{
						KalturaCache.touch(uiConfConfigKey, KalturaConfig.config.cache.uiConfConfig);
						if(uiConfConfig.trackCuePoints){
							var entryAdTrackRequiedKey = KalturaCache.getEntryAdTrackRequired(params.entryId);
							KalturaCache.set(entryAdTrackRequiedKey, true, KalturaConfig.config.cache.entryAdTrackRequied);
						}
						else{
							var entryAdTrackNotRequiedKey = KalturaCache.getEntryAdTrackNotRequired(params.entryId);
							KalturaCache.set(entryAdTrackNotRequiedKey, true, KalturaConfig.config.cache.entryAdTrackRequied);
						}
						doFetchMaster();
					}
				});
			}
			else{
				doFetchMaster();
			}
		}
		else{
			doFetchMaster();
		}
	});
};


/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 * @param request used to extract the player ip and cookies
 * @param response used to set ad cookies
 * @param entryId
 * @param callback called after all needed ads triggered
 */
KalturaManifestManager.prototype.stitchCuePoints = function(request, response, partnerId, entryId, sessionId, playerConfig, callback){
	var This = this;
	var encodingIds = [];
	var mediaInfos = null;
	var entry = null;
	var metadata = null;	
	var metadataProfileId = null;
	var uiConfConfig = null;
	
	var stitchAd = function(cuePoint) {
		var cuePointUrlKey = KalturaCache.getCuePointUrl(cuePoint.id);
		KalturaCache.get(cuePointUrlKey, function(cachedUrl){
			if(cachedUrl){
				response.log('Cue point url found in cache: [' + cachedUrl + ']');
				doStitchAd(cuePoint, cachedUrl);	
			}
			else{
				response.log('Cue point url not found in cache');
				if(!entry){
					getEntryAndMetadata(function(entryObj, metadataObj){
						entry = entryObj;
						metadata = metadataObj;
						doStitchAd(cuePoint, null);
					});
				}	   						
			}
			}, function (err) {
				response.log('Cue point url not found in cache: ' + err);
				if(!entry){
					getEntryAndMetadata(function(entryObj, metadataObj){
						entry = entryObj;
						metadata = metadataObj;
						doStitchAd(cuePoint, null);
					});
				}	   						
			});	   			
	};
	
	var doStitchAd = function(cuePoint, cachedUrl){
		KalturaAdIntegrationHandler.getAdMediaFiles(request, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, function(adFileId, adFileInfo){		
			response.log('Handling ad file [' + adFileInfo.fileURL + ']');			
			for(var i = 0; i < adFileInfo.mediaInfoIds.length; i++){
				if(adFileInfo.mediaInfoIds[i].trim().length){
					var encodingId = KalturaCache.getEncodingIdFromMediaInfo(adFileInfo.mediaInfoIds[i]);
					stitchAdForEncodingId(cuePoint.id, encodingId, adFileId, adFileInfo);					
				}
			}				
		}, function(err){
			response.error('Failed to stitch ad ' + err);
		});		
	};
	
	var stitchAdForEncodingId = function(cuePointId, encodingId, adFileId, adFileInfo){	
		var serverAdIdKey = KalturaCache.getServerAdId(cuePointId, encodingId, sessionId);
		var serverAdId = adFileId + '-' + encodingId;
		
		KalturaCache.get(serverAdIdKey, function(serverAdIds){
			if(!serverAdIds)
				serverAdIds = [];
			serverAdIds[adFileInfo.sequence] = {id: serverAdId, duration: adFileInfo.duration};
			KalturaCache.set(serverAdIdKey, serverAdIds, KalturaConfig.config.cache.adMedia);
		}, function(err){
			var serverAdIds = [];
			serverAdIds[adFileInfo.sequence] = {id: serverAdId, duration: adFileInfo.duration};
			KalturaCache.set(serverAdIdKey, serverAdId, KalturaConfig.config.cache.adMedia);
		});
		
		
		response.log('Server ad ID [' + serverAdId + ']');
	
		var adMediaKey = KalturaCache.getAdMedia(serverAdId);
		KalturaCache.touch(adMediaKey, KalturaConfig.config.cache.adMediaExtension, function(){
			// key exists
			response.log('Server ad [' + serverAdId + '] already stitched');
		}, function(err){
			// key doesn't exist
			response.log('Stitching [' + serverAdId + ']');
			var adHandledKey = KalturaCache.getAdHandled(serverAdId);
			KalturaCache.add(adHandledKey, true, KalturaConfig.config.cache.adHandled, function(){
				var params = {
					serverAdId: serverAdId,
					encodingId: encodingId,
					sharedFilePath: adFileInfo.sharedFilePath
				};
				This.callPlayServerService('ad', 'stitch', partnerId, params);
			}, function (err) {
				response.log('Server ad [' + serverAdId + '] already handled');
			});
		});
			
	};
	
	var getEntryAndMetadata = function(callback){
		var callMultiRequest = function(){
			This.impersonate(partnerId);
			This.client.startMultiRequest();				
			This.client.baseEntry.get(null, entryId);	
			if(metadataProfileId){
				var filter = new kaltura.client.objects.KalturaMetadataFilter();
				filter.metadataProfileIdEqual = metadataProfileId;
				filter.objectIdEqual = entryId;		
				filter.metadataObjectTypeEqual = kaltura.client.enums.KalturaMetadataObjectType.ENTRY;
				This.client.metadata.listAction(null, filter, null);
			}	
			This.client.doMultiRequest(function(results){
				This.unimpersonate(KalturaConfig.config.client);
				var entry = null;
				var metadata = null;
				if(results && results.length > 0){
					if(results[0].objectType == 'KalturaAPIException')
						KalturaLogger.error('Client [baseEntry.get][' + results[0].code + ']: ' + results[0].message);
					else
						entry = results[0];
					if(results.lenght > 1){
						if(results[1].objectType == 'KalturaAPIException')
							KalturaLogger.error('Client [metadata.list][' + results[1].code + ']: ' + results[1].message);
						else if(results[1].objects.length > 0)
							metadata = results[1].objects[0];						
					}
				}				
				callback(entry, metadata);
			});
			
		};
		
		if(This.client == null)
			This.initClient(KalturaConfig.config.client, function(){
				callMultiRequest();
			});	
		else{
			callMultiRequest();
		}			
	};
	
	//stitch cue points asynchronously
	callback();
	
	var cuePointsKey = KalturaCache.getCuePoints(entryId);
	var elapsedTimeKey = KalturaCache.getElapsedTime(entryId);
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	var uiConfConfigKey = KalturaCache.getUiConfConfig(playerConfig.uiConfId);

	KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey, uiConfConfigKey], function(data){
		var cuePoints = data[cuePointsKey];
		var elapsedTime = data[elapsedTimeKey];
		uiConfConfig = data[uiConfConfigKey];
		if(data[entryRequiredKey])
			encodingIds = data[entryRequiredKey].split('\n').unique();
		
		var encodingIdsKeys = [];
		for(var i = 0; i < encodingIds.length; i++){ 
			if(encodingIds[i].trim().length)
				encodingIdsKeys.push(KalturaCache.getMediaInfo(encodingIds[i]));
		}
		
		KalturaCache.getMulti(encodingIdsKeys, function(mediaInfoData){
			mediaInfos = mediaInfoData;
			
	   		if(!cuePoints || !elapsedTime || !encodingIds){
	   			return;
	   		}
	   		
	   		
	   		var tenMinutes = 10 * 60 * 1000;
	    		
	   		var timeWindowStart = elapsedTime.timestamp - tenMinutes;
	   		var timeWindowEnd = elapsedTime.timestamp + tenMinutes;
	   
	   		var offsetWindowStart = elapsedTime.offset - tenMinutes;
	   		var offsetWindowEnd = elapsedTime.offset + tenMinutes;
	   		
	   		if(playerConfig)
	   			metadataProfileId = playerConfig['metadataProfileId'];
	    
	   		for(var cuePointId in cuePoints){
	   			cuePoint = cuePoints[cuePointId];
				var cuePointHandledKey = KalturaCache.getCuePointHandled(cuePointId, sessionId);
	   			if(cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 < timeWindowEnd){
					KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
						stitchAd(cuePoint);
						}, function(err){
							response.log('cue point [' + cuePointId + '] for session [' + sessionId + '] already handled');
					});
	   			}
	   			else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
					KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
						stitchAd(cuePoint);
						}, function(err){
							response.log('cue point [' + cuePointId + '] for session [' + sessionId + '] already handled');
					});
	   			}
	   		}
		});
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
KalturaManifestManager.prototype.getRenditionFromCache = function(request, response, partnerId, entryId, renditionId, masterUrl, sessionId){
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
	
	var This = this;
	var playerConfig = null;
	var trackCuePoints = false;
	var manifestContentKey = KalturaCache.getManifestContent(renditionId);
	var playerConfigKey = KalturaCache.getPlayerConfig(sessionId);
	
	var finalizeResponse = function(manifestContent){
		response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		// set unique user session id on the manifest
		var regex = new RegExp('%40SESSION_ID%40', 'g');
		manifestContent = manifestContent.replace(regex, sessionId);
		response.end(manifestContent);
	};
	
	var touchRequiredSessionInfo = function(){
		response.log('Touching session info: [' + sessionId + ']');
		KalturaCache.touch(playerConfigKey, KalturaConfig.config.cache.playerConfig);
		var uiConfConfigKey = KalturaCache.getUiConfConfig(playerConfig.uiConfId);
		KalturaCache.touch(uiConfConfigKey, KalturaConfig.config.cache.uiConfConfig);
		if(trackCuePoints){
			var entryAdTrackRequiredKey = KalturaCache.getEntryAdTrackRequired(entryId);
			KalturaCache.touch(entryAdTrackRequiredKey, KalturaConfig.config.cache.entryAdTrackRequied);
		}
		else{
			var entryAdTrackNotRequiredKey = KalturaCache.getEntryAdTrackNotRequired(entryId);
			KalturaCache.touch(entryAdTrackNotRequiredKey, KalturaConfig.config.cache.entryAdTrackRequied);
		}
	};
	
	var handleManifestContent = function(){
		response.log('Handling manifest content: trackCuePoints [' + trackCuePoints + '], entryId: [' + entryId + '], sessionId [' + sessionId + ']');
		if(trackCuePoints){
			manifestContentKey += '_' + This.MANIFEST_ADS_EXTENSION;
		}
		else{
			manifestContentKey += '_' + This.MANIFEST_NO_ADS_EXTENSION;
		}
		
		touchRequiredSessionInfo();
		KalturaCache.get(manifestContentKey, function(manifestContent) {
			if(manifestContent){
				response.log('Rendition [' + renditionId + '] returned from cache');
				if(trackCuePoints){
					This.stitchCuePoints(request, response, partnerId, entryId, sessionId, playerConfig, function(){
						finalizeResponse(manifestContent);
					});
				}
				else{
					finalizeResponse(manifestContent);
				}
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
							body = This.stitchMasterM3U8(partnerId, entryId, masterUrl, body);
						}
					}, function(err){
						response.error(err);
					});
				}
				
				// retry get from cache
				setTimeout(function(){
					response.log('Rendition [' + renditionId + '] retry [' + response.retries + ']');
					This.getRenditionFromCache(request, response, partnerId, entryId, renditionId, masterUrl, sessionId);
				}, KalturaManifestManager.RENDITION_RETRY_INTERVAL * 1000);
			}
		});
	};
	
	var setTrackCuePointsByUiConfig = function(uiConfConfig){
		if(uiConfConfig.trackCuePoints){
			KalturaLogger.log('trackCuePoints is turned on for uiConf with id ' + playerConfig.uiConfId);
			trackCuePoints = true;
		}
	};
	
	KalturaCache.get(playerConfigKey, function(resPlayerConfig) {
		playerConfig = resPlayerConfig;
		if(!playerConfig){
			KalturaLogger.log('Failed to load player config for key ' + playerConfigKey + ' continuing with default behavior');
			handleManifestContent();			
		}
		else{
			var uiConfConfigKey = KalturaCache.getUiConfConfig(playerConfig.uiConfId);
			KalturaCache.get(uiConfConfigKey, function(uiConfConfig) {
				if(!uiConfConfig){
					This.getAndStoreUiConfConfig(playerConfig.uiConfId, entryId, partnerId, function(uiConfConfig) {
						if(uiConfConfig){
							setTrackCuePointsByUiConfig(uiConfConfig);
						}
						handleManifestContent();
					});
				}
				else{
					setTrackCuePointsByUiConfig(uiConfConfig);
					handleManifestContent();
				}
			}, function(err) {
				KalturaLogger.log('Failed to load uiConfConfig for key ' + uiConfConfigKey + ' continuing with default behavior');
				handleManifestContent();
			});			
		}		
	}, function(err) {
		KalturaLogger.log('Failed to load player config for key ' + playerConfigKey + ' continuing with default behavior');
		handleManifestContent();
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
KalturaManifestManager.prototype.rendition = function(request, response, params){
	response.dir(params);
	var missingParams = this.getMissingParams(params, ['renditionId', 'entryId', 'master', 'sessionId']);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return;
	}

	// TODO return caching headers
	
	KalturaCache.touchEntryRequired(params.entryId);
	
	var masterUrl = new Buffer(params.master, 'base64').toString('ascii');
	this.getRenditionFromCache(request, response, params.partnerId, params.entryId, params.renditionId, masterUrl, params.sessionId);
};

module.exports.KalturaManifestManager = KalturaManifestManager;
