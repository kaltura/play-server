require('coffee-script/register');
require('../../../vast-client-js/src');
var http = require('follow-redirects').http;

var vastClient = require('../../../vast-client-js/src/client');

vastParser = {
		
	getAdMediaFiles : function(response, vastUrl, duration, callback) {
		
		var parse = function(vastUrl, callback){				
			vastClient.get(vastUrl, null, 10*1000, callback);	
		};
		
		var selectAdByDuration = function(adServerResponse, duration){
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
			
			if(selectedCreative){
				response.log('Selected Creative with duration ' + selectedCreative.duration);
				return {ad:selectedAd, creative: selectedCreative};
			}					
			else{
				response.log('No creative selected');
				return null;
			}						
		};
		
		response.log('Parsing ad from: ' + vastUrl);
		parse(vastUrl, function(adServerResponse) {
			if (!adServerResponse) {
				response.log('Failed to get Ad server response');
				return callback();
			}				
			var ad = selectAdByDuration(adServerResponse, duration/1000);
			var adUrl = null;
			var trackingInfo = {};

			if(ad){
				adUrl = selectMediaFile(ad);
				trackingInfo = ad.creative.trackingEvents;
				trackingInfo.impression = ad.ad.impressionURLTemplates;
				trackingInfo.duration = ad.creative.duration*90000; //save in ts units
			}
			callback(adUrl, trackingInfo);
		});	
		
		var selectMediaFile = function(ad) {			
			var bestMediaFile = null;
			var adMediaFiles = ad.creative.mediaFiles;
			for(var i=0; i<adMediaFiles.length;i++){
				//skip media files with apiFramework=VPAID
				if(adMediaFiles[i].apiFramework == 'VPAID')
					continue;
				if(!bestMediaFile){
					bestMediaFile = adMediaFiles[i];
				}
				else{
					if((adMediaFiles[i].width*adMediaFiles[i].height) > (bestMediaFile.width*bestMediaFile.height)){
						bestMediaFile = adMediaFiles[i];
					}
				}
			}
			if(bestMediaFile){
				return bestMediaFile.fileURL.trim();
			}
			return null;			
		};
	},

	sendBeacon: function(response, trackingId, segmentIndex, outputStart, outputEnd, memcache){
		
		var sendBeaconForType = function(events){
			
			var httpGet = function(url){
				response.log('start sending beacon:' +url);
				http.get(url, function(res){
					response.log('beacon [' + url + '] sent with status: [' + res.statusCode + ']');
					res.on('data', function() { /* do nothing */ });
				}).on('error', function(e){
					response.log('Failed to send beacon [' + url + '], ' + e.message);
				});							
			};
			
			for(var i=0; i < events.length; i++){
				httpGet(events[i].trim());
			}				
		};
		
		var checkBeaconProgress = function(progressStartPercent, progressEndPercent, beaconPercent, eventType, trackingInfo){
			if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent >= beaconPercent && progressStartPercent < beaconPercent + 25){
				response.log('sending beacons of type: [' + eventType + ']');
				sendBeaconForType(trackingInfo[eventType]);
				delete trackingInfo[eventType];
			}		
			
			else if(trackingInfo.hasOwnProperty(eventType) && progressStartPercent < beaconPercent && progressEndPercent >= beaconPercent){
				response.log('sending beacons of type: [' + eventType + ']');
				sendBeaconForType(trackingInfo[eventType]);
				delete trackingInfo[eventType];
			}		
		};
		
		response.log('start sendBeacon for trackingId: [' + trackingId + '] outputStart: [' + outputStart + '] outputEnd: [' + outputEnd + ']');
		
		if(segmentIndex == 0){
			return;
		}
		memcache.get(trackingId, function (err, trackingInfo){
			if(trackingInfo){
				response.log('Tracking info found in cache for tracking id: [' + trackingId + '] value [' + JSON.stringify(trackingInfo) + ']');
				var progressStartPercent = outputStart / trackingInfo.duration * 100;
				var progressEndPercent = outputEnd / trackingInfo.duration * 100;
				if(outputEnd == 0){
					progressEndPercent = 100;
				}
					
				response.log('progressStartPercent: [' + progressStartPercent + '] progressEndPercent: [' + progressEndPercent + ']');
					
				checkBeaconProgress(progressStartPercent, progressEndPercent, 0, 'impression', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 0, 'start', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 25, 'firstQuartile', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 50, 'midpoint', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 75, 'thirdQuartile', trackingInfo);
				checkBeaconProgress(progressStartPercent, progressEndPercent, 100, 'complete', trackingInfo);					

				memcache.set(trackingId, trackingInfo, 600, function (err) {
					response.log('failed to update tracking info in cache:' + err);
				});
			}
			else{
				response.log('Tracking info not found in cache for tracking id: [' + trackingId + ']');
			}				

		});
	}
};

module.exports = vastParser;