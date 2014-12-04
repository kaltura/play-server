var requestPckg = require('request');

require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');
require('../utils/KalturaUrlTokenMapper');
require('./vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');
var kalturaAspectRatio = require('../media/KalturaAspectRatio');

KalturaAdIntegrationHandler = {
		
	getAdMediaFiles : function(request, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, downloadCallback, errorCallback) {
		
		var headers = {
				'User-Agent': request.headers['user-agent'],
				'x-forwarded-for': request.ip
		};

		var doGetAdMediaFiles = function(evaluatedUrl){
			
			KalturaLogger.log('Url after tokens mapping [' + evaluatedUrl + ']');
			
			var vastRequestTimeOut = uiConfConfig.timeOut;
			if(!vastRequestTimeOut){
				vastRequestTimeOut = KalturaConfig.config.ad.vastRequestTimeOut;
			}
			
			//TODO pass timeout to the parse request
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
			KalturaAdIntegrationHandler.selectMediaFilePerAspectRatio(ad, mediaInfos, function(adPerAspectRatio){
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
			var coefficient = KalturaConfig.config.ad.durationCoefficient;
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
	},

	selectMediaFilePerAspectRatio : function(ad, mediaInfos, callback) {
		
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
		
		var adPerAspectRatio = {};
		var aspectRatioGroupsToHandle = 0;
		
		if(ad.creative == null)
			return callback(adPerAspectRatio);
		
		var originalAssetsAspectRatioGroups = getAspectRatioGroups();
				
		for(aspectRatioGroup in originalAssetsAspectRatioGroups){
			var bestOriginalAsset = getBestMediaInfo(originalAssetsAspectRatioGroups[aspectRatioGroup]);

			mediaFile = findBestAdFile(ad.creative.mediaFiles, bestOriginalAsset);
			
			setAdFileInfo(mediaFile, aspectRatioGroup, callback);
		}
	}
};

module.exports = KalturaAdIntegrationHandler;