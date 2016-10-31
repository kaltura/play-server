require('../PlayServerConstants');
/* global FILLER BLACK_FILLER */
/**
 * Data model to hold the Ad needed info in the cache
 * @constructor
 */
class AdCacheData
{
	constructor(duration, path, adIdx, type, flavorId, beaconList = [])
	{
		this.type = type;
		this.duration = duration;
		this.path = path;
		this.adIdx = adIdx;
		this.flavorId = flavorId;
		this.beaconList = beaconList;
	}
}
module.exports = AdCacheData;
