const KeyAndValue = require('../SimpleDataObjects/KeyAndValue');

/**
 * Represents the data needed from the API server to support the VOD Ad Stitching solution
 */
class VodData
{

	constructor(partnerId, flavorIds, entry, cuePointListResult, flavorURLs)
	{
		this.entry = entry;
		this.cuePointList = cuePointListResult;
		const flavorsData = [];
		// we start at 2 since 0 was entry and 1 was cuePointslist
		for (let i = 0; i < flavorIds.length; i++)
		{
			const flavorId = flavorIds[i];
			const flavorPath = flavorURLs[i];
			const flavorData = new KeyAndValue(flavorId, flavorPath);
			flavorsData.push(flavorData);
		}
		this.flavorDataList = flavorsData;
		this.numOfFlavors = flavorIds.length;
		this.partnerId = partnerId;
	}

	/**
	 * returns only the flavors URLs as an array
	 * @returns {Array}
	 */
	getOnlyFlavorPaths()
	{
		const answer = [];
		for (let i = 0; i < this.flavorDataList.length; i++)
			answer.push(this.flavorDataList[i].value);
		return answer;
	}
}
module.exports = VodData;
