
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
require('../adIntegration/KalturaAdIntegrationHandler');

/**
 * @service cuePoints
 */
var KalturaCuePointsManager = function(){
	this.cuePoints = {};
	this.interval = null;
	this.lastUpdatedAt = null;
	
	this.initClient(KalturaConfig.config.client);
};
util.inherits(KalturaCuePointsManager, kaltura.KalturaManager);

/**
 * @type handle to setInterval
 */
KalturaCuePointsManager.prototype.interval = null;

/**
 * @type object
 * 
 * key: entry id
 * value: object
 *  - finishCallback: function called when entry is not required anymore and restorable action could be unstored
 *  - cuePoints: object (key: cue-point id, value: KalturaCuePoint)
 */
KalturaCuePointsManager.prototype.cuePoints = null;

/**
 * @type int timestamd in seconds, used to fetch cue-points that changed in last few seconds
 */
KalturaCuePointsManager.prototype.lastUpdatedAt = null;


/**
 * @param entryId
 */
KalturaCuePointsManager.prototype.verifyEntryRequired = function(entryId){
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	var oldestSegmentTimeKey = KalturaCache.getOldestSegmentTime(entryId);
	var cuePointsKey = KalturaCache.getCuePoints(entryId);
	
	var This = this;
	var deleteCuePoint = function(){
		This.cuePoints[entryId].finishCallback();
		delete This.cuePoints[entryId];		
		KalturaCache.del(cuePointsKey);		
	};
	
	KalturaCache.get(entryRequiredKey, function(data){
		if(!data){
			KalturaLogger.log('Deleting cue points for entry ' + entryId);
			deleteCuePoint();
		}
		else{
			if(This.cuePoints[entryId] && This.cuePoints[entryId].cuePoints){
				KalturaCache.get(oldestSegmentTimeKey, function(oldestSegmentTime){
					if(oldestSegmentTime){
						var changed = false;
						for(var cuePointId in This.cuePoints[entryId].cuePoints){
							var cuePoint = This.cuePoints[entryId].cuePoints[cuePointId];
							if((cuePoint.startTime && oldestSegmentTime.offset > (cuePoint.startTime + cuePoint.duration)) || 
								(cuePoint.triggeredAt*1000 && oldestSegmentTime.timestamp > (cuePoint.triggeredAt*1000 + cuePoint.duration))){
								KalturaLogger.log('Deleting handled cue point from cache: ' + cuePointId);
								delete This.cuePoints[entryId].cuePoints[cuePointId];
								changed = true;
							}
						}
						if(changed)
							KalturaCache.set(cuePointsKey, This.cuePoints[entryId].cuePoints, KalturaConfig.config.cache.cuePoint);		
					}
				}, function(err){});		
			}
		}
	}, deleteCuePoint);
};

/**
 * @param cuePointsList KalturaCuePointListResponse
 * @param filter KalturaCuePointFilter
 * @param pager KalturaFilterPager
 */
KalturaCuePointsManager.prototype.handleCuePointsList = function(cuePointsList, filter, pager){
	if(!this.run){
		return;
	}
	
	if(cuePointsList.objectType == 'KalturaAPIException'){
		KalturaLogger.error('Client [cuePoint.list][' + cuePointsList.code + ']: ' + cuePointsList.message);
	}
	else{
		var This = this;
		
		if(cuePointsList.objects.length == pager.pageSize){
			pager.pageIndex++;
			this.client.cuePoint.listAction(function(nextCuePointsList){
				This.handleCuePointsList(nextCuePointsList, filter, pager);
			}, filter, pager);
		}
		
		for(var i = 0; i < cuePointsList.objects.length; i++){
			var cuePoint = cuePointsList.objects[i];
			var entryId = cuePoint.entryId;
			if(!this.cuePoints[entryId]){
				continue;
			}
			this.lastUpdatedAt = Math.max(this.lastUpdatedAt, cuePoint.updatedAt);
			
			this.cuePoints[entryId].cuePoints[cuePoint.id] = cuePoint;

			var cuePointsKey = KalturaCache.getCuePoints(entryId);
			KalturaCache.set(cuePointsKey, this.cuePoints[entryId].cuePoints, KalturaConfig.config.cache.cuePoint);
		}
	}
};


/**
 * List cue-points for all entries, executed periodically
 */
KalturaCuePointsManager.prototype.loop = function(){
	if(!this.sessionReady)
		return;
	
	var entryIds = [];
	for(var entryId in this.cuePoints){
		entryIds.push(entryId);
		this.verifyEntryRequired(entryId);
	}
	
	if(!entryIds.length){
		clearInterval(this.interval);
		KalturaLogger.log('No entries left to monitor, clearing cue points interval for pId ' + process.pid);
		this.interval = null;
		return;
	}
	
	var filter = new kaltura.client.objects.KalturaAdCuePointFilter();
	filter.entryIdIn = entryIds.join(',');
	filter.statusEqual = kaltura.client.enums.KalturaCuePointStatus.READY;
	filter.cuePointTypeEqual = kaltura.client.enums.KalturaCuePointType.AD;
	if(this.lastUpdatedAt)
		filter.updatedAtGreaterThanOrEqual = this.lastUpdatedAt;

	var pager = new kaltura.client.objects.KalturaFilterPager();
	pager.pageSize = 500;
	
	var This = this;
	this.client.cuePoint.listAction(function(cuePointsList){
		This.handleCuePointsList(cuePointsList, filter, pager);
	}, filter, pager);
};


/**
 * Add entry to be watched
 * 
 * @action cuePoints.watch
 * 
 * @param entryId
 */
KalturaCuePointsManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['entryId', 'partnerId']);
	if(!params)
		return;

	response.dir(params);

	if(this.cuePoints[params.entryId]){
		response.writeHead(200);
		response.end('Entry [' + params.entryId + '] already watched');
		return;
	}
	else{
		this.callRestorableAction('cuePoints', 'watchEntry', params);		
	}

	response.writeHead(200);
	response.end('OK');
};


/**
 * Restorable action, add entry to be watched
 * 
 * @param params.entryId
 * @param finishCallback function to be called when this entry watch is not needed anymore
 */
KalturaCuePointsManager.prototype.watchEntry = function(params, finishCallback){
	KalturaLogger.dir(params);
	
	this.cuePoints[params.entryId] = {
		finishCallback: finishCallback,
		cuePoints: {}
	};
	
	if(!this.interval){
		var This = this;
		this.interval = setInterval(function(){
			if(!This.run){
				clearInterval(This.interval);
				KalturaLogger.log('Run variable is false clearing cue points interval for pId ' + process.pid);
				This.interval = null;
				return;
			}
			
			This.loop();
		}, 10000);
	}
	
	this.loop();
};

/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 * @action cuePoints.stitch
 * 
 * @param entryId 
 * @param uiConfId 
 * @param sessionId
 */
KalturaCuePointsManager.prototype.stitch = function(request, response, params){
	
	params = this.parsePlayServerParams(response, params, ['entryId', 'uiConfId', 'sessionId']);
	var This = this;
	var encodingIds = [];
	var mediaInfos = null;
	var entry = null;
	var metadata = null;	
	var metadataProfileId = null;
	var playerConfig = null;
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
		KalturaAdIntegrationHandler.getAdMediaFiles(request, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, params.sessionId, uiConfConfig, function(adFileId, adFileInfo){		
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
	
	var findCuePointsToStitch = function(cuePoints, elapsedTime){		
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
				var cuePointHandledKey = KalturaCache.getCuePointHandled(cuePointId, params.sessionId);
	   			if(cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 < timeWindowEnd){
					KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
						stitchAd(cuePoint);
						}, function(err){
							response.log('cue point [' + cuePointId + '] for session [' + params.sessionId + '] already handled');
					});
	   			}
	   			else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
					KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
						stitchAd(cuePoint);
						}, function(err){
							response.log('cue point [' + cuePointId + '] for session [' + params.sessionId + '] already handled');
					});
	   			}
	   		}
		});		
	};
	
	var cuePointsKey = KalturaCache.getCuePoints(params.entryId);
	var elapsedTimeKey = KalturaCache.getElapsedTime(params.entryId);
	var entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
	var playerConfigKey = KalturaCache.getPlayerConfig(params.sessionId);	
	var uiConfConfigKey = KalturaCache.getUiConfConfig(params.uiConfId);
	
	KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey, playerConfigKey, uiConfConfigKey], function(data){
		if(data[playerConfigKey]){
			KalturaCache.touch(playerConfigKey, KalturaConfig.config.cache.playerConfig, null, function() {
				KalturaLogger.log('Failed to load player config for session ' + params.sessionId + ' with error ' + err);
			});
			playerConfig = data[playerConfigKey];
		}
		else{
			KalturaLogger.log('player config not loaded for session ' + params.sessionId);
		}
		
		if(data[entryRequiredKey])
			encodingIds = data[entryRequiredKey].split('\n').unique();
		
		if(!data[uiConfConfigKey]){
			This.getAndStoreUiConfConfig(params.uiConfId, params.entryId, params.partnerId, function(uiConfConfigRes) {
				uiConfConfig = uiConfConfigRes;
				findCuePointsToStitch(data[cuePointsKey], data[elapsedTimeKey], encodingIds);
			});			
		}
		else{
			uiConfConfig = data[uiConfConfigKey];
			findCuePointsToStitch(data[cuePointsKey], data[elapsedTimeKey], encodingIds);
		}		
	});		
};

module.exports.KalturaCuePointsManager = KalturaCuePointsManager;
