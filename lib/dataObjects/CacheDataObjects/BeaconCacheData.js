/**
* This class is used to pass the identifier on the URL and read it from it
*/
class BeaconCacheData {

	constructor(type, url)
	{
		this.type = type;
		this.url = url;
	}
}
module.exports = BeaconCacheData;
