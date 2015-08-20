var http = require('follow-redirects').http;
http.globalAgent.maxSockets = Infinity;

var util = require('util');
var requestPckg = require('request');

var kaltura = module.exports = require('../KalturaManager');

require('../utils/KalturaUrlTokenMapper');
require('../adServingProtocols/vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');
var kalturaAspectRatio = require('../media/KalturaAspectRatio');
var parseString = require('xml2js').parseString;

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
		This.okResponse(response, 'OK', 'text/plain');
		
		if(data[entryRequiredKey]) {
			encodingIds = data[entryRequiredKey].split('\n').unique();
			response.debug('encodingIds [' +  encodingIds + '] for entryRequiredKey: [' + entryRequiredKey +']');
		} else {
			response.debug('Could not find data for  entryRequiredKey [' + entryRequiredKey + ']');
		}
		
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
	 		response.log('Exiting stitchCuePoints, cuePoints is empty:' + !cuePoints + ' elapsedTime is empty:' + !elapsedTime + ' encodingIds are empty: ' + !encodingIds);
	   		return;
	   	}
	   			   		
	   	var tenMinutes = 10 * 60 * 1000;
	    		
	   	var timeWindowStart = elapsedTime.timestamp - tenMinutes;
	   	var timeWindowEnd = elapsedTime.timestamp + tenMinutes;
	   
	   	var offsetWindowStart = elapsedTime.offset - tenMinutes;
	   	var offsetWindowEnd = elapsedTime.offset + tenMinutes;	
		
	   	var playerConfig = null;
	   	if(params.playerConfig){
	   		playerConfig = JSON.parse(params.playerConfig);
	   		if(playerConfig){
	   			metadataProfileId = playerConfig['metadataProfileId'];
	   		}	   		
	   	}
	   	
	   	var handleCuePoint = function(cuePoint){
	   		response.debug('Handling cue point [' + cuePoint.id + '] timeWindowStart [' + timeWindowStart + '] timeWindowEnd [' + timeWindowEnd + '] offsetWindowStart [' + offsetWindowStart + '] offsetWindowEnd [' + offsetWindowEnd + ']');
	   		var cuePointUrlKey = KalturaCache.getCuePointUrl(cuePoint.id);
			var cuePointHandledKey = KalturaCache.getCuePointHandled(cuePoint.id, params.sessionId);
	   		if( (cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 < timeWindowEnd) ||
	   			(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd)){
				KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){					
					KalturaCache.get(cuePointUrlKey, function(cachedUrl){
						if(cachedUrl){
							response.debug('Cue point url found in cache: [' + cachedUrl + '] for cue point [' + cuePoint.id + ']');
							This.stitchAd(request, response, params.partnerId, cachedUrl, cuePoint, entry, metadata, playerConfig, mediaInfos, params.sessionId, uiConfConfig);
						}
						else{
							response.debug('Cue point url not found in cache for cue point [' + cuePoint.id + ']');
							if(!entry){
								This.getEntryAndMetadata(params.partnerId, params.entryId, metadataProfileId, function(entryObj, metadataObj){
									entry = entryObj;
									metadata = metadataObj;
									This.stitchAd(request, response, params.partnerId, null, cuePoint, entry, metadata, playerConfig, mediaInfos, params.sessionId, uiConfConfig);
								});
							}
							else{
								This.stitchAd(request, response, params.partnerId, null, cuePoint, entry, metadata, playerConfig, mediaInfos, params.sessionId, uiConfConfig);
							}
						}
						}, function (err) {
							response.debug('Cue point url not found in cache for cue point [' + cuePoint.id + ']: ' + err);
							if(!entry){
								This.getEntryAndMetadata(params.partnerId, params.entryId, metadataProfileId, function(entryObj, metadataObj){
									entry = entryObj;
									metadata = metadataObj;
									This.stitchAd(request, response, null, params.partnerId, cuePoint, entry, metadata, playerConfig, mediaInfos, params.sessionId, uiConfConfig);
								});
							}
							else{
								This.stitchAd(request, response, null, params.partnerId, cuePoint, entry, metadata, playerConfig, mediaInfos, params.sessionId, uiConfConfig);
							}
						});
				}, function(err){
					response.debug('cue point [' + cuePoint.id + '] for session [' + params.sessionId + '] already handled');
				});
	   		}	   		
	   	};
	   	
	   	for(var cuePointId in cuePoints){
	   		cuePoint = cuePoints[cuePointId];
	   		handleCuePoint(cuePoint);
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
   	
	This.getAdMediaFiles(request, response, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, function(adFileId, adFileInfo){		
		response.log('Handling ad file [' + adFileInfo.fileURL + '] session [' + sessionId +']');			
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
		var serverAdId = adFileId + '-' + encodingId;
		
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
			var waitForMDParseCallback = false;
			if(results && results.length > 0){
				if(results[0].objectType == 'KalturaAPIException'){
					KalturaLogger.error('Client [baseEntry.get][' + results[0].code + ']: ' + results[0].message);
				}					
				else{
					entry = results[0];
				}					
				if(results.length > 1){
					if(results[1].objectType == 'KalturaAPIException'){
						KalturaLogger.error('Client [metadata.list][' + results[1].code + ']: ' + results[1].message);
					}					
					else if(results[1].objects.length > 0){
						var metadataStr = results[1].objects[0].xml;
						if(metadataStr){
							waitForMDParseCallback = true;
							parseString(metadataStr, function (err, metadata){
								KalturaLogger.debug('Parsed metadata :' + JSON.stringify(metadata));
								callback(entry, metadata);
							});							
						}
					}												
				}
			}
			if(!waitForMDParseCallback){
				callback(entry, metadata);
			}			
		});
		
	};
	
	if(!This.sessionReady)
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
KalturaAdIntegrationManager.prototype.getAdMediaFiles = function(request, response, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, downloadCallback, errorCallback) {
	var This = this;	
	
	var headers = {
			'User-Agent': request.headers['user-agent'],
	};
	
	if(uiConfConfig.overrideXForwardFor){
		headers['x-forwarded-for'] = request.headers['x-forwarded-for'];
	}
	
	var adFilesInfo = {};
	
	var doGetAdMediaFiles = function(evaluatedUrl){
		
		response.log('Url after tokens mapping [' + evaluatedUrl + ']');
		
		var vastRequestTimeOut = uiConfConfig.timeOut;
		if(!vastRequestTimeOut){
			vastRequestTimeOut = KalturaConfig.config.adIntegration.vastRequestTimeOut;
		}
		
		KalturaVastParser.parse(evaluatedUrl, headers, vastRequestTimeOut*1000, function(adServerResponse) {
			if (!adServerResponse) {
				var msg = 'Failed to get Ad server response';
				response.error(msg);
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
		This.selectMediaFilePerAspectRatio(response, ad, mediaInfos, function(adPerAspectRatio){
			for(var adFileId in adPerAspectRatio){
				var adFileInfo = adPerAspectRatio[adFileId];
				adFileInfo.sequence = ad.ad.sequence;
				adFileInfo.duration = ad.creative.duration*90000;
				adFileInfo.sharedFilePath = KalturaConfig.config.cloud.sharedBasePath + '/ad_download/' + adFileId;
				adFilesInfo[adFileId] = adFileInfo;
				
				var options = {
					headers : headers,
					filePath : adFileInfo.sharedFilePath};

				downloadHttpUrl(adFileId, adFileInfo, options, function(adFileId, adFileInfo) {
					downloadCallback(adFileId, adFileInfo);
				}, function(err) {
					var msg = 'Download HTTP URL error: ' + err;
					response.error(msg);
					if(errorCallback){
						errorCallback(msg);
					}						
				});
			}	
			setServerAdIdsInCache();
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
			response.log('Selected Ad Pod with ' + selectedAdPod.length + ' ads of total duration ' + adPodDuration);
			return selectedAdPod;
		}				
		else{
			response.log('No Ad Pod selected');
			if(selectedCreative){
				response.log('Selected Creative with duration ' + selectedCreative.duration);
				return [{ad:selectedAd, creative: selectedCreative}];
			}					
			else{
				response.log('No creative selected');
				return [];
			}				
		}			
	};
	
	var downloadHttpUrl = function(adFileId, adFileInfo, options, successCallback, errorCallback) {
		response.log('Download ' + adFileInfo.fileURL);
		KalturaUtils.downloadHttpUrl(adFileInfo.fileURL, options, function(filePath){
			successCallback(adFileId, adFileInfo);				
		}, errorCallback);		
	};
	
	var setServerAdIdsInCache = function () {

		response.log('Setting server ad ids in cache');
		var serverAdIdValues = {};
		
		for(var adFileId in adFilesInfo){
			var adFileInfo = adFilesInfo[adFileId];
			for(var i = 0; i < adFileInfo.mediaInfoIds.length; i++){
				var encodingId = KalturaCache.getEncodingIdFromMediaInfo(adFileInfo.mediaInfoIds[i]);
				var serverAdIdKey = KalturaCache.getServerAdId(cuePoint.id, encodingId, sessionId);
				var serverAdId = adFileId + '-' + encodingId;
				var serverAdIds = serverAdIdValues[serverAdIdKey];
				if(!serverAdIds){
					serverAdIds = [];
				}
				serverAdIds[adFileInfo.sequence] = {id: serverAdId, duration: adFileInfo.duration}; 
				serverAdIdValues[serverAdIdKey] = serverAdIds;				
			}
		}
		
		for(var serverAdIdKey in serverAdIdValues){
			response.log('Setting Server Ad ids for key [' + serverAdIdKey + '] values [' + JSON.stringify(serverAdIdValues[serverAdIdKey]) + ']');
			KalturaCache.set(serverAdIdKey, serverAdIdValues[serverAdIdKey], KalturaConfig.config.cache.adMedia);
		}				
	};
	
	if(!cuePoint){
		response.log('Cue point is missing');
		return errorCallback();
	}
	
	response.log('Parsing ads from [' + cuePoint.sourceUrl + '] cue point [' + cuePoint.id + '] session [' + sessionId + '] headers [' + JSON.stringify(headers) + ']');
	
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
KalturaAdIntegrationManager.prototype.selectMediaFilePerAspectRatio = function(response, ad, mediaInfos, callback) {	
	var adPerAspectRatio = {};
	var aspectRatioGroupsToHandle = 0;
	
	var getAspectRatioGroups = function(){
		var aspectRatioGroups = {};
		response.debug('getAspectRatioGroups mediaInfos: ' + JSON.stringify(mediaInfos));
		for(var mediaInfoId in mediaInfos){
			if(!mediaInfos[mediaInfoId]){
				response.debug('Skipping mediaInfoId [' + mediaInfoId + '], due to undefined entry in mediaInfos');
				continue;
			}
			var mediaInfoWidth = mediaInfos[mediaInfoId].video ? mediaInfos[mediaInfoId].video.width : 0;
			var mediaInfoHeight = mediaInfos[mediaInfoId].video ? mediaInfos[mediaInfoId].video.height : 0;
			var group = kalturaAspectRatio.convertFrameSize(mediaInfoWidth, mediaInfoHeight);

			response.debug('Aspect ratio group for mediaInfo [' + mediaInfoId + '] is : [' + group + ']');
			if(!(group in aspectRatioGroups)){
				aspectRatioGroupsToHandle++;
				aspectRatioGroups[group] = [];
			}					
			aspectRatioGroups[group].push(mediaInfoId);
		}
		response.debug('getAspectRatioGroups return aspectRatioGroups: [' + JSON.stringify(aspectRatioGroups) +'] total of [' + aspectRatioGroupsToHandle + '] to handle');
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
				var compare = kalturaMediaInfo.compare(selectedMediaInfo, currentMediaInfo);
				if (compare < 0){
					selectedMediaInfo = currentMediaInfo;
				}
			}
		}
		if(!selectedMediaInfo.video){
			selectedMediaInfo.video = {};
		}
		selectedMediaInfo.video.bitrate = selectedMediaInfo.video.bitrate ? (selectedMediaInfo.video.bitrate / 1024) : (selectedMediaInfo.general.bitrate / 1024);
		response.log('Best media info: [' + JSON.stringify(selectedMediaInfo) + ']');
		
		return selectedMediaInfo;
	};
	
	var findBestAdFile = function(adMediaFiles, mediaInfo) {
		
		var selectAdFilesWithBestAspectRatio = function(){
			var aspectRatioKeys = [];
			var bestAdFiles = [];
			for(var i=0; i<adMediaFiles.length;i++){
				//skip media files with apiFramework=VPAID
				if(adMediaFiles[i].apiFramework == 'VPAID'){
					response.debug('Skipping VPAID apiFramework');
					continue;
				}

				var aspectRatio = kalturaAspectRatio.convertFrameSize(adMediaFiles[i].width, adMediaFiles[i].height);
				aspectRatioKeys.push(aspectRatio);
			}
			
			var mediaInfoWidth = mediaInfo.video ? mediaInfo.video.width : 0;
			var mediaInfoHeight = mediaInfo.video ? mediaInfo.video.height : 0;
			var bestAspectRatio = kalturaAspectRatio.convertFrameSizeForAspectRatioKeys(mediaInfoWidth, mediaInfoHeight, aspectRatioKeys);
			
			for(i=0; i<aspectRatioKeys.length; i++){
				if(aspectRatioKeys[i] == bestAspectRatio){
					bestAdFiles.push(adMediaFiles[i]);
				}					
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
				var option1 = {video: {bitrate:currentAdFile.bitrate, width:currentAdFile.width, height:currentAdFile.height}};
				var option2 = {video: {bitrate:adFileCandidate.bitrate, width:adFileCandidate.width, height:adFileCandidate.height}};
				var res = kalturaMediaInfo.selectMatchingMediaInfoOption(mediaInfo, option1, option2);
				if(res == 1){
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
			

		requestPckg.head(mediaFile.fileURL, function (err, res, body) {
			var redirectURL = mediaFile.fileURL;
			if(res){
				response.log('Redirect media file URL: [' +  res.request.uri.href + '] ');
				redirectURL = res.request.uri.href;
			}
			var adFileId = redirectURL.md5();				
			if(adFileId in adPerAspectRatio){
				var mediaInfoIds = originalAssetsAspectRatioGroups[aspectRatioGroup].concat(adPerAspectRatio[adFileId].mediaInfoIds);
				adPerAspectRatio[adFileId].mediaInfoIds = mediaInfoIds;
				response.log('Added mediaInfo ids to media file: [' + adPerAspectRatio[adFileId].fileURL + '] mediaInfo ids [' + adPerAspectRatio[adFileId].mediaInfoIds + ']');
			}
			else{
				var adFileInfo = {
						fileURL : mediaFile.fileURL.trim(),
						mediaInfoIds: originalAssetsAspectRatioGroups[aspectRatioGroup]
					};
					adPerAspectRatio[adFileId] = adFileInfo;
					
					response.log('Selected media file: [' + adFileInfo.fileURL + '] for mediaInfo ids [' + adFileInfo.mediaInfoIds + ']');
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
	this.okResponse(response, 'OK', 'text/plain');
	
	var sendBeaconForType = function(events, eventType){
		var httpGet = function(url, eventType){
			var request = http.get(url, function(res){
				if(res.statusCode == 408){
					response.log('Failed to send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '], timeout');
				}
				else{
					response.log('beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] sent with status: [' + res.statusCode + ']');
				}				
				res.on('data', function() { /* do nothing */ });
			});
			request.setTimeout( KalturaConfig.config.cloud.requestTimeout * 1000, function( ) {});			
			request.on('error', function(e){
				response.log('Failed to send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '], ' + e.message);
			});	
			request.on('socket', function(e) {
				response.log('Socket send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + ']');
			});

		};

		for(var i=0; i < events.length; i++){
			httpGet(events[i].trim(), eventType);
		}				
	};
	
	var checkBeaconProgress = function(progressStartPercent, progressEndPercent, beaconPercent, eventType, trackingInfo){
		if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent >= beaconPercent){
			response.debug('sending beacons of type: [' + eventType + ']');
			sendBeaconForType(trackingInfo[eventType], eventType);
			delete trackingInfo[eventType];
		}		
		
		else if(trackingInfo.hasOwnProperty(eventType) && beaconPercent == 100 && progressStartPercent >= 75 && progressEndPercent >= beaconPercent){
			response.debug('sending beacons of type: [' + eventType + '] ');
			sendBeaconForType(trackingInfo[eventType], eventType);
			delete trackingInfo[eventType];
		}		
	};
	
	var checkComplete = function(progressStartPercent, progressEndPercent, trackingInfo){		
		if(trackingInfo.hasOwnProperty('complete') && progressStartPercent >= 75 && progressEndPercent >= 100){
			response.debug('sending beacons of type: complete');
			sendBeaconForType(trackingInfo['complete'], 'complete');
			delete trackingInfo['complete'];
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
				response.debug('Tracking info : ' + JSON.stringify(trackingInfo));
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
				checkComplete(progressStartPercent, progressEndPercent, trackingInfo);					

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
