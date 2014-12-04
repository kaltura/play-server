var http = require('follow-redirects').http;
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
require('../adIntegration/KalturaAdIntegrationHandler');

/**
 * @service adIntegration
 */
var KalturaAdIntegrationManager = function(){
	this.initClient(KalturaConfig.config.client);
};
util.inherits(KalturaAdIntegrationManager, kaltura.KalturaManager);

/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 * @action adIntegration.stitch
 * 
 * @param entryId 
 * @param uiConfId 
 * @param sessionId
 */
KalturaAdIntegrationManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['entryId', 'uiConfId', 'sessionId']);
	if(!params){
		this.errorMissingParameter(response);
		return;
	}
	
	response.dir(params);

	var This = this;
	var encodingIds = [];
	var uiConfConfig = null;
	var cuePointsKey = KalturaCache.getCuePoints(params.entryId);
	var elapsedTimeKey = KalturaCache.getElapsedTime(params.entryId);
	var entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
	var uiConfConfigKey = KalturaCache.getUiConfConfig(params.uiConfId);
	
	KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey, uiConfConfigKey], function(data){
		response.debug('handled');
		response.writeHead(200);
		response.end('OK');
		
		if(data[entryRequiredKey])
			encodingIds = data[entryRequiredKey].split('\n').unique();
		
		if(!data[uiConfConfigKey]){
			This.getAndStoreUiConfConfig(params.uiConfId, params.entryId, params.partnerId, function(uiConfConfigRes) {
				uiConfConfig = uiConfConfigRes;
				This.stitchCuePoints(request, response, params, data[cuePointsKey], data[elapsedTimeKey], encodingIds, uiConfConfig);
			});			
		}
		else{
			uiConfConfig = data[uiConfConfigKey];
			This.stitchCuePoints(request, response, params, data[cuePointsKey], data[elapsedTimeKey], encodingIds, uiConfConfig);
		}		
	}, function(err){
		response.error(msg);
		This.errorResponse(response, 500, msg);
	});		

};


/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 * @param entryId 
 * @param uiConfId 
 * @param sessionId
 */
KalturaAdIntegrationManager.prototype.stitchCuePoints = function(request, response, params, cuePoints, elapsedTime, encodingIds, uiConfConfig){
	
	var This = this;
	var mediaInfos = null;
	var entry = null;
	var metadata = null;	
	var metadataProfileId = null;
	

	var stitchAd = function(cuePoint) {
		var cuePointUrlKey = KalturaCache.getCuePointUrl(cuePoint.id);
		KalturaCache.get(cuePointUrlKey, function(cachedUrl){
			if(cachedUrl){
				response.debug('Cue point url found in cache: [' + cachedUrl + ']');
				doStitchAd(cuePoint, cachedUrl);	
			}
			else{
				response.debug('Cue point url not found in cache');
				if(!entry){
					getEntryAndMetadata(function(entryObj, metadataObj){
						entry = entryObj;
						metadata = metadataObj;
						doStitchAd(cuePoint, null);
					});
				}	   						
			}
			}, function (err) {
				response.debug('Cue point url not found in cache: ' + err);
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
		KalturaAdIntegrationHandler.getAdMediaFiles(request, cuePoint, cachedUrl, entry, metadata, params.playerConfig, mediaInfos, params.sessionId, uiConfConfig, function(adFileId, adFileInfo){		
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
		var serverAdIdKey = KalturaCache.getServerAdId(cuePointId, encodingId, params.sessionId);
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
		
		
		response.debug('Server ad ID [' + serverAdId + ']');
	
		var adMediaKey = KalturaCache.getAdMedia(serverAdId);
		KalturaCache.touch(adMediaKey, KalturaConfig.config.cache.adMediaExtension, function(){
			// key exists
			response.debug('Server ad [' + serverAdId + '] already stitched');
		}, function(err){
			// key doesn't exist
			response.log('Stitching [' + serverAdId + ']');
			var adHandledKey = KalturaCache.getAdHandled(serverAdId);
			KalturaCache.add(adHandledKey, true, KalturaConfig.config.cache.adHandled, function(){
				var stitchParams = {
					serverAdId: serverAdId,
					encodingId: encodingId,
					sharedFilePath: adFileInfo.sharedFilePath
				};
				This.callPlayServerService('ad', 'stitch', params.partnerId, stitchParams);
			}, function (err) {
				response.debug('Server ad [' + serverAdId + '] already handled');
			});
		});
			
	};
	
	var getEntryAndMetadata = function(callback){
		var callMultiRequest = function(){
			This.impersonate(params.partnerId);
			This.client.startMultiRequest();				
			This.client.baseEntry.get(null, params.entryId);	
			if(metadataProfileId){
				var filter = new kaltura.client.objects.KalturaMetadataFilter();
				filter.metadataProfileIdEqual = metadataProfileId;
				filter.objectIdEqual = params.entryId;		
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
	   		
	   	if(params.playerConfig){
	   		metadataProfileId = params.playerConfig['metadataProfileId'];
	   	}
	   	
	   	for(var cuePointId in cuePoints){
	   		cuePoint = cuePoints[cuePointId];
			var cuePointHandledKey = KalturaCache.getCuePointHandled(cuePointId, params.sessionId);
	   		if(cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 < timeWindowEnd){
				KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
					stitchAd(cuePoint);
					}, function(err){
						response.debug('cue point [' + cuePointId + '] for session [' + params.sessionId + '] already handled');
				});
	   		}
	   		else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
				KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
					stitchAd(cuePoint);
					}, function(err){
						response.debug('cue point [' + cuePointId + '] for session [' + params.sessionId + '] already handled');
				});
	   		}
	   	}
	});		
};

/**
 * Send beacons to track ad progress
 * 
 * @action adIntegration.sendBeacon
 * 
 * @param trackingId 
 * @param adSequence 
 * @param totalDuration
 * @param outputStart
 * @param outputEnd
 * @param adStart
 */
KalturaAdIntegrationManager.prototype.sendBeacon = function(request, response, params){
	
	params = this.parsePlayServerParams(response, params, ['trackingId', 'adSequence', 'totalDuration', 'outputStart', 'outputEnd', 'adStart']);
	if(!params){
		this.errorMissingParameter(response);
		return;
	}
	
	response.dir(params);
	var totalDuration = parseInt(params.totalDuration);
	var adSequence = JSON.parse(params.adSequence);
	var outputStart = parseInt(params.outputStart);
	var outputEnd = parseInt(params.outputEnd);
	var adStart = parseInt(params.adStart);
	
	response.debug('start sendBeacon for trackingId: [' + params.trackingId + '] outputStart: [' + outputStart + '] outputEnd: [' + outputEnd + ']');
	response.writeHead(200);
	response.end('OK');
	
	var sendBeaconForType = function(events){
		var httpGet = function(url){
			http.get(url, function(res){
				response.log('beacon for tracking id [' + params.trackingId + '] url [' + url + '] sent with status: [' + res.statusCode + ']');
				res.on('data', function() { /* do nothing */ });
			}).on('error', function(e){
				response.error('Failed to send beacon for tracking id [' + params.trackingId + '] url [' + url + '], ' + e.message);
			});							
		};

		for(var i=0; i < events.length; i++){
			httpGet(events[i].trim());
		}				
	};
	
	var checkBeaconProgress = function(progressStartPercent, progressEndPercent, beaconPercent, eventType, trackingInfo){
		if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent >= beaconPercent){
			response.debug('sending beacons of type: [' + eventType + ']');
			sendBeaconForType(trackingInfo[eventType]);
			delete trackingInfo[eventType];
		}		
		
		else if(trackingInfo.hasOwnProperty(eventType) && beaconPercent == 100 && progressEndPercent >= beaconPercent){
			response.debug('sending beacons of type: [' + eventType + '] ');
			sendBeaconForType(trackingInfo[eventType]);
			delete trackingInfo[eventType];
		}		
	};
	
	KalturaCache.get(params.trackingId, function(trackingInfos){
		totalDuration-= adStart;
		outputStart-= adStart;
		if(outputEnd > 0){
			outputEnd-= adStart;
		}
						
		for(var i=0; i < adSequence.length; i++){
			if(trackingInfos && trackingInfos[adSequence[i]]){
				response.debug('Tracking info found in cache for tracking id: [' + params.trackingId + '] and sequence: [' + adSequence[i] + ']');
				var trackingInfo = trackingInfos[adSequence[i]];
				totalDuration += trackingInfo.duration;					
				var progressStartPercent = outputStart / totalDuration * 100;
				var progressEndPercent = outputEnd / totalDuration * 100;
				if(outputEnd == 0){
					progressEndPercent = 100;
				}
				
				response.log('Ad sequence: [' + adSequence[i] + '] progressStartPercent: [' + progressStartPercent + '] progressEndPercent: [' + progressEndPercent + ']');
				
				checkBeaconProgress(progressStartPercent, progressEndPercent, 0, 'impression', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 0, 'start', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 25, 'firstQuartile', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 50, 'midpoint', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 75, 'thirdQuartile', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 100, 'complete', trackingInfo);					

				KalturaCache.set(params.trackingId, trackingInfos, KalturaConfig.config.cache.cuePoint);
			}
			else{
				response.log('Tracking info not found in cache for tracking id: [' + params.trackingId + '] and sequence: [' + adSequence[i] + ']');
			}				
		}

	}, function (err) {
		response.log('Tracking info not found in cache for tracking id: [' + params.trackingId + ']: ' + err);
		
	});
};

module.exports.KalturaAdIntegrationManager = KalturaAdIntegrationManager;
