const crypto = require('crypto');
const util = require('util');
const continuationLocalStorage = require('continuation-local-storage');
require('./KalturaCache');
require('./KalturaConfig');
require('./KalturaUtils');

/* global KalturaCache KalturaLogger KalturaConfig KalturaUtils*/

class KalturaTinyUrl
{
	static generateTinyUrl(url)
	{
		const str = JSON.stringify(url);
		const tinyUrl = KalturaUtils.getShortHashKey(str);
		KalturaLogger.log(`Generating tinyUrl: ${tinyUrl} ,from: ${str}`);
		return tinyUrl;
	}

	static insert(url)
	{
		const tinyUrl = KalturaTinyUrl.generateTinyUrl(url);
		const ttl = KalturaConfig.config.cache.tinyUrlTtl;
		KalturaCache.set(tinyUrl, url, ttl,
			() => KalturaLogger.log(`Managed to save tinyUrl: ${tinyUrl} for url ${util.inspect(url)} for ${ttl} seconds in cache`),
			(err) => KalturaLogger.error(`Fail to save tinyUrl: ${tinyUrl} due to error:${util.inspect(err)}`)
		);
		return tinyUrl;
	}

	static load(tinyUrl, callback, errCallback)
	{
		KalturaCache.get(tinyUrl,
			function (value)
			{
				KalturaLogger.log(`Return value from tiny url cache is: ${util.inspect(value)}`);
				if (!value)
					return errCallback(`Key ${tinyUrl} has no value in cache, maybe cache was deleted?`);
				KalturaCache.touch(tinyUrl, KalturaConfig.config.cache.tinyUrlTtl,
					() => {KalturaLogger.debug(`managed to touch tinyUrl: ${tinyUrl} in cache`);},
					() => {KalturaLogger.debug(`failed to touch tinyUrl: ${tinyUrl} in cache`);}
				);
				callback(value);
			},
			(err) => errCallback(err)
		);
	}
}
module.exports = KalturaTinyUrl;
