var util = require('util');
var urlPkg = require('url');
var requestPckg = require('request');

var kaltura = module.exports = require('../KalturaManager');
var udpsender = require('../utils/udpsender');

require('../utils/KalturaUrlTokenMapper');
require('../adServingProtocols/vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');
var kalturaAspectRatio = require('../media/KalturaAspectRatio');
var parseString = require('xml2js').parseString;

/**
 * @service adIntegration
 * 
 * The service is responsible for selecting cue points that are due to be stitched and performing their VAST call per session
 */
var KalturaAdIntegrationManager = function(){
	try {
		KalturaAdIntegrationManager.PRE_FETCH_WINDOW = parseInt(KalturaConfig.config.adIntegration.preFetchWindow) ;
	} catch (ex) {
		KalturaAdIntegrationManager.PRE_FETCH_WINDOW = 600000; // ten minutes
	}
	this.initClient(KalturaConfig.config.client);
};

util.inherits(KalturaAdIntegrationManager, kaltura.KalturaManager);

/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 * @action adIntegration.stitch
 * 
 * @param entryId 
 * @param uiConfConfigId 
 * @param sessionId
 */
KalturaAdIntegrationManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['entryId', 'uiConfConfigId', 'sessionId']);
	if(!params){
		this.errorMissingParameter(response);
		return;
	}
	if ( (params.playerConfig && params.playerConfig.toString() == '@PLAYER_CONFIG@') ||
		(params.sessionId && params.sessionId.toString() == '@SESSION_ID@')) {
		this.errorFaultyParameter(response);
		return;
	}
	this.okResponse(response, 'OK', 'text/plain');

	response.dir(params);

	var This = this;
	var renditionIds = [];
	var uiConfConfig = null;
	var cuePointsKey = KalturaCache.getKey(KalturaCache.ENTRY_CUE_POINTS_KEY_PREFIX, [params.entryId]);
	var elapsedTimeKey = KalturaCache.getKey(KalturaCache.ENTRY_ELAPSED_TIME_KEY_PREFIX, [params.entryId]);
	var entryRequiredKey = KalturaCache.getKey(KalturaCache.ENTRY_REQUIRED_KEY_PREFIX, [params.entryId]);
	var uiConfConfigKey = KalturaCache.getKey(KalturaCache.UI_CONF_CONFIG_KEY_PREFIX, [params.uiConfConfigId]);
	
	KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey, uiConfConfigKey], function(data){
		response.debug('handled');
		
		if(data[entryRequiredKey]) {
			renditionIds = KalturaCache.extractEntryRequiredValue(data[entryRequiredKey]);
			response.debug('renditionIds [' +  renditionIds + '] for entryRequiredKey: [' + entryRequiredKey +']');
		} else {
			response.debug('Could not find data for  entryRequiredKey [' + entryRequiredKey + ']');
		}
		
		uiConfConfig = data[uiConfConfigKey];
		This.stitchCuePoints(request, response, params, data[cuePointsKey], data[elapsedTimeKey], renditionIds, uiConfConfig);
	
	}, function(err){
		response.error(err);
	});		

};


/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 */
KalturaAdIntegrationManager.prototype.stitchCuePoints = function(request, response, params, cuePoints, elapsedTime, renditionIds, uiConfConfig){
	var This = this;
	var mediaInfoKeys = [];
	var encodingParamsKeys = [];
	var mediaInfos = null;
	var encodingParamsArr = null;
	var entry = null;
	var metadata = null;	
	var metadataProfileId = null;

	for(var i = 0; i < renditionIds.length; i++){
		if(renditionIds[i].trim().length){
			mediaInfoKeys.push(KalturaCache.getKey(KalturaCache.MEDIA_INFO_KEY_PREFIX, [renditionIds[i]]));
			encodingParamsKeys.push(KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [renditionIds[i]]));
		}			
	}
				
	KalturaCache.getMulti(mediaInfoKeys, function(mediaInfoData){
		mediaInfos = mediaInfoData;
			
	 	if(!cuePoints || !elapsedTime || !renditionIds){
	 		response.log('Exiting stitchCuePoints, cuePoints is empty:' + !cuePoints + ' elapsedTime is empty:' + !elapsedTime + ' renditionIds are empty: ' + !renditionIds);
	   		return;
	   	}
	   
	 	KalturaCache.getMulti(encodingParamsKeys, function(encodingParamsData){
	 		encodingParamsArr = encodingParamsData;
			var timeWindowStart = elapsedTime.timestamp - KalturaAdIntegrationManager.PRE_FETCH_WINDOW;
			var timeWindowEnd = elapsedTime.timestamp + KalturaAdIntegrationManager.PRE_FETCH_WINDOW;

			var offsetWindowStart = elapsedTime.offset - KalturaAdIntegrationManager.PRE_FETCH_WINDOW;
			var offsetWindowEnd = elapsedTime.offset + KalturaAdIntegrationManager.PRE_FETCH_WINDOW;
			
		   	var playerConfig = null;
		   	if(params.playerConfig){
		   		playerConfig = JSON.parse(params.playerConfig);
		   		if(playerConfig){
		   			metadataProfileId = playerConfig['metadataProfileId'];
		   		}	   		
		   	}
		   	
		   	var handleCuePoint = function(cuePoint){
		   		response.debug('Handling cue point [' + cuePoint.id + '] timeWindowStart [' + timeWindowStart + '] timeWindowEnd [' + timeWindowEnd + '] offsetWindowStart [' + offsetWindowStart + '] offsetWindowEnd [' + offsetWindowEnd + ']');
		   		var cuePointUrlKey = KalturaCache.getKey(KalturaCache.CUE_POINT_URL_KEY_PREFIX, [cuePoint.id]);
				var cuePointHandledKey = KalturaCache.getKey(KalturaCache.CUE_POINT_HANDLED_KEY_PREFIX, [cuePoint.id, params.sessionId]);
		   		if( (cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt*1000 && cuePoint.triggeredAt*1000 < timeWindowEnd) ||
		   			(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd)){
					KalturaCache.add(cuePointHandledKey, true, KalturaConfig.config.cache.sessionCuePoint, function(){					
						KalturaCache.get(cuePointUrlKey, function(cachedUrl){
							if(cachedUrl){
								response.debug('Cue point url found in cache: [' + cachedUrl + '] for cue point [' + cuePoint.id + ']');
								This.stitchAd(request, response, params.partnerId, cachedUrl, cuePoint, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, params.sessionId, uiConfConfig);
							}
							else{
								response.debug('Cue point url not found in cache for cue point [' + cuePoint.id + ']');
								if(!entry){
									This.getEntryAndMetadata(params.partnerId, params, metadataProfileId, function(entryObj, metadataObj){
										entry = entryObj;
										metadata = metadataObj;
										This.stitchAd(request, response, params, null, cuePoint, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, params.sessionId, uiConfConfig);
									});
								}
								else{
									This.stitchAd(request, response, params, null, cuePoint, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, params.sessionId, uiConfConfig);
								}
							}
							}, function (err) {
								response.debug('Cue point url not found in cache for cue point [' + cuePoint.id + ']: ' + err);
								if(!entry){
									This.getEntryAndMetadata(params.partnerId, params.entryId, metadataProfileId, function(entryObj, metadataObj){
										entry = entryObj;
										metadata = metadataObj;
										This.stitchAd(request, response, null, params, cuePoint, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, params.sessionId, uiConfConfig);
									});
								}
								else{
									This.stitchAd(request, response, null, params, cuePoint, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, params.sessionId, uiConfConfig);
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
 * @param encodingParamsArr
 * @param sessionId
 * @param uiConfConfig
 */
KalturaAdIntegrationManager.prototype.stitchAd = function(request, response, params, cachedUrl, cuePoint, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, sessionId, uiConfConfig) {
	var This = this;

	var stitchAdForEncodingId = function(cuePointId, renditionId, encodingId, adFileId, adFileInfo){
		var serverAdId = adFileId + '-' + encodingId;

		response.log('Stitching [' + serverAdId + ']');
		var adHandledKey = KalturaCache.getKey(KalturaCache.AD_HANDLED_KEY_PREFIX, [serverAdId]);
		KalturaCache.add(adHandledKey, true, KalturaConfig.config.cache.cuePoint, function(){
			var stitchParams = {
				serverAdId: serverAdId,
				renditionId: renditionId,
				sharedFilePath: adFileInfo.sharedFilePath
			};
			This.callPlayServerService('ad', 'stitch', params.partnerId, stitchParams);
		}, function (err) {
			response.debug('Server ad [' + serverAdId + '] already handled');
		});

	};

	this.getAdMediaFiles(request, response, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, sessionId, uiConfConfig, params.sessionStartTime, function(adFileId, adFileInfo){
		response.log('Handling ad file [' + adFileInfo.fileURL + '] session [' + sessionId +']');			
		for(var i = 0; i < adFileInfo.mediaInfoIds.length; i++){
			if(adFileInfo.mediaInfoIds[i].trim().length){	
				var renditionId = KalturaCache.getRenditionIdFromMediaInfo(adFileInfo.mediaInfoIds[i]);
				var encodingId = KalturaCache.getEncodingId(encodingParamsArr[KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [renditionId])]);				 
				stitchAdForEncodingId(cuePoint.id, renditionId, encodingId, adFileId, adFileInfo);					
			}
		}				
	}, function(err){
		response.error('Failed to stitch ad ' + err);
	});		
	
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
 * Parse VAST and download ad files
 * @param request
 * @param cuePoint
 * @param cachedUrl
 * @param entry
 * @param metadata
 * @param playerConfig
 * @param mediaInfos
 * @param encodingParamsArr
 * @param sessionId
 * @param uiConfConfig
 * @param downloadCallback
 * @param errorCallback
 * @returns
 */
KalturaAdIntegrationManager.prototype.getAdMediaFiles = function(request, response, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, encodingParamsArr, sessionId, uiConfConfig, sessionStartTime,  downloadCallback, errorCallback) {
	var This = this;	
	
	var headers = {
			'User-Agent': request.headers['user-agent']
	};
	
	if(uiConfConfig && uiConfConfig.overrideXForwardFor){
		headers['x-forwarded-for'] = request.headers['x-forwarded-for'];
	}
	
	var adFilesInfo = {};
	
	var doGetAdMediaFiles = function(evaluatedUrl){
		
		response.log('Url after tokens mapping [' + evaluatedUrl + ']');
		
		var vastRequestTimeOut = uiConfConfig && uiConfConfig.timeOut ? uiConfConfig.timeOut : KalturaConfig.config.adIntegration.vastRequestTimeOut;
		
		KalturaVastParser.parse(evaluatedUrl, headers, vastRequestTimeOut*1000, KalturaLogger, function(adServerResponse) {
			if (!adServerResponse) {
				var msg = 'Failed to get Ad server response [' + cuePoint.sourceUrl + '] cue-point [' + cuePoint.id + '] session [' + sessionId + '] partner [' + cuePoint.partnerId + '] entry [' + cuePoint.entryId + ']';
				response.error(msg);
				return errorCallback();
			}
			
			response.log('Vast response for [' + cuePoint.sourceUrl + '] cue-point [' + cuePoint.id + '] session [' + sessionId + '] partner [' + cuePoint.partnerId + '] entry [' + cuePoint.entryId + '] headers [' + JSON.stringify(headers) + ']: ' + JSON.stringify(adServerResponse));
			
			
			var trackingInfo = {};
			var trackingId = KalturaCache.getKey(KalturaCache.TRACKING_KEY_PREFIX, [cuePoint.id, sessionId]);
			
			var ads = selectAdsByDuration(adServerResponse, cuePoint.duration/1000);
			if(ads.length > 0 ){
				for (var adIdx = 0, adLen = ads.length; adIdx < adLen; adIdx++) {
					processSelectedAd(ads[adIdx], trackingInfo);
				}
				KalturaCache.set(trackingId, trackingInfo, KalturaConfig.config.cache.sessionCuePoint);

			}
		});	
	};
	
	/**
	 * 1. Set tracking info for the ad
	 * 2. Download most suitable ad file
	 * 3. Set ad id in cache for the current session
	 */
	var processSelectedAd = function(ad, trackingInfo){
		var trackingInfoItem = {};
		if(ad.ad != null && ad.creative != null){
			trackingInfoItem = ad.creative.trackingEvents;
			trackingInfoItem.impression = ad.ad.impressionURLTemplates;
			trackingInfoItem.error = ad.ad.errorURLTemplates;	
			trackingInfoItem.duration = ad.creative.duration*90000; //save in ts units
			trackingInfoItem.seq = ad.ad.sequence;
			trackingInfo[ad.ad.sequence] = trackingInfoItem;
			response.log('Added ' +  trackingInfoItem.impression.length + ' impression beacons for ad sequence [' + trackingInfoItem.seq + '] cue-point [' + cuePoint.id + '] session [' + sessionId + ']');
		}
		This.selectMediaFilePerAspectRatio(response, ad, mediaInfos, function(adPerAspectRatio){
			for(var adFileId in adPerAspectRatio){
				var adFileInfo = adPerAspectRatio[adFileId];
				adFileInfo.sequence = ad.ad.sequence;
				adFileInfo.duration = ad.creative.duration*90000;
				adFileInfo.sharedFilePath = KalturaUtils.buildFilePath('ad_download', adFileId);
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
			setSessionServerAdIdsInCache(ad.ad.sequence);
		}, errorCallback);			
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
	
	/**
	 * select optimal number of ads to fill the cue point duration
	 * Ad pod will get priority over single ad
	 */
	var selectAdsByDuration = function(adServerResponse, duration){
		var adPod = [];
		var adPodDuration = 0;
		var selectedAdPod = [];
		var selectedLowerDurCreative = null;
		var selectedLowerDurAd = null;
		var selectedHigherDurCreative = null;
		var selectedHigherDurAd = null;
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
							if(selectedLowerDurCreative == null ||
								selectedLowerDurCreative.duration < creative.duration){
								selectedLowerDurCreative = creative;
								selectedLowerDurAd = ad;
							}								
						}
						else{
							if(selectedHigherDurCreative == null ||
								selectedHigherDurCreative.duration > creative.duration){
								selectedHigherDurCreative = creative;
								selectedHigherDurAd = ad;
							}
						}
					}
				}
			}
		}
		
		var selectedCreative = selectedLowerDurCreative ? selectedLowerDurCreative : selectedHigherDurCreative;
		var selectedAd = selectedLowerDurAd ? selectedLowerDurAd : selectedHigherDurAd;
		
		adPod.sort(function(ad1, ad2) {return ad1.ad.sequence - ad2.ad.sequence;});
		for(var adIdx = 0, adLen = adPod.length; adIdx < adLen; adIdx++){
			adPodDuration+= adPod[adIdx].creative.duration;
			selectedAdPod.push(adPod[adIdx]);

			if(adPodDuration >=  duration){
				break;
			}	
		}
		
		if(selectedAdPod.length > 0){
			response.log('Selected Creatives ' + selectedAdPod.length + ' of total duration [' + adPodDuration + '] for partner [' + cuePoint.partnerId +'] entry [' + cuePoint.entryId + '] cue-point [' + cuePoint.id + '] session [' + sessionId +']');
			return selectedAdPod;
		}				
		else{
			response.log('No Ad Pod selected');
			if(selectedCreative){
				response.log('Selected Creatives 1 of total duration [' + selectedCreative.duration + '] for partner [' + cuePoint.partnerId +'] entry [' + cuePoint.entryId + '] cue-point [' + cuePoint.id + '] session [' + sessionId +']');
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
	
	/**
	 * Sets the ads sequence in cache for the current session
	 */
	var setSessionServerAdIdsInCache = function (sequence) {

		response.log('Setting session server ad ids in cache for cue-point [' + cuePoint.id + ']');
		var serverAdIdValues = {};
		
		for(var adFileId in adFilesInfo){
			var adFileInfo = adFilesInfo[adFileId];
			for(var i = 0; i < adFileInfo.mediaInfoIds.length; i++){
				var renditionId = KalturaCache.getRenditionIdFromMediaInfo(adFileInfo.mediaInfoIds[i]); 
				var encodingId = KalturaCache.getEncodingId(encodingParamsArr[KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [renditionId])]);
				var sessionServerAdIdKey = KalturaCache.getKey(KalturaCache.SERVER_AD_ID_KEY_PREFIX, [cuePoint.id, renditionId, sessionId]);
				var serverAdIds = serverAdIdValues[sessionServerAdIdKey];
				serverAdIds = KalturaCache.buildSessionServerAdIdValue({id: adFileId + '-' + encodingId, duration: adFileInfo.duration}, sequence);
				serverAdIdValues[sessionServerAdIdKey] = serverAdIds;				
			}
		}
		
		var doSetServerAdId = function (sessionServerAdIdKey){
			response.log('Setting Session Server Ad ids for key [' + sessionServerAdIdKey + '] values [' + JSON.stringify(serverAdIdValues[sessionServerAdIdKey]) + ']');
			KalturaCache.add(sessionServerAdIdKey, serverAdIdValues[sessionServerAdIdKey], KalturaConfig.config.cache.sessionCuePoint, function(){
				response.log('Added');
			}, function (err) {
				response.debug('Session Server Ad ids for key  [' + sessionServerAdIdKey + '] already exists, appending value');
				KalturaCache.append(sessionServerAdIdKey, serverAdIdValues[sessionServerAdIdKey]);
			});			
		};
		
		for(var sessionServerAdIdKey in serverAdIdValues){
			doSetServerAdId(sessionServerAdIdKey);
		}				
	};
	
	if(!cuePoint){
		response.log('Cue point is missing');
		return errorCallback();
	}
	
	response.log('Parsing ads from [' + cuePoint.sourceUrl + '] cue-point [' + cuePoint.id + '] session [' + sessionId + '] partner [' + cuePoint.partnerId + '] entry [' + cuePoint.entryId + '] headers [' + JSON.stringify(headers) + ']');
	
	KalturaCache.set(
		KalturaCache.getKey(KalturaCache.HEADERS_PREFIX, [sessionId]),
		headers,
		KalturaConfig.config.cache.sessionHeaders,
		function(){
			KalturaLogger.log('Successfully set headers [' + util.inspect(headers) +  '] for sessionId ' + sessionId + ' from getAdMediaFiles');
		},
		function(){
			KalturaLogger.error('Failed to set headers for sessionId '+ sessionId + ' from getAdMediaFiles')
		}
	);

	var mapURLandGetMediaFiles = function() {
        	if (cachedUrl == null) {
            		KalturaUrlTokenMapper.mapFixedTokens(request, cuePoint, entry, metadata, playerConfig, function (cachedUrl) {
                		evaluatedUrl = KalturaUrlTokenMapper.mapDynamicTokens(request, cachedUrl, playerConfig);
                		doGetAdMediaFiles(evaluatedUrl);
            		});
        	}
        	else {
            		evaluatedUrl = KalturaUrlTokenMapper.mapDynamicTokens(request, cachedUrl, playerConfig);
            		doGetAdMediaFiles(evaluatedUrl);
        	}
    	};


	var isNewSession = true;
	if (sessionStartTime && (sessionStartTime < (Math.floor(Date.now() / 1000) - 1800)))
        	isNewSession = false;

	if (isNewSession) {
        	mapURLandGetMediaFiles();
	}
	else {
		var segmentFetchedKey =  KalturaCache.getKey(KalturaCache.SEGMENT_FETCHED_PREFIX, [sessionId]);
		KalturaCache.get(segmentFetchedKey,
			function(value) {
				if (value) {
                    			mapURLandGetMediaFiles();
                		} else {
                    			response.error('Session [' + sessionId + '] with sessionStartTime [' + sessionStartTime + '] did not request segments recently. Ignoring Vast request');
                		}	
            		},
			function(error) {
				response.error('Session [' + sessionId + '] with sessionStartTime [' + sessionStartTime + '] did not request segments recently. Ignoring Vast request');
            		}
		);
    	}
};

/**
 * Select best ad media files for transcoding for each flavor
 * @param ad
 * @param mediaInfos
 * @param callback
 * @returns
 */
KalturaAdIntegrationManager.prototype.selectMediaFilePerAspectRatio = function(response, ad, mediaInfos, callback, errorCallback) {	
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
			var relevantAdMediaFiles = [];
			for(var i=0; i<adMediaFiles.length;i++){
				//skip media files with apiFramework=VPAID
				if(adMediaFiles[i].apiFramework == 'VPAID'){
					response.debug('Skipping VPAID apiFramework');
					continue;
				}
				if(adMediaFiles[i].deliveryType == 'streaming'){
                                        response.debug('Skipping streaming deliveryType');
                                        continue;
                                }

				var aspectRatio = kalturaAspectRatio.convertFrameSize(adMediaFiles[i].width, adMediaFiles[i].height);
				aspectRatioKeys.push(aspectRatio);
				relevantAdMediaFiles.push(adMediaFiles[i]);
			}
			
			var mediaInfoWidth = mediaInfo.video ? mediaInfo.video.width : 0;
			var mediaInfoHeight = mediaInfo.video ? mediaInfo.video.height : 0;
			var bestAspectRatio = kalturaAspectRatio.convertFrameSizeForAspectRatioKeys(mediaInfoWidth, mediaInfoHeight, aspectRatioKeys);
			
			for(i=0; i<aspectRatioKeys.length; i++){
				if(aspectRatioKeys[i] == bestAspectRatio){
					bestAdFiles.push(relevantAdMediaFiles[i]);
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
	
	/**
	 * Ad file id can be generated using two different algorithms.
	 * Once the algorithm is configured on the server it shouldn't be changed
	 * 
	 * Default system behavior should be from media
	 */
	var getAdFileId = function(fileUrl, callback, errorCallback){
		
		/**
		 * File id is calculated by applying md5 on the first bytes of the ad file
		 */
		var getAdFileIdFromMedia = function(fileUrl, callback, errorCallback){
			var bytes = 10000;
			if(parseInt(KalturaConfig.config.adIntegration.adFileIdLimitBytes)){
				bytes = parseInt(KalturaConfig.config.adIntegration.adFileIdLimitBytes);
			}
			KalturaUtils.md5OnFile(fileUrl, null, bytes, function(adFileId){
				response.log('File URL [' + fileUrl + '] md5 ['+ adFileId +'] calculated from media bytes [' + bytes + ']');
				callback(adFileId);
			}, errorCallback);			
		};
		
		var getAdFileIdFromUrl = function(fileUrl, callback, errorCallback){
			requestPckg.head(fileUrl, function (err, res, body) {
				var redirectURL = fileUrl;
				if(res){
					response.log('Redirect media file URL: [' +  res.request.uri.href + '] ');
					redirectURL = res.request.uri.href;
				}
				var adFileId = null;
				var md5OnLog = null;
				if(parseInt(KalturaConfig.config.adIntegration.calcMd5OnRedirect)){
					adFileId = redirectURL.md5();
					md5OnLog = 'redirect';
				}
				else{
					adFileId = fileUrl.md5();
					md5OnLog = 'original';
				}
					
				response.log('File URL [' + fileUrl + '] redirect url [' + redirectURL+ '] md5 ['+adFileId+'] calculated from '+ md5OnLog);
				callback(adFileId);
			});					
		};
		
		if(KalturaConfig.config.adIntegration.adFileIdCalcMethod == 'URL'){
			getAdFileIdFromUrl(fileUrl.trim(), callback, errorCallback);
		}
		else{
			getAdFileIdFromMedia(fileUrl.trim(), callback, errorCallback);
		}
	};
	
	var setAdFileInfo = function(mediaFile, aspectRatioGroup, callback){
		if (!mediaFile){
			aspectRatioGroupsToHandle--;
			if(aspectRatioGroupsToHandle == 0)
				callback(adPerAspectRatio);
			return;
		}
		
		getAdFileId(mediaFile.fileURL, function(adFileId){
			response.log('Calculated adFileId: ' + adFileId);
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
		}, function(err){
			response.error('Failed to get adFileId: ' + err);
			if(errorCallback){
				errorCallback();
			}			
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

	params = this.parsePlayServerParams(response, params, ['trackingId', 'adSequence', 'totalDuration', 'outputStart', 'outputEnd', 'adStart', 'sessionId']);
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

	var sendBeaconRequest = function(options, url, eventType, seq)
	{
		var responseEnded = false;
		var httpModule = KalturaUtils.getHttpModuleByProtocol(null, url);
		var request = httpModule.get(options, function(res){
			responseEnded = true;

			var msgobj = new Object();
			msgobj.params = JSON.stringify(params);
			msgobj.eventType = eventType;
			msgobj.statusCode = res.statusCode;
			msgobj.url = url;
			if(options.headers)
				msgobj.headers = options.headers;
			if(res.statusCode == 408){
				response.log('Failed to send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] seq [' + seq + '], timeout');
				msgobj.status = 'Failed';
			}
			else{
				response.log('beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] seq [' + seq + '] sent with status: [' + res.statusCode + ']');
				msgobj.status = 'success';
			}
			udpsender.sendFunction(JSON.stringify(msgobj),response);
			res.on('data', function() { /* do nothing */ });
		});
		request.setTimeout( KalturaConfig.config.cloud.requestTimeout * 1000, function( ) {});
		request.on('error', function(e){
			if(!responseEnded){
				response.log('Failed to send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] seq [' + seq + '], ' + e.message);
			}
			else{
				response.log('beacon was sent, ignoring the error [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] seq [' + seq + ']');
			}
		});
		request.on('socket', function(e) {
			response.log('Socket send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] seq [' + seq + ']');
		});
	}

	var sendBeaconForType = function(events, eventType, seq){
		var httpGet = function(url, eventType, seq){
			if(!url){
				response.log('Failed to send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '], empty url');
				return;
			}
			var parsedUrl = urlPkg.parse(url);
			var options =
			{
				hostname: parsedUrl.hostname,
				path: parsedUrl.path
			}

			KalturaCache.get(KalturaCache.getKey(KalturaCache.HEADERS_PREFIX, [params.sessionId]),
				function (value) {
					var headers = value;
					if (headers)
					{
						KalturaCache.touch(KalturaCache.getKey(KalturaCache.HEADERS_PREFIX, [params.sessionId]), KalturaConfig.config.cache.sessionHeaders);
						KalturaLogger.log('Sending beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] session id [' + params.sessionId + '] with headers [' + util.inspect(headers) + ']');
						options.headers = headers;
					}
					else
						KalturaLogger.log('Sending beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] session id [' + params.sessionId + '] with no headers');
					sendBeaconRequest(options, url, eventType, seq);
				},
				function (error)
				{
					response.log('Failed to get value for headers in send beacon - sending beacon with no headers error was : '+ error);
					sendBeaconRequest(options, url, eventType, seq);
				}
			)

		};

		for(var i=0; i < events.length; i++){
			httpGet(events[i].trim(), eventType, seq);
		}				
	};
	
	var checkBeaconProgress = function(progressStartPercent, progressEndPercent, beaconPercent, eventType, trackingInfo){
		var seq = 0;
		if (trackingInfo.seq) 
			seq = trackingInfo.seq;
		if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent >= beaconPercent){
			response.debug('sending beacons of type: [' + eventType + ']');
			sendBeaconForType(trackingInfo[eventType], eventType, seq);
			delete trackingInfo[eventType];
		}		
		
		else if(trackingInfo.hasOwnProperty(eventType) && beaconPercent == 100 && progressStartPercent >= 75 && progressEndPercent >= beaconPercent){
			response.debug('sending beacons of type: [' + eventType + '] ');
			sendBeaconForType(trackingInfo[eventType], eventType, seq);
			delete trackingInfo[eventType];
		}		
	};
	
	var checkComplete = function(progressStartPercent, progressEndPercent, trackingInfo){		
		var seq = 0;
                if (trackingInfo.seq)
                        seq = trackingInfo.seq;
 
		if(trackingInfo.hasOwnProperty('complete') && progressStartPercent >= 75 && progressEndPercent >= 100){
			response.debug('sending beacons of type: complete');
			sendBeaconForType(trackingInfo['complete'], 'complete', seq);
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

				KalturaCache.set(params.trackingId, trackingInfos, KalturaConfig.config.cache.sessionCuePoint);
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
