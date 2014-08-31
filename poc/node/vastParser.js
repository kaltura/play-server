require('coffee-script/register');
require('../../../vast-client-js/src');

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
				response.error('Failed to get Ad server response');
				return callback();
			}				
			var ad = selectAdByDuration(adServerResponse, duration/1000);
			var adUrl = null;
			if(ad){
				adUrl = selectMediaFile(ad);
			}
			callback(adUrl);
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
};

module.exports = vastParser;