/**
* Data model to hold the Ad needed info in the cache
* @constructor
*/
class AdCacheData
{
	constructor(duration, path, adIdx, beaconList = [], isFiller = false)
	{
		this.isFiller = isFiller;
		this.duration = duration;
		this.path = path;
		this.adIdx = adIdx;
		this.beaconList = beaconList;
	}

	addBeacon(beaconData)
	{
		if (!beaconData)
			KalturaLogger.error('Beacon data got was not defined');
		this.beaconList.push(beaconData);
	}
}
module.exports = AdCacheData;
