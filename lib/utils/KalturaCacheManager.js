const util = require('util');
const kalturaCouchbaseConnector = require('./KalturaCouchbaseConnector');
const kalturaMemcacheConnector = require('./KalturaMemcacheConnector');

class KalturaCacheManager {

    constructor(cacheObject)
    {
        this._cache = cacheObject;
    }

    static getInstance() {

        if (typeof KalturaCacheManager.instance == 'undefined') {
            switch (KalturaConfig.config.cache.type) {
                case 'memcache':
                {
                    KalturaCacheManager.instance = new KalturaCacheManager(kalturaMemcacheConnector);
                    break;
                }
                case 'couchbase':
                {
                    KalturaCacheManager.instance = new KalturaCacheManager(kalturaCouchbaseConnector.getInstance());
                    break;
                }
                default:
                    throw new TypeError("Cannot  instantiate KalturaCacheManager. please configure client cacheType in configuration.");
            }
            return KalturaCacheManager.instance;
        }
    }

    getDataVersion()
    {
        return this._cache.getDataVersion();
    }

    getStack()
    {
        return this._cache.getStack();
    }

    get(key, callback, errorCallback, is_encrypted)
    {
        this._cache.get(key, callback, errorCallback, is_encrypted);
    }

    set(key, value, lifetime, callback, errorCallback, is_encrypted)
    {
        this._cache.set(key, value, lifetime, callback, errorCallback, is_encrypted)
    }

    getMulti(keys, callback, errorCallback, is_encrypted)
    {
        this._cache.getMulti(keys, callback, errorCallback, is_encrypted);
    }

    touch(key, lifetime, callback, errorCallback)
    {
        this._cache.touch(key, lifetime, callback, errorCallback);
    }

    add(key, value, lifetime, callback, errorCallback, is_encrypted)
    {
        this._cache.add(key, value, lifetime, callback, errorCallback, is_encrypted);
    }

    append(key, value, callback, errorCallback, is_encrypted)
    {
        this._cache.append(key, value, callback, errorCallback, is_encrypted);
    }

    del(key, callback, errorCallback)
    {
        this._cache.del(key, callback, errorCallback);
    }

    replace(key, value, lifetime, callback, errorCallback, is_encrypted) {
        this._cache.replace(key, value, lifetime, callback, errorCallback, is_encrypted);
    }

    getBinary(key, callback, errorCallback)
    {
        kalturaMemcacheConnector.getBinary(key, callback, errorCallback);
    }

    getMultiBinary(keys, callback, errorCallback)
    {
        kalturaMemcacheConnector.getMultiBinary(keys, callback, errorCallback);
    }

}
module.exports = KalturaCacheManager;
