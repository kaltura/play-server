require('../../utils/KalturaConfig');
require('../../utils/KalturaCache');
require('../../utils/KalturaLogger');
require('../../dataObjects/PlayServerConstants');
const util = require('util');
const CacheLock = require('../../infra/CacheLock');

/**
 * class that helps KalturaLayoutManager to manage entry version and session version
 */
class LayoutHelper
{
	static initEntryVersion(entryId, successCallback, errorCallback)
	{
		const version = {id: LayoutHelper.getBaseVersion()};
		KalturaCache.add(entryId, version ,KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
	}

	static getEntryVersion(entryId, successCallback, errorCallback)
	{
		KalturaCache.get(entryId, successCallback, errorCallback);
	}

	/**
	 * for testing only
	 * @param entryId
	 * @param successCallback
	 * @param errorCallback
	 */
	static deleteEntryVersion(entryId, successCallback, errorCallback)
	{
		KalturaCache.del(entryId, successCallback, errorCallback);
	}

	static updateEntryVersion(entryId, successCallback, errorCallback, versionNum = null)
	{
		if(versionNum)
			KalturaCache.set(entryId, { id: versionNum }, KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
		else
		{
			LayoutHelper.getEntryVersion(entryId,
				function (version)
				{
					if (version)
					{
						const newVersion = { id: LayoutHelper.incrementVersion(version.id) };
						KalturaLogger.log(`Trying to incremente entry ${entryId} version from ${version.id} to ${newVersion.id}`);
						KalturaCache.set(entryId, newVersion, KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
					}
					else
					{
						KalturaLogger.debug(`Entry Id ${entryId} did not exist in cache - not updating cache`);
						successCallback();
					}
				},
				function (err)
				{
					KalturaLogger.warn(`Failed to get and update Entry ${entryId} version , due to ${util.inspect(err)}`);
					errorCallback();
				}
			);
		}
	}

	static incrementVersion(version)
	{
		const versionNum = parseInt(version.substring(1));
		return `v${versionNum + 1}`;
	}

	/**
	 * for testing only
	 * @param entryId
	 * @param successCallback
	 * @param errorCallback
	 */
	static resetEntryVersion(entryId, successCallback, errorCallback)
	{
		LayoutHelper.updateEntryVersion(entryId, successCallback, errorCallback, LayoutHelper.getBaseVersion());
	}

	static getBaseVersion()
	{
		return LAYOUT_BASE_VERSION;
	}

	/**
	 * initialize the layout version to be used with specific sessionId
	 * @param sessionId
	 * @param version
	 * @param entryTimeOut
	 * @param successCallback
	 * @param errorCallback
	 */
	static initSessionVersion(sessionIdKey, version, entryTimeOut, successCallback, errorCallback)
	{
		KalturaCache.add(sessionIdKey, version , entryTimeOut, successCallback, errorCallback);
	}

	static getSessionVersion(sessionIdKey, successCallback, errorCallback)
	{
		KalturaCache.get(sessionIdKey, successCallback, errorCallback);
	}
}
module.exports = LayoutHelper;
