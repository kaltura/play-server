
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
require('../adIntegration/KalturaAdIntegrationHandler');

/**
 * @service manifest
 */
var KalturaManifestManager = function(){
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

/**
 * Cookie key to store player ad config to be applied on the ad URL
 * The config accepted from the master manifest URL and used later when requesting ads
 */
KalturaManifestManager.COOKIE_PLAYER_CONFIG = 'playerConfig';

KalturaManifestManager.RENDITION_RETRY_INTERVAL = 5;

/**
 * calling startWatcher only if entry is not required
 * 
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startWatcherExclusive = function(entryId, manifestUrl, renditionsWatchParams) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + ']');
	
	var This = this;
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	KalturaCache.add(entryRequiredKey, ' ', KalturaConfig.config.cache.entryHandled, function(){
		This.startWatcher(entryId, manifestUrl, renditionsWatchParams);
	}, function (err) {
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] watcher already exists');
	});
};


/**
 * Trigger watching cue-points and rendition manifests for entry
 * 
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startWatcher = function(entryId, manifestUrl, renditionsWatchParams) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] notify stream manager');

	for(var i = 0; i < renditionsWatchParams.length; i++){
		this.callPlayServerService('stream', 'watch', renditionsWatchParams[i]);
	}

	var cuePointsParams = {
		entryId: entryId
	};			
	this.callPlayServerService('cuePoints', 'watch', cuePointsParams);
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
KalturaManifestManager.prototype.stitchMasterM3U8 = function(entryId, manifestUrl, manifestContent) {
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
				master: encodedMasterUrl				
			};
			
			var tokens = {
				sessionId: '@SESSION_ID@' 					
			};
			
			var renditionUrl = this.getPlayServerUrl('manifest', 'rendition', renditionStitchParams, tokens);
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
	
	this.startWatcherExclusive(entryId, manifestUrl, renditionsWatchParams);

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
	if (!params.url || !params.entryId) {
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}

	// TODO return caching headers - don't cache
	
	// TODO authentication / token enforcement
	if(params.playerConfig){
		// TODO take ui-conf id ad server headers and as server POST data
		this.setCookie(response, KalturaManifestManager.COOKIE_PLAYER_CONFIG, params.playerConfig);
	}
	
	var This = this;
	
	This.fetchMaster(response, params.url, params.entryId, function(data, fromCache){
		var body = data.body;
		if(fromCache){
    		response.log('Returns body from cache');
    		This.startWatcher(params.entryId, params.url, data.renditionsWatchParams);
		}
		else{
			response.log('Stitching [' + params.entryId + ']');			    
			body = This.stitchMasterM3U8(params.entryId, params.url, body);
		}
		// set unique id on user session
		var sessionId = request.ip + '_' + Math.random();
		var regex = new RegExp('%40SESSION_ID%40', 'g');
		body = body.replace(regex, sessionId);
		response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		response.end(body);
	}, function(err){
		response.error(err);
		This.errorFileNotFound(response);
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
KalturaManifestManager.prototype.stitchCuePoints = function(request, response, entryId, sessionId, callback){
	var This = this;
	var encodingIds = null;
	var mediaInfos = null;
	var cuePointsForStitching = [];
	var maxAge = 20  * 60 * 1000; // 20 minutes
	var playerConfig = this.getCookie(request, KalturaManifestManager.COOKIE_PLAYER_CONFIG);
	
	var stitchAdCounter = 0;
	var entry = null;
	var metadata = null;

	var stitchAd = function(cuePoint) {
		
		KalturaAdIntegrationHandler.getAdMediaFiles(cuePoint, entry, metadata, playerConfig, request, mediaInfos, sessionId, function(adFileId, adFileInfo){
			
			for(var i = 0; i < adFileInfo.encodingIds.length; i++){

				if(!adFileInfo.encodingIds[i].trim().length){
					continue;
				}				
				var serverAdId = KalturaCache.getServerAdId(adFileId, adFileInfo.encodingIds[i]);
				response.log('Server ad ID [' + serverAdId + ']');
			
				var adMediaKey = KalturaCache.getAdMedia(serverAdId);
				KalturaCache.touch(adMediaKey, KalturaConfig.config.cache.adMediaExtension, function(){
					// key exists
					response.log('Server ad [' + serverAdId + '] already stitched');
				}, function(err){
					// key doesn't exist
					var adHandledKey = KalturaCache.getAdHandled(serverAdId);
					KalturaCache.add(adHandledKey, true, KalturaConfig.config.cache.adHandled, function(){
						var params = {
							serverAdId: serverAdId,
							encodingId: adFileInfo.encodingIds[i],
							sharedFilePath: adFileInfo.sharedFilePath
						};
						This.callPlayServerService('ad', 'stitch', params);
					}, function (err) {
						response.log('Server ad [' + serverAdId + '] already handled');
					});
				});
			}		
		}, function(trackingId){
			This.setCookie(response, cuePoint.id, trackingId, maxAge);
			stitchAdCounter--;
			if(!stitchAdCounter){
				callback();
			}
		}, function(err){
			// TODO
		});
	};
	
	var doStitchCuePoints = function (){
		var cuePointsKey = KalturaCache.getCuePoints(entryId);
		var elapsedTimeKey = KalturaCache.getElapsedTime(entryId);
		var entryRequiredKey = KalturaCache.getEntryRequired(entryId);

		KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey], function(data){
			var cuePoints = data[cuePointsKey];
			var elapsedTime = data[elapsedTimeKey];
			var encodingIds = [];
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
	    			callback();
	    			return;
	    		}
	    		
	    		
	    		var tenMinutes = 10 * 60 * 1000;
	    		
	    		var timeWindowStart = elapsedTime.timestamp - tenMinutes;
	    		var timeWindowEnd = elapsedTime.timestamp + tenMinutes;
	    
	    		var offsetWindowStart = elapsedTime.offset - tenMinutes;
	    		var offsetWindowEnd = elapsedTime.offset + tenMinutes;
	    
	    		for(var cuePointId in cuePoints){
	    			cuePoint = cuePoints[cuePointId];
	    			if(cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt && cuePoint.triggeredAt < timeWindowEnd){
	    				cuePointsForStitching.push(cuePoint);
	    				stitchAdCounter++;
	    			}
	    			else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
	    				cuePointsForStitching.push(cuePoint);
	    				stitchAdCounter++;
	    			}
	    		}
	    		
	    		for(i=0; i < cuePointsForStitching.length; i++){
	    			stitchAd(cuePointsForStitching[i]);
	    		}
			});
		});		
	};
	
	var requiredEntityCount = 1;
	if(playerConfig){
		var metadataProfileId = playerConfig['metadataProfileId'];
		if(metadataProfileId){
			requiredEntityCount = 2;
			this.getMetadata(entryId, metadataProfileId, function(data){
				metadata = data;
				requiredEntityCount--;
				if(requiredEntityCount == 0)
					doStitchCuePoints();
			});
		}
			
	}	
	this.getEntry(entryId, function(data){
		entry = data;
		requiredEntityCount--;
		if(requiredEntityCount == 0)
			doStitchCuePoints();
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
KalturaManifestManager.prototype.getRenditionFromCache = function(request, response, entryId, renditionId, masterUrl, sessionId){
	if(response.retries){
		response.retries++;
	}
	else{
		response.retries = 1;
	}
	if(response.retries >= 3){
		response.log('Not found in cache');
		this.errorFileNotFound(response);
		return;
	}
	
	var This = this;
	var manifestContentKey = KalturaCache.getManifestContent(renditionId);

	KalturaCache.get(manifestContentKey, function(data){
		if(data){
			This.stitchCuePoints(request, response, entryId, sessionId, function(){
				response.log('Returned from cache');
				response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
				// set unique user session id on the manifest
				var regex = new RegExp('%40SESSION_ID%40', 'g');
				data = data.replace(regex, sessionId);
				response.end(data);
			});
		}		
		else{
			if(response.retries == 1){
				// restarts master stitching
				This.fetchMaster(response, masterUrl, entryId, function(data, fromCache){
					var body = data.body;
					if(fromCache){
			    		response.log('Returns body from cache, restarting watchers');
			    		This.startWatcherExclusive(entryId, masterUrl, data.renditionsWatchParams);
					}
					else{
						response.log('Stitching [' + entryId + ']');			    
						body = This.stitchMasterM3U8(entryId, masterUrl, body);
					}
				}, function(err){
					response.error(err);
				});
			}
			
			// retry get from cache
			setTimeout(function(){
				This.getRenditionFromCache(request, response, entryId, renditionId, masterUrl, sessionId);
			}, KalturaManifestManager.RENDITION_RETRY_INTERVAL * 1000);
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
KalturaManifestManager.prototype.rendition = function(request, response, params){
	response.dir(params);
	if (!params.renditionId || !params.entryId || !params.master || !params.sessionId) {
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}

	// TODO return caching headers
	
	var entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
	KalturaCache.touch(entryRequiredKey, KalturaConfig.config.cache.entryRequired);
	
	var masterUrl = new Buffer(params.master, 'base64').toString('ascii');
	this.getRenditionFromCache(request, response, params.entryId, params.renditionId, masterUrl, params.sessionId);
};

module.exports.KalturaManifestManager = KalturaManifestManager;
