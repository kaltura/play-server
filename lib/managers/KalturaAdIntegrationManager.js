
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
				This.callPlayServerService('ad', 'stitch', params.partnerId, params);
			}, function (err) {
				response.log('Server ad [' + serverAdId + '] already handled');
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
	var uiConfConfigKey = KalturaCache.getUiConfConfig(params.uiConfId);
	
	KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey, uiConfConfigKey], function(data){
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

module.exports.KalturaAdIntegrationManager = KalturaAdIntegrationManager;
