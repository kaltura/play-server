KalturaUiConfParser = {
		parseUiConfConfig : function(uiConfId, playerJsonConfig) {
		var uiConfConfig = {
				timeout: playerJsonConfig['plugins']['vast'].timeout,
				trackCuePoints: playerJsonConfig['plugins']['vast'].trackCuePoints
		}
		
		uiConfConfigfKey = KalturaCache.getUiConfConfig(uiConfId);
		KalturaCache.set(uiConfConfigfKey, uiConfConfig, KalturaConfig.config.cache.uiConfConfig);
		
		return uiConfConfig;
	}
};