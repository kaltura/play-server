var http = require('follow-redirects').http;
var url = require('url');
var fs = require('fs');
var requestPckg = require('request');

require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');
require('../utils/KalturaUrlTokenMapper');
require('./vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');
var kalturaAspectRatio = require('../media/KalturaAspectRatio');

var DOWNLOAD_RETRY_INTERVAL = 2;

KalturaAdIntegrationHandler = {
		
	getAdMediaFiles : function(request, cuePoint, cachedUrl, entry, metadata, playerConfig, mediaInfos, sessionId, uiConfConfig, downloadCallback, errorCallback) {
		
		var headers = {
				'x-forwarded-for': request.ip
		};

		var doGetAdMediaFiles = function(evaluatedUrl){
			
			KalturaLogger.log('Url after tokens mapping [' + evaluatedUrl + ']');
			
			var vastRequestTimeOut = uiConfConfig.timeOut;
			if(!vastRequestTimeOut)
				vastRequestTimeOut = KalturaConfig.config.ad.vastRequestTimeOut;
			
			//TODO pass timeout to the parse request
			KalturaVastParser.parse(evaluatedUrl, headers, function(adServerResponse) {
				if (!adServerResponse) {
					var msg = 'Failed to get Ad server response';
					KalturaLogger.error(msg);
					return errorCallback();
				}

				var ad = selectCreativeByDuration(adServerResponse, cuePoint.duration/1000);
				
				var trackingInfo = {}; 
				var trackingId = KalturaCache.getAdTrackingId(cuePoint.id, sessionId);
				if(ad.ad != null && ad.creative != null){
					
					trackingInfo = ad.creative.trackingEvents;
					trackingInfo.impression = ad.ad.impressionURLTemplates;
					trackingInfo.error = ad.ad.errorURLTemplates;	
					trackingInfo.duration = ad.creative.duration;
					KalturaCache.set(trackingId, trackingInfo, KalturaConfig.config.cache.cuePoint);
				}
				
				KalturaAdIntegrationHandler.selectMediaFilePerAspectRatio(ad, mediaInfos, function(adPerAspectRatio){
					for(var adFileId in adPerAspectRatio){
						var adFileInfo = adPerAspectRatio[adFileId];
						var sharedFilePath = KalturaConfig.config.cloud.sharedTempPath + '/' + KalturaUtils.getUniqueId();
						adFileInfo.sharedFilePath = sharedFilePath;
						
						var options = {
							headers : headers,
							localPath : adFileInfo.sharedFilePath};

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
			});	
		};
		
		var selectCreativeByDuration = function(adServerResponse, duration){
			var selectedCreative = null;
			var selectedAd = null;
			// find best matching creative according to cue point duration
			for (var adIdx = 0, adLen = adServerResponse.ads.length; adIdx < adLen; adIdx++) {
				var ad = adServerResponse.ads[adIdx];
				for (var creaIdx = 0, creaLen = ad.creatives.length; creaIdx < creaLen; creaIdx++) {
					var creative = ad.creatives[creaIdx];
					if (creative.type == "linear") {
						if(creative.duration <= duration){
							if(selectedCreative == null){
								selectedCreative = creative;
								selectedAd = ad;
							}								
							else if(selectedCreative.duration < creative.duration){
								selectedCreative = creative;
								selectedAd = ad;
							}								
						}						
					}
				}
			}
			if(selectedCreative)
				KalturaLogger.log('Selected Creative with duration ' + selectedCreative.duration);
			else
				KalturaLogger.log('No creative selected');
			
			return {ad:selectedAd, creative: selectedCreative};
		};
		
		var downloadHttpUrl = function(adFileId, adFileInfo, options, successCallback, errorCallback) {
			getAdFilePathFromCache(adFileId, adFileInfo, successCallback, function(err){
				var adFileHandledKey = KalturaCache.getAdFileHandled(adFileId);
				KalturaCache.add(adFileHandledKey, true, KalturaConfig.config.cache.adFileDownloadTimeout, function(){
					KalturaLogger.log('Selected ad: url [' + adFileInfo.fileURL + '], downloading to [' + options.localPath + ']');
					parsedUrl = url.parse(adFileInfo.fileURL);
					options.hostname = parsedUrl.hostname;
					options.port = parsedUrl.port;
					options.path = parsedUrl.path;
					options.method = 'GET';
					
					var localFile = fs.createWriteStream(options.localPath);
					var request = http.request(options, function(httpResponse) {
						httpResponse.pipe(localFile);

						localFile.on('finish', function() {
							localFile.close();
							var adFilePathKey = KalturaCache.getAdFilePath(adFileId);
							KalturaCache.set(adFilePathKey, options.localPath, KalturaConfig.config.cache.cuePoint);
							successCallback(adFileId, adFileInfo);
						});
						
						httpResponse.on('data', function() { /* do nothing */ });
					});

					request.on('error', function(e) {
						errorCallback(e.message);
					});

					request.end();						
				}, function (err){
					KalturaLogger.log('Selected ad: url [' + adFileInfo.fileURL + '] already downloading');
					// retry get from cache
					var retries = KalturaConfig.config.cache.adFileDownloadTimeout / DOWNLOAD_RETRY_INTERVAL;
					watchAdFilePathInCache(adFileId, adFileInfo, retries, successCallback, errorCallback);
				});
			
			});
		};
		
		var watchAdFilePathInCache = function(adFileId, adFileInfo, retries, successCallback, errorCallback){
			KalturaLogger.log('Watching download ad: [' + adFileId + '] retries left' + '[' + retries + ']');
			setTimeout(function(){
				getAdFilePathFromCache(adFileId, adFileInfo, successCallback, function(err){
					retries --;
					if(retries == 0)
						return errorCallback('download timeout');

					watchAdFilePathInCache(adFileId, adFileInfo, retries, successCallback, errorCallback);
				});
			}, DOWNLOAD_RETRY_INTERVAL * 1000);			
		};
		
		var getAdFilePathFromCache = function(adFileId, adFileInfo, successCallback, errorCallback){
			var adFilePathKey = KalturaCache.getAdFilePath(adFileId);
			KalturaCache.get(adFilePathKey, function(adFilePath){
				if(adFilePath){
					KalturaLogger.log('Selected ad: url [' + adFileInfo.fileURL + '], already downloaded to [' + adFilePath + ']');
					adFileInfo.sharedFilePath = adFilePath;
					KalturaCache.touch(adFilePathKey, KalturaConfig.config.cache.cuePoint);
					successCallback(adFileId, adFileInfo);									
				}
				else
					errorCallback('file path not found in cache');
			}, function(err){
				errorCallback(err);
			});
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
					var mediaInfoBitrate = currentMediaInfo.video.bitrate / 1024;
					var compare = kalturaMediaInfo.compare(mediaInfoBitrate, bestMediaInfo.video.width, bestMediaInfo.video.height, currentMediaInfo.video.bitrate, currentMediaInfo.video.width, currentMediaInfo.video.height);
					if (compare < 0){
						selectedMediaInfo = currentMediaInfo;
					}
				}
			}
			selectedMediaInfo.video.bitrate = selectedMediaInfo.video.bitrate / 1024;
			KalturaLogger.log('Best media info: bitrate [' + selectedMediaInfo.video.bitrate + '], width [' + selectedMediaInfo.video.width + '], height [' + selectedMediaInfo.video.height + ']');
			
			return selectedMediaInfo;
		};
		
		//TODO check limits
		var findBestAdFile = function(adMediaFiles, mediaInfo) {
			
			var shouldReplaceCandidate =  function(original, current, candidate){				
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
				
				currentAbsValue = Math.abs(widthDiff[0]) + Math.abs(heightDiff[0]) + Math.abs(bitrateDiff[0]);
				candidateAbsValue = Math.abs(widthDiff[1]) + Math.abs(heightDiff[1]) + Math.abs(bitrateDiff[1]);
				
				currentValue = widthDiff[0] + heightDiff[0] + bitrateDiff[0];
				candidateValue = widthDiff[1] + heightDiff[1] + bitrateDiff[1];
				
				if(((currentValue > 0 && candidateValue > 0) || (currentValue < 0 && candidateValue < 0) ) && currentAbsValue < candidateAbsValue){
					return true;
				}
				if(currentValue > 0 && candidateValue < 0)
					return true;
				
				return false;
			};
			
			var selectAdFilesWithBestAspectRatio = function(){
				var aspectRatioKeys = [];
				var bestAdFiles = [];
				for(var i=0; i<adMediaFiles.length;i++){
					//TODO skip media files with apiFramework=VPAID
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
		
		if(ad.creative == null) //TODO: if no duration found less or equals cue point duration return black
			return callback(adPerAspectRatio);
		
		var originalAssetsAspectRatioGroups = getAspectRatioGroups();
				
		for(aspectRatioGroup in originalAssetsAspectRatioGroups){
			var bestOriginalAsset = getBestMediaInfo(originalAssetsAspectRatioGroups[aspectRatioGroup]);

			mediaFile = findBestAdFile(ad.creative.mediaFiles, bestOriginalAsset);
			
			setAdFileInfo(mediaFile, aspectRatioGroup, callback);
		}
	}, 
	
	sendBeacon: function(trackingId, segmentIndex, outputStart, outputEnd){
		
		var sendBeaconForType = function(events, timer){
			var sleep = function() {
			    setTimeout(function(){ sendBeaconForType(events); }, timer*1000);
			};	
			
			var httpGet = function(url){
				http.get(url, function(res){
					KalturaLogger.log('beacon [' + url + '] sent with status: [' + res.statusCode + ']');
					res.on('data', function() { /* do nothing */ });
				}).on('error', function(e){
					KalturaLogger.error('Failed to send beacon [' + url + '], ' + e.message);
				});							
			};
			
			if(timer > 0)
				sleep();
			else{
				for(var i=0; i < events.length; i++){
					httpGet(events[i].trim());
				}				
			}
		};
		
		KalturaLogger.log('start sendBeacon for trackingId: [' + trackingId + '] segmentIndex: [' + segmentIndex + '] outputStart: [' + outputStart + '] outputEnd: [' + outputEnd + ']');
		var checkBeaconProgress = function(progressStartPercent, progressEndPercent, beaconPercent, eventType, trackingInfo){
			var timer = 0;
			if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent >= beaconPercent && progressStartPercent < beaconPercent + 25){
				KalturaLogger.log('sending beacons of type: [' + eventType + ']');
				sendBeaconForType(trackingInfo[eventType]);
				delete trackingInfo[eventType];
			}		
			
			else if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent < beaconPercent && progressEndPercent >= beaconPercent){
				timer = (beaconPercent - progressStartPercent)*trackingInfo.duration / 100;
				KalturaLogger.log('sending beacons of type: [' + eventType + '] with timer: [' + timer + ']');
				sendBeaconForType(trackingInfo[eventType], timer);
				delete trackingInfo[eventType];
			}		
		};
		
		if(segmentIndex == 0)
			return;
		
		KalturaCache.get(trackingId, function(trackingInfo){
			if(trackingInfo){
				KalturaLogger.log('Tracking info found in cache for tracking id: [' + trackingId + ']');	
				var progressStartPercent = outputStart / 90000 / trackingInfo.duration * 100;
				var progressEndPercent = outputEnd/ 90000 / trackingInfo.duration * 100;
				
				KalturaLogger.log('segmentIndex: [' + segmentIndex + '] progressStartPercent: [' + progressStartPercent + '] progressEndPercent: [' + progressEndPercent + ']');
				
				if(segmentIndex == 1){ //TODO verify if need to delay
					if('impression' in trackingInfo){
						sendBeaconForType(trackingInfo.impression);
						delete trackingInfo.impression;						
					}
					if('start' in trackingInfo){
						sendBeaconForType(trackingInfo.start);						
						delete trackingInfo.start;						
					}					
				}	
				
				if(outputEnd == 0){
					if('complete' in trackingInfo){
						sendBeaconForType(trackingInfo.complete);						
						delete trackingInfo.complete;						
					}					
				}
				else{
					checkBeaconProgress(progressStartPercent, progressEndPercent, 25, 'firstQuartile', trackingInfo);
					checkBeaconProgress(progressStartPercent, progressEndPercent, 50, 'midpoint', trackingInfo);
					checkBeaconProgress(progressStartPercent, progressEndPercent, 75, 'thirdQuartile', trackingInfo);
					checkBeaconProgress(progressStartPercent, progressEndPercent, 100, 'complete', trackingInfo);					
				}

				KalturaCache.set(trackingId, trackingInfo, KalturaConfig.config.cache.cuePoint);
			}
			else{
				KalturaLogger.log('Tracking info not found in cache for tracking id: [' + trackingId + ']');
			}
		}, function (err) {
			KalturaLogger.log('Tracking info not found in cache for tracking id: [' + trackingId + ']: ' + err);
			
		});
	}
};

module.exports = KalturaAdIntegrationHandler;