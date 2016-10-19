const KeyAndValue = require('../SimpleDataObjects/KeyAndValue');

/**
 * Represents the data needed from the API server to support the VOD Ad Stitching solution
 */
class VodData
{

	constructor(partnerId, flavorDataList, selectedFlavorIds, entry, uiConf, cuePointList)
	{
		this.entry = entry;
		this.cuePointList = cuePointList;
		this.flavorDataList = flavorDataList;
		this.partnerId = partnerId;
		this.uiConf = uiConf;
		this.selectedFlavorIdList = selectedFlavorIds;
	}

	/**
	 * returns only the flavors URLs as an array
	 * @returns {Array}
	 */
	getOnlySelectedFlavorPaths()
	{
		const answer = [];
		for (let i = 0; i < this.selectedFlavorIdList.length; i++)
		{
			for (let j = 0; j < this.flavorDataList.length; j++)
			{
				if (this.flavorDataList[j].id === this.selectedFlavorIdList[i])
					answer.push(this.flavorDataList[j].url);
			}
		}
		return answer;
	}

	/**
	 * returns only the flavors ids as an array
	 * @returns {Array}
	 */
	getAllFlavorIds()
	{
		const answer = [];
		for (let i = 0; i < this.flavorDataList.length; i++)
			answer.push(this.flavorDataList[i].id);
		return answer;
	}
}
module.exports = VodData;
