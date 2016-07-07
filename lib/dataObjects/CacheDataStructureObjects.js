/**
 * Data model to hold the Ad needed info in the cache
 * @constructor
 */
AdCacheData = function(duration, path, isFiller){
	if (isFiller)
		this.isFiller = true;
	else
		this.isFiller = false;
	this.duration = duration;
	this.path = path;
	this.beaconList = new Array();
}

AdCacheData.prototype.addBeacon = function(beaconData){
	if (!beaconData){
		throw new Error('Beacon data got was not defined');
	}
	this.beaconList.push(beaconData);
}


BeaconCacheData = function(type , url){
	this.type = type;
	this.url = url;
}

