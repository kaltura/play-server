
/**
 * Data model to hold needed vast parts of the general VAST parsed
 */
class VastInformationData
{
	setSkippableAttribute(skippable)
	{
		this.skippable = skippable;
	}

	setClickthroughURL(originalURL)
	{
		this.clickthroughOriginalURL = originalURL;
	}

	setSkipOffset(skipOffset)
	{
		this.skipOffset = skipOffset;
	}

	addBeacon(URLSuffix, offset)
	{
		if (!this.beacons)
			this.beacons = [];
		this.beacons.push({ trigger: URLSuffix, offset });
	}

	toJSON()
	{
		const copy = {};
		if (this.skippable)
			copy.skippable = this.skippable;
		if (this.clickthroughOriginalURL)
			copy.clickthroughOriginalURL = this.clickthroughOriginalURL;
		if (this.skipOffset)
			copy.skipOffset = this.skipOffset;
		if (this.beacons)
			copy.beacons = this.beacons;
		return copy;
	}

}

module.exports = VastInformationData;

