require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');
require('../dataObjects/PlayServerConstants');

class CacheLock
{
	/**
	 *
	 * @param key
	 * @param criticalFunction - user should call unlock at the end of criticalFunction
	 * @param errorCallback
	 */
	static lock(key, criticalFunction, errorCallback)
	{
		const lockKey = CacheLock._generateLockKey(key);
		KalturaCache.add(lockKey, EMPTY_STRING ,KalturaConfig.config.cache.lockTtl, criticalFunction, errorCallback);
	}

	static unlock(key)
	{
		const lockKey = CacheLock._generateLockKey(key);
		KalturaCache.del(lockKey,
			() => { KalturaLogger.log(`deleted lock key ${lockKey} from cache`); },
			(err) => { KalturaLogger.log(`Failed to delete lock key ${lockKey} from cache, due to ${util.inspect(err)}`); });
	}

	static _generateLockKey(key)
	{
		return `${key}_lock`;
	}
}
module.exports = CacheLock;
