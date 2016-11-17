require('../../utils/KalturaUtils');
require('../../utils/KalturaConfig');
require('../../utils/KalturaCache');
require('../../utils/KalturaLogger');
const CacheLock = require('../../infra/CacheLock');

class LayoutHelper
{
	static addEntryVersion(entryId, successCallback, errorCallback)
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
			LayoutHelper.getEntryVersion(entryId ,
				function (version)
				{
					if(version)
					{
						const newVersion = { id: LayoutHelper.incrementVersion(version.id) };
						KalturaLogger.log(`Trying to incremente entry ${entryId} version from ${version.id} to ${newVersion.id}`);
						KalturaCache.set(entryId, newVersion, KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
					}
					else
						KalturaLogger.log(`Failed to get and update Entry ${entryId} version , this probably means that key ${entryId} doesnt exist in cache`);
				},
				function (err)
				{
					KalturaLogger.log(`Failed to get and update Entry ${entryId} version , due to ${err}`);
				}
			);
		}
	}

	static incrementVersion(version)
	{
		const versionNum = parseInt(version.substring(2));
		return `v_${versionNum + 1}`;
	}

	static resetEntryVersion(entryId, successCallback, errorCallback)
	{
		LayoutHelper.updateEntryVersion(entryId, successCallback, errorCallback, LayoutHelper.getBaseVersion());
	}

	static getBaseVersion()
	{
		return 'v_0';
	}
}
module.exports = LayoutHelper;
