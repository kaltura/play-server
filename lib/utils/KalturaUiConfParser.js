KalturaUiConfParser = {
		parseUiConfConfig : function(uiConfId, playerJsonConfig) {
			var uiConfConfig = {
					timeout: 0,
					trackCuePoints: false,
					overrideXForwardFor: true,
					slateType: null,
					slateContent: null
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
			
			if(playerJsonConfig.plugins.vast && playerJsonConfig.plugins.vast.slateType){
				uiConfConfig.slateType = playerJsonConfig.plugins.vast.slateType; 
			}
			
			if(playerJsonConfig.plugins.vast && playerJsonConfig.plugins.vast.slateContent){
				uiConfConfig.slateContent = playerJsonConfig.plugins.vast.slateContent; 
			}
			
			return uiConfConfig;
		}
};
