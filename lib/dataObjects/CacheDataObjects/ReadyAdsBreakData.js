const util = require('util');
const FlavorReadyAdsBreakData = require('./FlavorReadyAdsBreakData');
require('../PlayServerConstants');


class ReadyAdsBreakData
{
	constructor(flavorIds, numberOfAds)
	{
		this.errors = [];
		this.flavorIds = flavorIds;
		this.expectedNumberOfAds = numberOfAds;
		this.flavorReadyAdBreakDataList = [];
		for (let idx = 0; idx < flavorIds.length; idx++)
		{
			const flavorId = flavorIds[idx];
			this.flavorReadyAdBreakDataList[flavorId] = new FlavorReadyAdsBreakData(flavorId, numberOfAds);
		}
	}

	_validateFlavorId(flavorId)
	{
		if (this.flavorIds.indexOf(flavorId) === -1)
			throw new Error(`Given flavor ${flavorId} which is not found in the initializing flavor ids: ${util.inspect(this.flavorIds)}`);
	}

	setFillerForFlavor(flavorId, fillerKey, isBlack)
	{
		this._validateFlavorId(flavorId);
		this.flavorReadyAdBreakDataList[flavorId].setFiller(fillerKey, isBlack);
	}

	setAdForFlavor(flavorId, index, adKey)
	{
		this._validateFlavorId(flavorId);
		this._validateIndex(index);
		this.flavorReadyAdBreakDataList[flavorId].setAd(index, adKey);
	}

	getFlavorReadyAdsBreakData(flavorId)
	{
		this._validateFlavorId(flavorId);
		return this.flavorReadyAdBreakDataList[flavorId];
	}

	getExpectedNumOfAds()
	{
		return this.expectedNumberOfAds;
	}

	_validateIndex(index)
	{
		if (index >= this.expectedNumberOfAds || index < 0)
			throw new Error(`Unexpected index received ${index} while count is ${this.expectedNumberOfAds}`);
	}
}
module.exports = ReadyAdsBreakData;

