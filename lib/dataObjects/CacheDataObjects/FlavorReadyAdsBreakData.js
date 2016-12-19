const util = require('util');
require('../PlayServerConstants');

class FlavorReadyAdsBreakData
{
	constructor(flavorId, numberOfAds)
	{
		this.flavorId = flavorId;
		this.ads = new Array(numberOfAds);
		this.filler = null;
		this.blackFiller = null;
	}

	setAd(index, ad)
	{
		this._validateIndex(index);
		this.ads[index] = ad;
	}

	getReadyAdsKeys(index)
	{
		this._validateIndex(index);
		return this.ads[index];
	}

	setFiller(filler, isBlack)
	{
		if (isBlack)
			this.blackFiller = filler;
		else
			this.filler = filler;
	}

	getFiller()
	{
		return this.filler;
	}

	getBlackFiller()
	{
		return this.blackFiller;
	}

	getExpectedNumOfAds()
	{
		return this.ads.length;
	}

	getReadyAdsIndexes()
	{
		const answer = [];
		for (let i = 0; i < this.ads.length; i++)
		{
			if (this.ads[i])
				answer.push(i);
		}
		return answer;
	}

	_validateIndex(index)
	{
		if (index >= this.ads.length || index < 0)
			throw new Error(`Unexpected index received ${index} while count is ${this.ads.length}`);
	}

}
module.exports = FlavorReadyAdsBreakData;


