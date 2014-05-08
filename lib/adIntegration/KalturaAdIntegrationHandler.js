var http = require('follow-redirects').http;
var url = require('url');
var fs = require('fs');

require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');
require('../utils/KalturaUrlTokenMapper');
require('./vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');
var kalturaAspectRatio = require('../media/KalturaAspectRatio');

KalturaAdIntegrationHandler = {

	getAdMediaFiles : function(cuePoint, entry, entryMetadata, playerConfig, headers, mediaInfos, downloadCallback, successCallback, errorCallback) {
		
		KalturaLogger.log('Parsing ads from [' + cuePoint.sourceUrl + ']');

		var evaluatedUrl = KalturaUrlTokenMapper.mapTokens(cuePoint.sourceUrl, entry, entryMetadata, playerConfig);
		var filesCount = 0;
		
		KalturaLogger.log('Url after tokens mapping [' + evaluatedUrl + ']');
		
		var downloadHttpUrl = function(urlStr, options, successCallback, errorCallback) {
			parsedUrl = url.parse(urlStr);
			options.hostname = parsedUrl.hostname;
			options.port = parsedUrl.port;
			options.path = parsedUrl.path;
			options.method = 'GET';

			var localFile = fs.createWriteStream(options.localPath);
			var request = http.request(options, function(response) {
				response.pipe(localFile);

				localFile.on('finish', function() {
					localFile.close();
					successCallback(options.sharedFilePath);
				});
			});

			request.on('error', function(e) {
				errorCallback(e.message);
			});

			request.end();
		};
		
		KalturaVastParser.parse(evaluatedUrl, headers, function(response) {
			if (!response) {
				var msg = 'Failed to get Ad server response';
				KalturaLogger.error(msg);
				return errorCallback();
			}

			var adPerAspectRatio = KalturaAdIntegrationHandler.selectAdAndMediaFilePerAspectRatio(response, cuePoint.duration, mediaInfos);
			filesCount = Object.keys(adPerAspectRatio).length;
			for(var adId in adPerAspectRatio){
				var adInfo = adPerAspectRatio[adId];
				var sharedFilePath = KalturaConfig.config.cloud.sharedTempPath + '/' + KalturaUtils.getUniqueId();
				adInfo.sharedFilePath = sharedFilePath;
				
				KalturaLogger.log('Selected ad: url [' + adInfo.fileURL + '], downloading to [' + adInfo.sharedFilePath + ']');
				
				var options = {
					headers : headers,
					localPath : adInfo.sharedFilePath};

				downloadHttpUrl(adInfo.fileURL, options, function(localPath) {
					downloadCallback(adId, adInfo);
					filesCount--;
					if(filesCount == 0)
						successCallback();
				}, function(err) {
					var msg = 'Download HTTP URL error: ' + err;
					KalturaLogger.error(msg);
					errorCallback();
				});
			}	
		});
	},

	selectAdAndMediaFilePerAspectRatio : function(response, duration, mediaInfos) {
		
		var selectCreativeByDuration = function(){
			var selectedCreative = null;
			var selectedAd = null;
			// find best matching creative according to cue point duration
			for (var adIdx = 0, adLen = response.ads.length; adIdx < adLen; adIdx++) {
				var ad = response.ads[adIdx];
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
			KalturaLogger.log('Selected Creative with duration ' + selectedCreative.duration);
			
			return {ad:selectedAd, creative: selectedCreative};
		};

		var getAspectRatioGroups = function(){
			var aspectRatioGroups = {};
			for(var encodingId in mediaInfos){
				var group = kalturaAspectRatio.convertFrameSize(mediaInfos[encodingId].video.width, mediaInfos[encodingId].video.height);
				if(!(group in aspectRatioGroups))
					aspectRatioGroups[group] = [];
				aspectRatioGroups[group].push(encodingId);
			}
			return aspectRatioGroups;
		};
		
		var getBestMediaInfo = function(groupEncodingIds){
			var selectedMediaInfo = null;
			
			// get highest media info object
			for (var i=0; i<groupEncodingIds.length; i++) {
				var encodingId = groupEncodingIds[i];
				var currentMediaInfo = mediaInfos[encodingId];
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
		
		var adPerAspectRatio = {};
		var ad = selectCreativeByDuration();
		
		if(ad.creative == null) //TODO: if no duration found less or equals cue point duration return black
			return adPerAspectRatio;
		
		var originalAssetsAspectRatioGroups = getAspectRatioGroups();
				
		for(aspectRatioGroup in originalAssetsAspectRatioGroups){
			var bestOriginalAsset = getBestMediaInfo(originalAssetsAspectRatioGroups[aspectRatioGroup]);

			mediaFile = findBestAdFile(ad.creative.mediaFiles, bestOriginalAsset);
			if (mediaFile) {
				var adId = mediaFile.fileURL.trim().md5();
				if(adId in adPerAspectRatio){
					var encodingIds = originalAssetsAspectRatioGroups[aspectRatioGroup].concat(adPerAspectRatio[adId].encodingIds);
					adPerAspectRatio[adId].encodingIds = encodingIds;
					KalturaLogger.log('Added encoding ids to media file: [' + adPerAspectRatio[adId].fileURL + '] encoding ids [' + adPerAspectRatio[adId].encodingIds + ']');
				}
				else{
					var adInfo = {
							fileURL : mediaFile.fileURL.trim(),
							trackingEvents : ad.creative.trackingEvents,
							impression : ad.ad.impressionURLTemplates,
							error : ad.ad.errorURLTemplates,
							duration : ad.creative.duration,
							encodingIds: originalAssetsAspectRatioGroups[aspectRatioGroup]
						};
						adPerAspectRatio[adId] = adInfo;
						
						KalturaLogger.log('Selected media file: [' + adInfo.fileURL + '] for encoding ids [' + adInfo.encodingIds + ']');
				}								
			}		
		}
		
		return adPerAspectRatio;
	}
};

module.exports = KalturaAdIntegrationHandler;