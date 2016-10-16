require('../../dataObjects/PlayServerConstants');
const ReadyAdsBreakData = require('../../dataObjects/CacheDataObjects/ReadyAdsBreakData');

class AdBreakKeyHelper {

	constructor(value)
	{
		this.value = value;
		this.readyAdsBreakData = null;
		this._parseReadyAds();
	}

	getFiller()
	{
		return this.readyAdsBreakData.getFiller();
	}

	isBlocked()
	{
		return this.readyAdsBreakData.isBlocked();
	}

	getIndexReadyAd(index)
	{
		return this.readyAdsBreakData.getAd(index);
	}

	_parseReadyAds()
	{
		const values = this.value.split(READY_ADS_SIGN_SEPARATOR);
		let isBlocked = false;
		let filler;
		let count = 0;
		const foundAds = [];
		for (let i = 0; i < values.length; i++)
		{
			if (!values[i] || values[i] === null || values[i].length === 0)
				continue;
			const singleValue = values[i].split(READY_ADS_INNER_DATA_SIGN_SEPARATOR);
			if (singleValue.length !== 1 && singleValue.length !== 2)
				throw new Error(`Unexpected value found in cache for ad breaks [${this.value} - failed on ${values[i]}`);
			if (singleValue.length === 1)
			{
				if (singleValue[0] === BLOCKED)
				{
					isBlocked = true;
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
						try {
							count = parseInt(singleValue[1]);
						} catch (e) {
							throw new Error(`Unexpected value found in cache for ad breaks [${this.value} - found count with non integer value ${singleValue[1]}`);
						}
						break;
					case FILLER:
						filler = singleValue[1];
						break;
					case ERROR:
						throw new Error(`Found an ERROR as the ready ads - error is ${singleValue[1]}`);
					default:
						try {
							const adId = parseInt(singleValue[0]);
							foundAds[adId] = singleValue[1];
						} catch (e) {
							throw new Error(`Unexpected value found in cache for ad breaks [${this.value} - found value which should be an ad yet is not numeric ${singleValue[0]}`);
						}
				}
			}
		}
		this.readyAdsBreakData = new ReadyAdsBreakData(count, isBlocked, filler);
		for (let i = 0; i < foundAds.length; i++)
		{
			this.readyAdsBreakData.setAd(i, foundAds[i]);
		}
	}

	static blockKey(key)
	{
		KalturaCache.append(key, `${READY_ADS_SIGN_SEPARATOR}${BLOCKED}${READY_ADS_SIGN_SEPARATOR}`,
			function ()
			{
				KalturaLogger.log(`Successfully blocked key ${key}`);
			},
			function (err)
			{
				throw new Error(`Failed to block ready ads, existing key ${key}, due to ${err}`);
			}
		);
	}

	/**
	 *
	 * @param flavorKey
	 * @param defaultKey
	 * @AdCacheData adCacheData
	 * @param value
	 */
	static addAd(flavorKey, defaultKey, adCacheData, value)
	{
		// first we append to the defaults
		let keyToAppend;
		if (adCacheData.isFiller)
			keyToAppend = `${READY_ADS_SIGN_SEPARATOR}${FILLER}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}${value}${READY_ADS_SIGN_SEPARATOR}`;
		else
			keyToAppend = `${READY_ADS_SIGN_SEPARATOR}${adCacheData.adIdx}${READY_ADS_INNER_DATA_SIGN_SEPARATOR}${value}${READY_ADS_SIGN_SEPARATOR}`;
		KalturaCache.append(defaultKey, keyToAppend,
			function ()
			{
				KalturaCache.append(flavorKey, keyToAppend,
					function ()
					{
						KalturaLogger.log(`Appended ad ready key: ${value} to both flavor key ${flavorKey} and default key: ${defaultKey}`);
					},
					function ()
					{
						throw new Error(`Failed to append ad key to flavor ads ready array key ${flavorKey} due to ${err}`);
					}
				);
			},
			function (err)
			{
				throw new Error(`Failed to append ad key to ads ready defaults array key ${defaultKey} due to ${err}`);
			}
		);
	}
}
module.exports = AdBreakKeyHelper;
