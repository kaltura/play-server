var http = require('follow-redirects').http;
var util = require('util');
var requestPckg = require('request');

var kaltura = module.exports = require('../KalturaManager');

require('../utils/KalturaUrlTokenMapper');
require('../adServingProtocols/vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');
var kalturaAspectRatio = require('../media/KalturaAspectRatio');


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
	var encodingIdsKeys = [];
	var mediaInfos = null;
	var entry = null;
	var metadata = null;	
	var metadataProfileId = null;
	
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
	   		var cuePointUrlKey = KalturaCache.getCuePointUrl(cuePoint.id);
			var cuePointHandledKey = KalturaCache.getCuePointHandled(cuePointId, params.sessionId);
	   		if( (cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 < timeWindowEnd) ||
	   			(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd)){
				KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){					
					KalturaCache.get(cuePointUrlKey, function(cachedUrl){
						if(cachedUrl){
							response.debug('Cue point url found in cache: [' + cachedUrl + ']');
							This.stitchAd(request, response, params.partnerId, cachedUrl, cuePoint, entry, metadata, params.playerConfig, mediaInfos, params.sessionId, uiConfConfig);
						}
						else{
							response.debug('Cue point url not found in cache');
							if(!entry){
								This.getEntryAndMetadata(params.partnerId, params.entryId, metadataProfileId, function(entryObj, metadataObj){
									entry = entryObj;
									metadata = metadataObj;
									This.stitchAd(request, response, params.partnerId, null, cuePoint, entry, metadata, params.playerConfig, mediaInfos, params.sessionId, uiConfConfig);
								});
							}	   						
						}
						}, function (err) {
							response.debug('Cue point url not found in cache: ' + err);
							if(!entry){
								This.getEntryAndMetadata(params.partnerId, params.entryId, metadataProfileId, function(entryObj, metadataObj){
									entry = entryObj;
									metadata = metadataObj;
									This.stitchAd(request, response, null, params.partnerId, cuePoint, entry, metadata, params.playerConfig, mediaInfos, params.sessionId, uiConfConfig);
								});
							}	   						
						});
				}, function(err){
					response.debug('cue point [' + cuePointId + '] for session [' + params.sessionId + '] already handled');
				});
	   		}
	   	}
	});		
};

/**
 * Stitch specific cue point
 * @param request
 * @param response
 * @param cachedUrl
 * @param cuePoint
 * @param entry
 * @param metadata
 * @param playerConfig
 * @param mediaInfos
 * @param sessionId
 * @param uiConfConfig
 */
KalturaAdIntegrationManager.prototype.stitchAd = function(request, response, partnerId, cachedUrl, cuePoint, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig ) {
	var This = this;
   	
	This.getAdMediaFiles(request, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, function(adFileId, adFileInfo){		
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
				This.callPlayServerService('ad', 'stitch', partnerId, stitchParams);
			}, function (err) {
				response.debug('Server ad [' + serverAdId + '] already handled');
			});
		});
			
	};
};

/**
 * Get entry and metadata objects
 * @param partnerId
 * @param entryId
 * @param metadataProfileId
 * @param callback
 */
KalturaAdIntegrationManager.prototype.getEntryAndMetadata = function(partnerId, entryId, metadataProfileId, callback){
	var This = this;
	
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

/**
 * Get ad server xml and download ad file
 * @param request
 * @param cuePoint
 * @param cachedUrl
 * @param entry
 * @param metadata
 * @param playerConfig
 * @param mediaInfos
 * @param sessionId
 * @param uiConfConfig
 * @param downloadCallback
 * @param errorCallback
 * @returns
 */
KalturaAdIntegrationManager.prototype.getAdMediaFiles = function(request, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, downloadCallback, errorCallback) {
	var This = this;	
	
	var headers = {
			'User-Agent': request.headers['user-agent'],
			'x-forwarded-for': request.headers['x-forwarded-for'],				
	};
	
	var doGetAdMediaFiles = function(evaluatedUrl){
		
		KalturaLogger.log('Url after tokens mapping [' + evaluatedUrl + ']');
		
		var vastRequestTimeOut = uiConfConfig.timeOut;
		if(!vastRequestTimeOut){
			vastRequestTimeOut = KalturaConfig.config.adIntegration.vastRequestTimeOut;
		}
		
		KalturaVastParser.parse(evaluatedUrl, headers, vastRequestTimeOut*1000, function(adServerResponse) {
			if (!adServerResponse) {
				var msg = 'Failed to get Ad server response';
				KalturaLogger.error(msg);
				return errorCallback();
			}
			
			var trackingInfo = {};
			var trackingId = KalturaCache.getAdTrackingId(cuePoint.id, sessionId);
			
			var ads = selectAdsByDuration(adServerResponse, cuePoint.duration/1000);
			
			if(ads.length > 0 ){
				for (var adIdx = 0, adLen = ads.length; adIdx < adLen; adIdx++) {
					processSelectedAd(ads[adIdx], trackingInfo);
				}
				KalturaCache.set(trackingId, trackingInfo, KalturaConfig.config.cache.cuePoint);

			}
		});	
	};
	
	var processSelectedAd = function(ad, trackingInfo){
		var trackingInfoItem = {}; 
		
		if(ad.ad != null && ad.creative != null){				
			trackingInfoItem = ad.creative.trackingEvents;
			trackingInfoItem.impression = ad.ad.impressionURLTemplates;
			trackingInfoItem.error = ad.ad.errorURLTemplates;	
			trackingInfoItem.duration = ad.creative.duration*90000; //save in ts units
			trackingInfo[ad.ad.sequence] = trackingInfoItem;			
		}	
		This.selectMediaFilePerAspectRatio(ad, mediaInfos, function(adPerAspectRatio){
			for(var adFileId in adPerAspectRatio){
				var adFileInfo = adPerAspectRatio[adFileId];
				adFileInfo.sequence = ad.ad.sequence;
				adFileInfo.duration = ad.creative.duration*90000;
				adFileInfo.sharedFilePath = KalturaConfig.config.cloud.sharedBasePath + '/ad_download/' + adFileId;
				
				var options = {
					headers : headers,
					filePath : adFileInfo.sharedFilePath};

				downloadHttpUrl(adFileId, adFileInfo, options, function(adFileId, adFileInfo) {
					downloadCallback(adFileId, adFileInfo);
				}, function(err) {
					var msg = 'Download HTTP URL error: ' + err;
					KalturaLogger.error(msg);
					if(errorCallback){
						errorCallback(msg);
					}						
				});
			}						
		});			
	};
	
	var roundDuration = function(duration){
		var coefficient = KalturaConfig.config.adIntegration.durationCoefficient;
		var div = duration / coefficient;
		var floor = Math.floor(div);

		if(div - floor > 0){
			duration = (floor + 1)*coefficient;
		}
		return duration;
	};
	
	var selectAdsByDuration = function(adServerResponse, duration){
		var adPod = [];
		var adPodDuration = 0;
		var selectedAdPod = [];
		var selectedCreative = null;
		var selectedAd = null;
		var selectedLowerDurCreative = null;
		var selectedLowerDurAd = null;
		var selectedHigerDurCreative = null;
		var selectedHigerDurAd = null;
		// find best matching creative according to cue point duration
		for (var adIdx = 0, adLen = adServerResponse.ads.length; adIdx < adLen; adIdx++) {
			var ad = adServerResponse.ads[adIdx];					
			for (var creaIdx = 0, creaLen = ad.creatives.length; creaIdx < creaLen; creaIdx++) {
				var creative = ad.creatives[creaIdx];
				if (creative.type == "linear") {
					creative.duration = roundDuration(creative.duration);
					if(ad.sequence > 0){
						adPod.push({ad: ad, creative: creative});
						break;							
					}
					else{ //prepare single ad in case no ad pods will be selected
						if(creative.duration == duration){
								selectedLowerDurCreative = creative;
								selectedLowerDurAd = ad;
								break;
						}
						
						if(creative.duration <= duration){
							if(selectedLowerDurCreative == null){
								selectedLowerDurCreative = creative;
								selectedLowerDurAd = ad;
							}								
							else if(selectedLowerDurCreative.duration < creative.duration){
								selectedLowerDurCreative = creative;
								selectedLowerDurAd = ad;
							}								
						}
						else{
							if(selectedHigerDurCreative == null){
								selectedHigerDurCreative = creative;
								selectedHigerDurAd = ad;
							}
							else if(selectedHigerDurCreative.duration > creative.duration){
								selectedHigerDurCreative = creative;
								selectedHigerDurAd = ad;
							}
						}	
					}
				}
			}
		}
		
		selectedCreative = selectedLowerDurCreative ? selectedLowerDurCreative : selectedHigerDurCreative;
		selectedAd = selectedLowerDurAd ? selectedLowerDurAd : selectedHigerDurAd;
		
		adPod.sort(function(ad1, ad2) {return ad1.ad.sequence - ad2.ad.sequence;});
		for(var adIdx = 0, adLen = adPod.length; adIdx < adLen; adIdx++){
			adPodDuration+= adPod[adIdx].creative.duration;
			selectedAdPod.push(adPod[adIdx]);

			if(adPodDuration >=  duration){
				break;
			}	
		}
		
		if(selectedAdPod.length > 0){
			KalturaLogger.log('Selected Ad Pod with ' + selectedAdPod.length + ' ads of total duration ' + adPodDuration);
			return selectedAdPod;
		}				
		else{
			KalturaLogger.log('No Ad Pod selected');
			if(selectedCreative){
				KalturaLogger.log('Selected Creative with duration ' + selectedCreative.duration);
				return [{ad:selectedAd, creative: selectedCreative}];
			}					
			else{
				KalturaLogger.log('No creative selected');
				return [];
			}				
		}			
	};
	
	var downloadHttpUrl = function(adFileId, adFileInfo, options, successCallback, errorCallback) {
		
		KalturaUtils.downloadHttpUrl(adFileInfo.fileURL, options, function(filePath){
			successCallback(adFileId, adFileInfo);				
		}, errorCallback);		
	};
	
	if(!cuePoint){
		KalturaLogger.log('Cue point is missing');
		return errorCallback();
	}
	
	KalturaLogger.log('Parsing ads from [' + cuePoint.sourceUrl + ']');
	
	if(cachedUrl == null){
		KalturaUrlTokenMapper.mapFixedTokens(request, cuePoint, entry, metadata, playerConfig, function(cachedUrl){
			evaluatedUrl = KalturaUrlTokenMapper.mapDynamicTokens(request, cachedUrl, playerConfig);
			doGetAdMediaFiles(evaluatedUrl);
		});
	}
	else{
		evaluatedUrl = KalturaUrlTokenMapper.mapDynamicTokens(request, cachedUrl, playerConfig);
		doGetAdMediaFiles(evaluatedUrl);			
	}
};

/**
 * Select best ad media files for transcoding
 * @param ad
 * @param mediaInfos
 * @param callback
 * @returns
 */
KalturaAdIntegrationManager.prototype.selectMediaFilePerAspectRatio = function(ad, mediaInfos, callback) {	
	var adPerAspectRatio = {};
	var aspectRatioGroupsToHandle = 0;
	
	var getAspectRatioGroups = function(){
		var aspectRatioGroups = {};
		for(var mediaInfoId in mediaInfos){
			if(!mediaInfos[mediaInfoId])
				continue;
			var group = kalturaAspectRatio.convertFrameSize(mediaInfos[mediaInfoId].video.width, mediaInfos[mediaInfoId].video.height);
			if(!(group in aspectRatioGroups)){
				aspectRatioGroupsToHandle++;
				aspectRatioGroups[group] = [];
			}					
			aspectRatioGroups[group].push(mediaInfoId);
		}
		return aspectRatioGroups;
	};
	
	var getBestMediaInfo = function(groupMediaInfoIds){
		var selectedMediaInfo = null;
		
		// get highest media info object
		for (var i=0; i<groupMediaInfoIds.length; i++) {
			var mediaInfoId = groupMediaInfoIds[i];
			var currentMediaInfo = mediaInfos[mediaInfoId];
			if (selectedMediaInfo == null){
				selectedMediaInfo = currentMediaInfo;
			}					
			else {
				var selectedMediaInfoBitrate = selectedMediaInfo.video.bitrate ? (selectedMediaInfo.video.bitrate / 1024) : (selectedMediaInfo.general.bitrate / 1024);
				var currentMediaInfoBitrate = currentMediaInfo.video.bitrate ? (currentMediaInfo.video.bitrate / 1024) : (currentMediaInfo.general.bitrate / 1024);
				var compare = kalturaMediaInfo.compare(selectedMediaInfoBitrate, selectedMediaInfo.video.width, selectedMediaInfo.video.height, currentMediaInfoBitrate, currentMediaInfo.video.width, currentMediaInfo.video.height);
				if (compare < 0){
					selectedMediaInfo = currentMediaInfo;
				}
			}
		}
		selectedMediaInfo.video.bitrate = selectedMediaInfo.video.bitrate ? (selectedMediaInfo.video.bitrate / 1024) : (selectedMediaInfo.general.bitrate / 1024);
		KalturaLogger.log('Best media info: bitrate [' + selectedMediaInfo.video.bitrate + '], width [' + selectedMediaInfo.video.width + '], height [' + selectedMediaInfo.video.height + ']');
		
		return selectedMediaInfo;
	};
	
	//TODO check limits
	var findBestAdFile = function(adMediaFiles, mediaInfo) {
		
		var shouldReplaceCandidate =  function(original, current, candidate){	
			if(!original.video.bitrate){
				original.video.bitrate = 0;
			}
			if(!original.video.width){
				original.video.width = 0;
			}
			if(!original.video.height){
				original.video.height = 0;
			}
			if(!current.bitrate){
				current.bitrate = 0;
			}
			if(!current.width){
				current.width = 0;
			}
			if(!current.height){
				current.height = 0;
			}
			if(!candidate.bitrate){
				candidate.bitrate = 0;
			}
			if(!candidate.width){
				candidate.width = 0;
			}
			if(!candidate.height){
				candidate.height = 0;
			}				

			var originalBitrate = original.video.bitrate*1.5;
					
			var widthDiff = [];
			widthDiff.push(current.width-original.video.width);
			widthDiff.push(candidate.width-original.video.width);
			
			var heightDiff = [];
			heightDiff.push(current.height-original.video.height);
			heightDiff.push(candidate.height-original.video.height);
			
			var bitrateDiff = [];
			bitrateDiff.push(current.bitrate-originalBitrate);
			bitrateDiff.push(candidate.bitrate-originalBitrate);
			
			currentAbsValue = Math.abs(widthDiff[0]) + Math.abs(heightDiff[0]);
			candidateAbsValue = Math.abs(widthDiff[1]) + Math.abs(heightDiff[1]);				
			currentValue = widthDiff[0] + heightDiff[0];
			candidateValue = widthDiff[1] + heightDiff[1];
			
			if(((currentValue >= 0 && candidateValue >= 0) || (currentValue < 0 && candidateValue < 0) ) && currentAbsValue < candidateAbsValue){
				return true;
			}
			if(currentValue >= 0 && candidateValue < 0)
				return true;

			currentAbsValue = currentAbsValue + Math.abs(bitrateDiff[0]);
			candidateAbsValue = candidateAbsValue + Math.abs(bitrateDiff[1]);				
			currentValue = currentValue + bitrateDiff[0];
			candidateValue = candidateValue + bitrateDiff[1];

			if(((currentValue >= 0 && candidateValue >= 0) || (currentValue < 0 && candidateValue < 0) ) && currentAbsValue < candidateAbsValue){
				return true;
			}
			if(currentValue >= 0 && candidateValue < 0)
				return true;

			return false;
		};
		
		var selectAdFilesWithBestAspectRatio = function(){
			var aspectRatioKeys = [];
			var bestAdFiles = [];
			for(var i=0; i<adMediaFiles.length;i++){
				//skip media files with apiFramework=VPAID
				if(adMediaFiles[i].apiFramework == 'VPAID')
					continue;
				var aspectRatio = kalturaAspectRatio.convertFrameSize(adMediaFiles[i].width, adMediaFiles[i].height);
				aspectRatioKeys.push(aspectRatio);
			}
			var bestAspectRatio = kalturaAspectRatio.convertFrameSizeForAspectRatioKeys(mediaInfo.video.width, mediaInfo.video.height, aspectRatioKeys);
			
			for(i=0; i<aspectRatioKeys.length; i++){
				if(aspectRatioKeys[i] == bestAspectRatio)
					bestAdFiles.push(adMediaFiles[i]);
			}
			
			return bestAdFiles;
		};

		
		var bestRatioAdFiles = selectAdFilesWithBestAspectRatio();
		var adFileCandidate = null;

		for(var i=0; i<bestRatioAdFiles.length; i++){
			var currentAdFile = bestRatioAdFiles[i];
			if (!adFileCandidate){
				adFileCandidate = currentAdFile;
			}					
			else {
				var res = shouldReplaceCandidate(mediaInfo, currentAdFile, adFileCandidate);
				if(res){
					adFileCandidate = currentAdFile;
				}
			}
		}

		return adFileCandidate;
	};
	
	var setAdFileInfo = function(mediaFile, aspectRatioGroup, callback){
		if (!mediaFile){
			aspectRatioGroupsToHandle--;
			if(aspectRatioGroupsToHandle == 0)
				callback(adPerAspectRatio);
			return;
		}
			

		requestPckg.get(mediaFile.fileURL, function (err, res, body) {
			var redirectURL = mediaFile.fileURL;
			if(res){
				KalturaLogger.log('Redirect media file URL: [' +  res.request.uri.href + '] ');
				redirectURL = res.request.uri.href;
			}
			var adFileId = redirectURL.md5();				
			if(adFileId in adPerAspectRatio){
				var mediaInfoIds = originalAssetsAspectRatioGroups[aspectRatioGroup].concat(adPerAspectRatio[adFileId].mediaInfoIds);
				adPerAspectRatio[adFileId].mediaInfoIds = mediaInfoIds;
				KalturaLogger.log('Added mediaInfo ids to media file: [' + adPerAspectRatio[adFileId].fileURL + '] mediaInfo ids [' + adPerAspectRatio[adFileId].mediaInfoIds + ']');
			}
			else{
				var adFileInfo = {
						fileURL : mediaFile.fileURL.trim(),
						mediaInfoIds: originalAssetsAspectRatioGroups[aspectRatioGroup]
					};
					adPerAspectRatio[adFileId] = adFileInfo;
					
					KalturaLogger.log('Selected media file: [' + adFileInfo.fileURL + '] for mediaInfo ids [' + adFileInfo.mediaInfoIds + ']');
			}	
			
			aspectRatioGroupsToHandle--;
			if(aspectRatioGroupsToHandle == 0)
				callback(adPerAspectRatio);

		});			
	};
	
	if(ad.creative == null)
		return callback(adPerAspectRatio);
	
	var originalAssetsAspectRatioGroups = getAspectRatioGroups();
			
	for(aspectRatioGroup in originalAssetsAspectRatioGroups){
		var bestOriginalAsset = getBestMediaInfo(originalAssetsAspectRatioGroups[aspectRatioGroup]);

		mediaFile = findBestAdFile(ad.creative.mediaFiles, bestOriginalAsset);
		
		setAdFileInfo(mediaFile, aspectRatioGroup, callback);
	}
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
