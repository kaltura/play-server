const KeyAndValue = require('../SimpleDataObjects/KeyAndValue');
/**
 * Data model to hold the ad data for player calls
 */
class PlayerAdData
{
	constructor(id, offset, duration)
	{
		this.id = id;
		this.duration = duration;
		this.offset = offset;
	}

	setSkipOffset(offset)
	{
		this.skipOffset = offset;
	}

	setAutoSkip()
	{
		this.autoskip = true;
	}

	setSkipUrl(url)
	{
		this.skipUrl = url;
	}

	setClickThrough(url)
	{
		this.clickThrough = url;
	}


	addBeacon(playerBeaconData)
	{
		if (!this.beaconList)
			this.beaconList = [];
		this.beaconList.push(playerBeaconData);
	}

	setSkippable()
	{
		this.skippable = true;
	}

	toJSON()
	{
		const copy = { id: this.id,
			offset: this.offset,
			duration: this.duration,
		};
		if (this.autoskip)
			copy.autoskip = this.autoskip;
		if (this.skippable)
			copy.skippable = this.skippable;
		if (this.clickThrough)
			copy.clickThrough = this.clickThrough;
		if (this.skipOffset)
			copy.skipOffset = this.skipOffset;
		if (this.beaconList)
			copy.beacons = this.beaconList;
		return copy;
	}

}

module.exports = PlayerAdData;


