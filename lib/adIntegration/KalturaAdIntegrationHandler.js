var http = require('follow-redirects').http;
var url = require('url');
var fs = require('fs');


require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');
require('./vast/KalturaVastParser');
var kalturaMediaInfo = require('../media/KalturaMediaInfo');

KalturaAdIntegrationHandler = {
	
	getAdMediaFiles: function(cuePoint, playerConfig, headers, mediaInfos, successCallback, errorCallback)
	{				
		var sharedFilePath = KalturaConfig.config.cloud.sharedTempPath + '/' + KalturaUtils.getUniqueId();
		
		KalturaLogger.log('Parsing ads from [' + cuePoint.sourceUrl +  ']');
		
		KalturaVastParser.parse(cuePoint.sourceUrl, playerConfig, headers, function(response)
		{
			if(!response)
			{
				var msg = 'Failed to get Ad server response';
				KalturaLogger.error(msg);
				return errorCallback();
			}
			
		    var adInfo = KalturaAdIntegrationHandler.selectAdAndMediaFile(response, cuePoint.duration, mediaInfos);	
		    adInfo.sharedFilePath = sharedFilePath;
		    
		    if(adInfo)
		    {
		    	KalturaLogger.log('Selected ad: url [' + adInfo.fileURL +  '], downloading to [' + adInfo.sharedFilePath + ']');
		    	var adId = adInfo.fileURL.md5();
		    	var options = {
		    		headers: headers,
		    		localPath: adInfo.sharedFilePath 
		    	};
		    	
		    	KalturaAdIntegrationHandler.downloadHttpUrl(adInfo.fileURL, options, function (localPath)
		    	{		    	
		    		return successCallback(adId, adInfo); 		 
				}, 
				function(err)
				{
					var msg = 'Download HTTP URL error: ' + err;
					KalturaLogger.error(msg);
					errorCallback();
				});
		    }
		    else
		    {
				var msg = 'Failed to extract ad info';
				KalturaLogger.error(msg);
		    	errorCallback();
		    }		    	
		});	
	},
	
	
	selectAdAndMediaFile: function(response, duration, mediaInfos)
	{
		var mediaFilesMap = new Object();
		var durationArr = [];
		var bestMediaInfo = null;
										
		//get highest media info object			
		for (var miIdx = 0; miIdx < mediaInfos.length; miIdx++)
		{
			var currentMediaInfo = mediaInfos[miIdx];				
			if(!bestMediaInfo)
				bestMediaInfo = currentMediaInfo;
			else
			{
				var mediaInfoBitrate = currentMediaInfo.video.bitrate / 1024;
				var compare = kalturaMediaInfo.compare(
						mediaInfoBitrate, bestMediaInfo.video.width, bestMediaInfo.video.height, 
						currentMediaInfo.video.bitrate, currentMediaInfo.video.width, currentMediaInfo.video.height);
				if(compare < 0)
					bestMediaInfo = currentMediaInfo;
			}
		}			
		bestMediaInfo.video.bitrate = bestMediaInfo.video.bitrate / 1024;
		KalturaLogger.log('Best media info: bitrate [' + bestMediaInfo.video.bitrate +  '], width [' + bestMediaInfo.video.width + '], height [' + bestMediaInfo.video.height + ']');

		//find best matching media files
		for (var adIdx = 0, adLen = response.ads.length; adIdx < adLen; adIdx++)
		{
			var adInfo = null;
			var mediaFile = null;
			var ad = response.ads[adIdx];
			for (var creaIdx = 0, creaLen = ad.creatives.length; creaIdx < creaLen; creaIdx++)
			{
			   	var creative = ad.creatives[creaIdx];
			    if (creative.type == "linear") 
			    {         	 
			       	mediaFile = KalturaAdIntegrationHandler.findBestMatch(creative.mediaFiles, bestMediaInfo);
			       	if(mediaFile)
			       	{
				        adInfo = {	fileURL: mediaFile.fileURL.trim(), 
				        			trackingEvents: creative.trackingEvents,
				               		impression: ad.impressionURLTemplates,
				               		error: ad.errorURLTemplates,
				               		duration: creative.duration};
				        mediaFilesMap[creative.duration] = adInfo;	
				        durationArr.push(creative.duration);
			       	}
			    }
			}
		}
				    
		//select best matching duration
		durationArr.sort(function(a,b){return a - b;});
		var selectedDuration = 0;
		for(var i = 0; i < durationArr.length; i++)
		{
			if(durationArr[i] > duration)
			{	        		
				if(selectedDuration == 0)
				selectedDuration = durationArr[i];
					break;
			}
			else
			{
				selectedDuration = durationArr[i];
			}
		}
		
		KalturaLogger.log('Selected Ad duration ' + selectedDuration);
		return mediaFilesMap[selectedDuration];			
	},

	findBestMatch: function(adMediaFiles, mediaInfo)
	{
		var mediaFileCandidate = null;

		for (var mfIdx = 0; mfIdx < adMediaFiles.length; mfIdx++)
	    {
			var currentMediaFile = adMediaFiles[mfIdx];

			if(!mediaFileCandidate)
				mediaFileCandidate = currentMediaFile;
			else
			{
				var compareCurrentToMi = kalturaMediaInfo.compare(
						mediaInfo.video.bitrate, mediaInfo.video.width, mediaInfo.video.height, 
						currentMediaFile.bitrate, currentMediaFile.width, currentMediaFile.height);
				var compareCurrentToCandidate = kalturaMediaInfo.compare(
						mediaFileCandidate.bitrate, mediaFileCandidate.width, mediaFileCandidate.height, 
						currentMediaFile.bitrate, currentMediaFile.width, currentMediaFile.height);
				var compareCandidateToMi = kalturaMediaInfo.compare(
						mediaInfo.video.bitrate, mediaInfo.video.width, mediaInfo.video.height, 
						mediaFileCandidate.bitrate, mediaFileCandidate.width, mediaFileCandidate.height);
				
				//update the candidate
				if(compareCurrentToMi < 0 && compareCurrentToCandidate < 0 && compareCandidateToMi >= 0)
					mediaFileCandidate = currentMediaFile;
				else if (compareCurrentToMi < 0 && compareCurrentToCandidate > 0 && compareCandidateToMi  < 0)
					mediaFileCandidate = currentMediaFile;
				else if(compareCurrentToMi >= 0 && compareCurrentToCandidate < 0)
					mediaFileCandidate = currentMediaFile;
			}
	        
	    }	
		return mediaFileCandidate;
	},
	
	downloadHttpUrl : function(urlStr, options, successCallback, errorCallback) {	
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
	}
		
};

module.exports = KalturaAdIntegrationHandler;