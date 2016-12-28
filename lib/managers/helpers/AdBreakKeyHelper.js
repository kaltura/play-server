require('../../dataObjects/PlayServerConstants');
const util = require('util');
const ReadyAdsBreakData = require('../../dataObjects/CacheDataObjects/ReadyAdsBreakData');

/* global FLAVORS_SIGN_SEPARATOR READY_ADS_SIGN_SEPARATOR READY_ADS_INNER_DATA_SIGN_SEPARATOR BLOCKED FILLER COUNT BLACK_FILLER AD ERROR KalturaLogger KalturaCache */

class AdBreakKeyHelper {

	constructor(value)
	{
		this.value = value;
		this.readyAdsBreakData = this._parseReadyAds();
	}

	_parseFillerTag(fillerTagValueSplit, readyAdsBreakData, isBlack)
	{
		this._validateInitialized(readyAdsBreakData);
		try
		{
			const fillerFlavorId = fillerTagValueSplit[1];
			const fillerCacheKey = fillerTagValueSplit[2];
			readyAdsBreakData.setFillerForFlavor(fillerFlavorId, fillerCacheKey, isBlack);
		}
		catch (e)
		{
			throw new Error(`Unexpected values found in cache for the filler value: ${util.inspect(fillerTagValueSplit)}`);
		}
	}

	_parseAdTag(adTagValueSplit, readyAdsBreakData)
	{
		this._validateInitialized(readyAdsBreakData);
		try {
			const flavorId = adTagValueSplit[1];
			const adIndex = adTagValueSplit[2];
			const adCacheKey = adTagValueSplit[3];
			readyAdsBreakData.setAdForFlavor(flavorId, adIndex, adCacheKey);
		} catch (e) {
			throw new Error(`Unexpected values found in cache for the ad value: ${util.inspect(adTagValueSplit)}`);
		}
	}

	_parseErrorTag(errorTagValueSplit, readyAdsBreakData)
	{
		this._validateInitialized(readyAdsBreakData);
		try {
			const err = errorTagValueSplit[1];
			readyAdsBreakData.errors.push(err);
		} catch (e) {
			throw new Error(`Unexpected values found in cache for the error value: ${util.inspect(errorTagValueSplit)}`);
		}
	}

	_parseCountTag(countTagValueSplit)
	{
		try
		{
			const expectedNumOfAds = parseInt(countTagValueSplit[1]);
			const flavorList = countTagValueSplit[2].split(FLAVORS_SIGN_SEPARATOR);
			return new ReadyAdsBreakData(flavorList, expectedNumOfAds);
		}
		catch (e)
		{
			throw new Error(`Unexpected values found in cache for the count value: ${util.inspect(countTagValueSplit)}`);
		}
	}


	_validateInitialized(readyAdsBreakData)
	{
		if (!readyAdsBreakData)
			throw new Error(`Order of calls in AdBreakKeyHelper indicates that COUNT tag was not the first or missing - BUG/Impossible value was ${this.value}`);
	}


	_parseReadyAds()
	{
		if (!this.value)
			throw new Error('No value given for the AdBreakHelper - failing');

		const values = this.value.split(READY_ADS_SIGN_SEPARATOR);
		let readyAdsBreakData = null;
		for (let i = 0; i < values.length; i++)
		{
			if (!values[i] || values[i] === null || values[i].length === 0)
				continue;
			const singleValue = values[i].split(READY_ADS_INNER_DATA_SIGN_SEPARATOR);
			if (singleValue.length === 1)
			{
				if (singleValue[0] === BLOCKED)
				{
					break; // we don't want to read the ads after it is blocked
				}
				else
					throw new Error(`Unexpected value found in cache for ad breaks ${this.value} - expect only blocked to be single word found ${singleValue[0]}`);
			}
			else
			{
				switch (singleValue[0])
				{
					case COUNT:
						readyAdsBreakData = this._parseCountTag(singleValue);
						break;
					case FILLER:
						this._parseFillerTag(singleValue, readyAdsBreakData, false);
						break;
					case BLACK_FILLER:
						this._parseFillerTag(singleValue, readyAdsBreakData, true);
						break;
					case AD:
						this._parseAdTag(singleValue, readyAdsBreakData);
						break;
					case ERROR:
						this._parseErrorTag(singleValue, readyAdsBreakData);
						break;
					default:
						throw new Error(`Found an ERROR as the ready ads - error is ${singleValue[1]}`);

				}
			}
		}
		this._validateInitialized(readyAdsBreakData);
		return readyAdsBreakData;
	}

	static blockKey(adsReadyKey, callback)
	{
		KalturaCache.append(adsReadyKey, `${READY_ADS_SIGN_SEPARATOR}${BLOCKED}${READY_ADS_SIGN_SEPARATOR}`,
			function ()
			{
				KalturaLogger.log(`Successfully blocked key ${adsReadyKey}`);
				if (callback)
					callback();
			},
			function (err)
			{
				throw new Error(`Failed to block ready ads, existing key ${adsReadyKey}, due to ${util.inspect(err)}`);
			}
		);
	}

	/**
	 * @param adsReadyKey
	 * @AdCacheData adCacheData
	 * @param value
	 */
	static addAdOrFiller(adsReadyKey, adCacheData, value)
	{
		// first we append to the defaults
		let keyToAppend = `${READY_ADS_SIGN_SEPARATOR}${adCacheData.type}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}${adCacheData.flavorId}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}`;
		if (adCacheData.type === AD)
			keyToAppend = `${keyToAppend}${adCacheData.adIdx}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}`;
		keyToAppend = `${keyToAppend}${value}${READY_ADS_SIGN_SEPARATOR}`;

		KalturaCache.append(adsReadyKey, keyToAppend,
			function ()
			{
				KalturaLogger.log(`Appended ad ready key: ${value} to ready ads key: ${adsReadyKey}`);
			},
			function (err)
			{
				throw new Error(`Failed to append ad key to ready ad key: ${adsReadyKey} due to: ${util.inspect(err)}`);
			}
		);
	}

	static createCountTag(numOfAds, flavors)
	{
		if (!flavors || flavors.length < 1)
			throw new Error('Got invalid number of flavors in the create count tag function');
		const flavorsAsText = flavors.join(FLAVORS_SIGN_SEPARATOR);
		return `${READY_ADS_SIGN_SEPARATOR}${COUNT}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}${numOfAds}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}${flavorsAsText}${READY_ADS_SIGN_SEPARATOR}`;
	}

	static getReadyAdsCacheKey(cuePointId, sessionId)
	{
		return KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, sessionId]);
	}

	static getErrorCacheTag(error)
	{
		return `${READY_ADS_SIGN_SEPARATOR}${ERROR}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}${error}${READY_ADS_SIGN_SEPARATOR}`;
	}

	/**
	 * We assume that all the black fillers exist at this point
	 * @param flavorId
	 * @returns {*}
	 */
	getFillerForFlavor(flavorId)
	{
		let allFillersExists = true;
		let fillerForFlavor = null;
		let blackFillerForFlavor = null;
		for (let i = 0; i < this.readyAdsBreakData.flavorIds.length; i++)
		{
			const indexedFlavorId = this.readyAdsBreakData.flavorIds[i];
			const flavorReadyAdsBreakData = this.readyAdsBreakData.getFlavorReadyAdsBreakData(indexedFlavorId);
			if (flavorReadyAdsBreakData.flavorId === flavorId)
			{
				fillerForFlavor = flavorReadyAdsBreakData.getFiller();
				blackFillerForFlavor = flavorReadyAdsBreakData.getBlackFiller();
			}
			if (!flavorReadyAdsBreakData.getFiller())
				allFillersExists = false;
		}
		if (allFillersExists && fillerForFlavor)
			return fillerForFlavor;
		return blackFillerForFlavor;
	}

	getAdBreakReadyKeysForFlavor(flavorId)
	{
		if (this.readyAdsBreakData.flavorIds.length === 0)
		{
			KalturaLogger.error(`Cannot parse cache value - flavor ids length is zero, cache value is : ${this.value}`);
			return [];
		}
		let shouldReturnCustomFiller = true;
		let givenFlavorReadyAdsBreakData;
		const readyAdsIndexes = Array(this.readyAdsBreakData.getExpectedNumOfAds()).fill(1);
		for (let i = 0; i < this.readyAdsBreakData.flavorIds.length; i++)
		{
			const indexedFlavorId = this.readyAdsBreakData.flavorIds[i];
			const flavorReadyAdsBreakData = this.readyAdsBreakData.getFlavorReadyAdsBreakData(indexedFlavorId);
			const flavorReadyAdsIndexes = flavorReadyAdsBreakData.getReadyAdsIndexes();
			for (let adId = 0; adId < this.readyAdsBreakData.getExpectedNumOfAds(); adId++)
			{
				if (flavorReadyAdsIndexes.indexOf(adId) === -1)
					readyAdsIndexes[adId] = 0;
			}
			if (indexedFlavorId === flavorId)
				givenFlavorReadyAdsBreakData = flavorReadyAdsBreakData;
			if (!flavorReadyAdsBreakData.getFiller())
				shouldReturnCustomFiller = false;
			if (!flavorReadyAdsBreakData.getBlackFiller())
			{
				KalturaLogger.error(`Missing black filler in ready ads cache key - found missing for flavor ${flavorId} , cache value is : ${this.value}`);
				return [];
			}
		}
		let answer = [];
		for (let adId = 0; adId < readyAdsIndexes.length; adId++)
		{
			if (readyAdsIndexes[adId])
				answer = answer.concat(givenFlavorReadyAdsBreakData.getReadyAdsKeys(adId));
		}
		if (shouldReturnCustomFiller)
			answer.push(givenFlavorReadyAdsBreakData.getFiller());
		else
			answer.push(givenFlavorReadyAdsBreakData.getBlackFiller());
		return answer;
	}

	areAllAdsReady()
	{
		for (let i = 0; i < this.readyAdsBreakData.flavorIds.length; i++)
		{
			const indexedFlavorId = this.readyAdsBreakData.flavorIds[i];
			const flavorReadyAdsBreakData = this.readyAdsBreakData.getFlavorReadyAdsBreakData(indexedFlavorId);
			const readyAdsIndexes = flavorReadyAdsBreakData.getReadyAdsIndexes();
			if (readyAdsIndexes.length !== this.readyAdsBreakData.expectedNumberOfAds)
				return false;
		}
		return true;
	}

	areAllBlackFillersReady()
	{
		for (let i = 0; i < this.readyAdsBreakData.flavorIds.length; i++)
		{
			const indexedFlavorId = this.readyAdsBreakData.flavorIds[i];
			const flavorReadyAdsBreakData = this.readyAdsBreakData.getFlavorReadyAdsBreakData(indexedFlavorId);
			if (!flavorReadyAdsBreakData.getBlackFiller())
				return false;
		}
		return true;
	}

	areThereErrors()
	{
		return this.readyAdsBreakData.errors.length > 0;
	}

}
module.exports = AdBreakKeyHelper;
