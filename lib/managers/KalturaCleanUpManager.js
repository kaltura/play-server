/* global KalturaCache,KalturaLogger,KalturaConfig */
const kaltura = module.exports = require('../KalturaManager');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
const CacheLock = require('../infra/CacheLock');
const client = require('../client/KalturaClient');
const util = require('util');
const LayoutHelper = require('./helpers/LayoutHelper');
require('../utils/KalturaCache');

/**
 * @service cleanup
 *
 * This service is responsible for validating and cleaning invalid and not needed data from the play server
 */
class KalturaCleanUpManager extends kaltura.KalturaManager {

	/**
	 * This method builds simulated cache keys for API requests that mighht be available in the cache and deletes them
	 * @param request
	 * @param response
	 * @param params
	 * @action cleanup.dropEntryApiCachedResults
	 */
	dropEntryApiCachedResults(request, response, params)
	{
		response.dir(params);
		if (!this.validateActionArguments(params, ['entryId'], response))
			return;

		this.okResponse(response, 'OK', 'text/plain');
		this._deleteEntryApiCallsFromCache(params.entryId);
	}

	_deleteEntryApiCallsFromCache(entryId, partnerId = null)
	{
		const getEntryCacheParams = { apiCallService: 'baseEntry', apiCallAction: 'get', params: [entryId], impersonatePartnerId: partnerId };
		const getEntryCacheKey = ApiServerClientConnector._generateCacheKey(getEntryCacheParams);
		KalturaCache.del(getEntryCacheKey,
			() => KalturaLogger.log(`Deleted entry get cache key for entry ${entryId} key ${getEntryCacheKey}`),
			(err) => KalturaLogger.warn(`Failed to delete entry get cache key for entry ${entryId}, key ${getEntryCacheKey}, due to ${util.inspect(err)}`)
		);

		const cueFilter = new client.objects.KalturaAdCuePointFilter();
		cueFilter.entryIdEqual = entryId;
		cueFilter.statusEqual = client.enums.KalturaCuePointStatus.READY;
		cueFilter.cuePointTypeEqual = client.enums.KalturaCuePointType.AD;
		const cuePointListCacheParams = { apiCallService: 'cuePoint', apiCallAction: 'listAction', params: [cueFilter], impersonatePartnerId: partnerId };
		const cuePointListCacheKey = ApiServerClientConnector._generateCacheKey(cuePointListCacheParams);
		KalturaCache.del(cuePointListCacheKey,
			() => KalturaLogger.log(`Deleted entry cue point list cache key for entry get ${entryId} key ${cuePointListCacheKey}`),
			(err) => KalturaLogger.warn(`Failed to delete entry cue point list cache key for entry ${entryId}, key ${cuePointListCacheKey}, due to ${util.inspect(err)}`)
		);

		const flavorAssetFilter = new client.objects.KalturaFlavorAssetFilter();
		flavorAssetFilter.entryIdEqual = entryId;
		flavorAssetFilter.statusEqual = client.enums.KalturaFlavorAssetStatus.READY;
		const flavorsListCacheParams = { apiCallService: 'flavorAsset', apiCallAction: 'listAction', params: [flavorAssetFilter], impersonatePartnerId: partnerId };
		const flavorsListCacheKey = ApiServerClientConnector._generateCacheKey(flavorsListCacheParams);
		KalturaCache.del(flavorsListCacheKey,
			() => KalturaLogger.log(`Deleted entry flavor list cache key for entry get ${entryId} key ${flavorsListCacheKey}`),
			(err) => KalturaLogger.warn(`Failed to delete entry flavors list cache key for entry ${entryId}, key ${flavorsListCacheKey}, due to ${util.inspect(err)}`)
		);
	}

	/**
	 * update the entry version for vod entry
	 *
	 * @action layout.updateEntry
	 */
	updateEntry(request, response, params)
	{
		const This = this;

		response.dir(params);
		if (!this.validateActionArguments(params, ['entryId'], response))
			return;
		this.okResponse(response, 'OK', 'text/plain');

		const entryKey = params.entryId;
		CacheLock.lock(entryKey,
			function ()
			{
				This._updateVersion(entryKey);
				This._deleteEntryApiCallsFromCache(entryKey);
			},
			function ()
			{
				KalturaLogger.log(`Could not lock entry ${entryKey} ,this probably means someone already locked the entry`);
				setTimeout(
					function ()
					{
						CacheLock.lock(entryKey,
							() => This._updateVersion(entryKey),
							() => KalturaLogger.log(`retried to lock entry ${entryKey} and failed`)
						);
					},
					KalturaConfig.config.cache.lock);
			}
		);
	}

	_updateVersion(entryKey)
	{
		LayoutHelper.updateEntryVersion(entryKey,
			function ()
			{
				KalturaLogger.log(`updated entry ${entryKey} version in cache}`);
				CacheLock.unlock(entryKey);
			},
			function (err)
			{
				CacheLock.unlock(entryKey);
				KalturaLogger.error(`Could not update entry ${entryKey} version, due to : ${util.inspect(err)}`);
			}
		);
	}


}
module.exports = KalturaCleanUpManager;