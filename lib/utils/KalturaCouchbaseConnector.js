let util = require('util');
let Promise = require("bluebird");

let base = require('../KalturaBase');

let mock = false;
let couchbase = require('couchbase');
if (mock)
{
    couchbase = couchbase.Mock;
}

class KalturaCouchbaseConnector {

    constructor(){
        this._config = KalturaConfig.config.couchbase;
        this._clusterName = this._config.clusterName;
        this._bucketName = this._config.bucketName;
        this._cluster = new couchbase.Cluster(this._clusterName);
        this._bucket = this._cluster.openBucket(this._bucketName);
        this._dataVersion = 0;

        if (this._config.dataVersion)
            this._dataVersion = parseInt(this._config.dataVersion);

        process.on('unhandledRejection', (reason) => {
            KalturaLogger.log(reason);
        });
    }

    static getInstance()
    {
        if (typeof KalturaCouchbaseConnector.instance == 'undefined')
        {
            KalturaCouchbaseConnector.instance = new KalturaCouchbaseConnector();
        }
        return KalturaCouchbaseConnector.instance;
    }

    getDataVersion()
    {
        return this._dataVersion;
    }

    getStack()
    {
        return new Error();
    }

    errorHandling(reject, err)
    {
        let stackSource = this.getStack();
        var errMessage = 'Cache.get :' + err;
        if(reject){
            reject(errMessage);
        }
        else{
            KalturaLogger.error(errMessage + "\n" + stackSource.stack, stackSource);
        }
    }

    get(key, callback, errorCallback, is_encrypted)
    {
        let This = this;
        let stackSource = this.getStack();
        KalturaLogger.debug('Couchbase.get [' + key + ']...', stackSource);
        let getPromise = new Promise(function(resolve,reject) {
            This._bucket.get(key, function (err, result) {
                if (err) {
                    var errMessage = "Error in Couchbase.get key [" + key + "] for bucket [" + This._bucketName + "] msg [" + JSON.stringify(err) + "]";
                    reject(errMessage);
                    //This.errorHandling(errorCallback, errMessage);
                }
                else
                {
                    if (is_encrypted)
                    {
                        let encKey = Buffer(KalturaConfig.config.couchbase.KEY, 'base64');
                        let iv = Buffer(KalturaConfig.config.couchbase.IV, 'base64');
                        result.value = This._decryptValues(result.value, encKey, iv);
                    }
                    KalturaLogger.debug("Couchbase.get [" + util.inspect(result) + "]");
                    KalturaLogger.debug('Couchbase.get [' + key + ']: OK', stackSource);
                    if(resolve)
                        resolve(result);
                }
            })
        });

        getPromise.then(callback, errorCallback);
    }

    set(key, value, lifetime, callback, errorCallback, is_encrypted )
    {
        if(!lifetime || isNaN(lifetime))
            throw new Error('CouchBase.upsert [' + key + ']: lifetime [' + lifetime + '] is not numeric');

        lifetime = parseInt(lifetime);

        let stackSource = this.getStack();
        let This = this;
        if (is_encrypted) {
            let encKey = Buffer(KalturaConfig.config.couchbase.KEY, 'base64');
            let iv = Buffer(KalturaConfig.config.couchbase.IV, 'base64');
            value = This._encryptValues(value, encKey, iv);
        }

        let upsertPromise =  new Promise(function(resolve, reject) {
        This._bucket.upsert(key, value, {expiry: lifetime},function (err, result) {
            if (err)
            {
                var errMessage = "Error in Couchbase.upsert msg [" + JSON.stringify(err) + "]";
                reject(errMessage);
            }
            else
            {
                KalturaLogger.debug("Couchbase.set(upsert) [" + util.inspect(result) + "]");
                KalturaLogger.debug('Couchbase.set(upsert) [' + key + ']: OK', stackSource);
                if (resolve)
                    resolve(result);
            }
        });
    });
        upsertPromise.then(callback, errorCallback);
    }

    getMulti(keys, callback, errorCallback, is_encrypted)
    {
        let This = this;
        let stackSource = this.getStack();

        let getMultiPromise = new Promise(function (resolve, reject) {
            This._bucket.getMulti(keys, function (err, results) {
                if (err && err != "1") {
                    var errMessage = "Error in Couchbase.getMulti keys [" + JSON.stringify(keys) + "] msg [" + util.inspect(err) + "] result [" + util.inspect(results) + "]";
                    reject(errMessage);
                    return;
                }
                else {
                    if (is_encrypted) {
                        let encKey = Buffer(KalturaConfig.config.couchbase.KEY, 'base64');
                        let iv = Buffer(KalturaConfig.config.couchbase.IV, 'base64');
                        for (let entryKey in results)
                            results[entryKey].value = This._decryptValues(results[entryKey].value, encKey, iv);

                    }
                    KalturaLogger.debug("Couchbase.getMulti [" + util.inspect(results) + "]");
                    KalturaLogger.debug('Couchbase.getMulti [' + key + ']: OK', stackSource);
                }
                if(resolve)
                    resolve(results);
            })
        });
        getMultiPromise.then(callback, errorCallback);
    }

    touch(key, lifetime, callback, errorCallback)
    {
        if (!lifetime || isNaN(lifetime)) {
            throw new Error('Couchbase.touch [' + key + ']: lifetime [' + lifetime + '] is not numeric');
        }
        lifetime = parseInt(lifetime);

        let This = this;
        let stackSource = this.getStack();

        KalturaLogger.debug("Couchbase.touchEnabled value is [" + this._config.touchEnabled + "]");
        if (parseInt(this._config.touchEnabled))
        {
            KalturaLogger.debug("HERE111");
            let touchPromise = new Promise(function (resolve, reject) {
                This._bucket.touch(key, lifetime, function (err, result) {
                    if (err) {
                        var errMessage = "Error in Couchbase.touch msg [" + JSON.stringify(err) + "]";
                        reject(errMessage);
                    }
                    else if (result) {
                        KalturaLogger.debug("Couchbase.touch [" + util.inspect(result) + "]");
                        KalturaLogger.debug('Couchbase.touch [' + key + ']: OK', stackSource);
                        if(resolve)
                            resolve();
                    }
                    else
                    {
                        KalturaLogger.debug('Couchbase.touch [' + key + ']: Value Is Null', stackSource);
                        reject('value is null');
                    }
                });
            });
            touchPromise.then(callback, errorCallback);
        }
        else {
            KalturaLogger.debug("HERE222");
            let getPromise = new Promise(function (resolve, reject)
            {
                This._bucket.get(key, function (err, result) {
                    if (err) {
                        var errMessage = "Error in Couchbase.touch(get-phase) key [" + key + "] for bucket [" + This._bucketName + "] msg [" + JSON.stringify(err) + "]";
                        reject(err);
                        //This.errorHandling(errorCallback, errMessage);
                    }
                    else if (result) {
                        KalturaLogger.debug("Couchbase.touch(get-phase) [" + util.inspect(result) + "]");
                        KalturaLogger.debug('Couchbase.touch(get-phase) [' + key + ']: OK', stackSource);
                        This.set(key, result, lifetime, resolve, reject);
                    }
                    else
                    {
                        KalturaLogger.debug('Couchbase.touch(get-phase) [' + key + ']: Value Is Null', stackSource);
                        reject('value is null');
                    }
                })
            });
            getPromise.then(callback, errorCallback);
        }
    }

    add(key, value, lifetime, callback, errorCallback, is_encrypted)
    {
        if(!lifetime || isNaN(lifetime)){
            throw new Error('Couchbase.add(insert) [' + key + ']: lifetime [' + lifetime + '] is not numeric');
        }

        lifetime = parseInt(lifetime);
        let stackSource = this.getStack();

        let This = this;
        if (is_encrypted) {
            let encKey = Buffer(KalturaConfig.config.couchbase.KEY, 'base64');
            let iv = Buffer(KalturaConfig.config.couchbase.IV, 'base64');
            value = This._encryptValues(value, encKey, iv);
        }

        let insertPromise =  new Promise(function(resolve, reject) {
            This._bucket.insert(key, value, {expiry: lifetime},function (err, result) {
                if (err)
                {
                    var errMessage = "Error in Couchbase.add(insert) msg [" + JSON.stringify(err) + "]";
                    reject(errMessage);
                }
                else
                {
                    KalturaLogger.debug("Couchbase.add(insert) [" + util.inspect(result) + "]");
                    KalturaLogger.debug('Couchbase.add(insert) [' + key + ']: OK', stackSource);
                    if (resolve)
                        resolve();
                }
            });
        });
        insertPromise.then(callback, errorCallback);
    }

    append(key, value, callback, errorCallback, is_encrypted)
    {
        let stackSource = this.getStack();
        let This = this;

        if (is_encrypted) {
            let encKey = Buffer(KalturaConfig.config.couchbase.KEY, 'base64');
            let iv = Buffer(KalturaConfig.config.couchbase.IV, 'base64');
            value = This._encryptValues(value, encKey, iv);
        }

        let appendPromise =  new Promise(function(resolve, reject) {
            This._bucket.insert(key, value, function (err, result) {
                if (err)
                {
                    var errMessage = "Error in Couchbase.append msg [" + JSON.stringify(err) + "]";
                    reject(errMessage);
                }
                else
                {
                    KalturaLogger.debug("Couchbase.append [" + util.inspect(result) + "]");
                    KalturaLogger.debug('Couchbase.append [' + key + ']: OK', stackSource);
                    if (resolve)
                        resolve();
                }
            });
        });
        appendPromise.then(callback, errorCallback);
    }

    del(key, callback, errorCallback)
    {
        let stackSource = this.getStack();
        let This = this;

        let delPromise =  new Promise(function(resolve, reject) {
            This._bucket.remove(key, value, function (err, result) {
                if (err)
                {
                    var errMessage = "Error in Couchbase.del(remove) msg [" + JSON.stringify(err) + "]";
                    reject(errMessage);
                }
                else
                {
                    KalturaLogger.debug("Couchbase.del(remove) [" + util.inspect(result) + "]");
                    KalturaLogger.debug('Couchbase.del(remove) [' + key + ']: OK', stackSource);
                    if (resolve)
                        resolve();
                }
            });
        });
        delPromise.then(callback, errorCallback);
    }

    replace(key, value, lifetime, callback, errorCallback, is_encrypted)
    {
        let stackSource = this.getStack();
        let This = this;

        if (is_encrypted)
        {
            let encKey = Buffer(KalturaConfig.config.couchbase.KEY, 'base64');
            let iv = Buffer(KalturaConfig.config.couchbase.IV, 'base64');
            value = This._encryptValues(value, encKey, iv);
        }

        let delPromise =  new Promise(function(resolve, reject) {
            This._bucket.remove(key, value, {expiry: lifetime}, function (err, result) {
                if (err)
                {
                    var errMessage = "Error in Couchbase.replace msg [" + JSON.stringify(err) + "]";
                    reject(errMessage);
                }
                else
                {
                    KalturaLogger.debug("Couchbase.replace [" + util.inspect(result) + "]");
                    KalturaLogger.debug('Couchbase.replace [' + key + ']: OK', stackSource);
                    if (resolve)
                        resolve();
                }
            });
        });
        delPromise.then(callback, errorCallback);
    }

    getBinary(key, callback, errorCallback)
    {
      //TO-DO implement getBinary and modify specified memcache implementation in KalturaCacheManager
    }

    getMultiBinary(keys, callback, errorCallback)
    {
        //TO-DO implement getMultiBinary and modify specified memcache implementation in KalturaCacheManager
    }

    _decryptValues(object, encKey, iv)
    {
        let This = this;
        if (typeof object == 'string')
            return base.KalturaBase.prototype.decrypt(object, encKey, iv);
        else
        {
            for (let key in object) {
                var val = object[key];
                object[key] = This._decryptValues(val, encKey, iv);
            }
        }
        return object;
    }

    _encryptValues(object, encKey, iv)
    {
        let This = this;
        if (typeof object == 'string')
            return base.KalturaBase.prototype.encrypt(object, encKey, {iv:iv});
        else
        {
            for (let key in object) {
                var val = object[key];
                object[key] = This._encryptValues(val, encKey, iv);
            }
            return object;
        }
    }
}

module.exports = KalturaCouchbaseConnector;