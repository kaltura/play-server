require('../PlayServerConstants');
/* global FILLER BLACK_FILLER */
/**
 * Data model to hold the Ad needed info in the cache
 * @constructor
 */
class AdCacheData
{
	constructor(duration, path, adIdx, type, flavorId, trackingList = [])
	{
		this.type = type;
		this.duration = duration;
		this.path = path;
		this.adIdx = adIdx;
		this.flavorId = flavorId;
		this.beaconList = [];
		for (let trackingIndex = 0; trackingIndex < trackingList.length; trackingIndex++)
		{
			switch (trackingList[trackingIndex].key)
			{
				case 'skipOffset':
					this.skipOffset = trackingList[trackingIndex].value;
					break;
				case 'clickThrough':
					this.clickThrough = trackingList[trackingIndex].value;
					break;
				default :
					this.beaconList.push(trackingList[trackingIndex]);
			}
		}
	}
}
module.exports = AdCacheData;
