KalturaUiConfParser = {
		parseUiConfConfig : function(uiConfId, playerJsonConfig) {
			var uiConfConfig = {
					timeout: 0,
					trackCuePoints: false,
					overrideXForwardFor: true
			}
			
			if(playerJsonConfig.plugins.vast && playerJsonConfig.plugins.vast.timeout){
				uiConfConfig.timeout = playerJsonConfig.plugins.vast.timeout; 
			}
			
			if(playerJsonConfig.plugins.vast && playerJsonConfig.plugins.vast.trackCuePoints){
				uiConfConfig.trackCuePoints = playerJsonConfig.plugins.vast.trackCuePoints; 
			}
			
			if(playerJsonConfig.plugins.playServerUrls && playerJsonConfig.plugins.playServerUrls.overrideXForwardFor === false){
				uiConfConfig.overrideXForwardFor = false; 
			}
			
			return uiConfConfig;
		}
};
