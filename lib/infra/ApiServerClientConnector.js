const Promise = require('bluebird');
const util = require('util');
const KalturaClient = require('../client/KalturaClient').KalturaClient;
const KalturaConfiguration = require('../client/KalturaClient').KalturaConfiguration;
const KalturaTypes = require('../client/KalturaTypes');
require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');

/* global KalturaUtils KalturaConfig KalturaCache KalturaLogger */

/**
 * class to create a client and handle api calls
 */
class ApiServerClientConnector
{
	constructor(partnerId = KalturaConfig.config.client.partnerId,
				secret = KalturaConfig.config.client.secret,
                sessionType = KalturaTypes.KalturaSessionType.ADMIN,
                serviceUrl = KalturaConfig.config.client.serviceUrl)

	{
		const clientConfig = new KalturaConfiguration();
		clientConfig.serviceUrl = serviceUrl;
		clientConfig.partnerId = partnerId;
		clientConfig.setLogger(KalturaLogger);

		this.client = new KalturaClient(clientConfig);
		this._secret = secret;
		this._partnerId = partnerId;
		this._sessionType = sessionType;
		this.clientConfig = clientConfig;
	}

	/**
	 * start session with the server
	 */
	_startSession(params = null)
	{
		const cacheParams = { service: 'session', action: 'start', secret: this._secret, type: this._sessionType, partnerId: this._partnerId };
		return ApiServerClientConnector._getValueFromCache(cacheParams, params).bind(this)
			.then(this._startSessionCached, this._startSessionNoCache);
	}

	_startSessionCached(params)
	{
		const This = this;
		return new Promise(function (resolve)
		{
			This.client.setKs(params.response);
			resolve({ Params: params.Params, response: params.response });
		});
	}

	_startSessionNoCache(params = null)
	{
		return this._handleStartSession(params)
			.then(ApiServerClientConnector._setValueInCache);
	}

	_invalidateKs(client)
    {
        client.setKs(null);
        KalturaLogger.log('Invalidating Ks');
    }

	_handleStartSession(params = null)
	{
		const This = this;
		const cacheParam = { service: 'session', action: 'start', secret: This._secret, type: This._sessionType, partnerId: This._partnerId };
		return new Promise(function (resolve, reject)
		{
			function callback(result, err)
			{
				if (err)
					reject(err);

				else
				{
					if (ApiServerClientConnector._isValidResponse(result))
					{
						This.client.setKs(result);
						let ksExpiryTime;
						if (isNaN(parseInt(KalturaConfig.config.client.ksExpiryTime)))
							ksExpiryTime = 6000;
						else
							ksExpiryTime = KalturaConfig.config.client.ksExpiryTime * 1000;
                        setTimeout(This._invalidateKs, ksExpiryTime, This.client);
						KalturaLogger.log(`Setting Timeout for invalidating Ks - ${ksExpiryTime}`);
						resolve({ cacheParams: cacheParam, response: result, Params: params });
					}
					else
					{
						This._markErrorAPIResponse(result, reject);
					}
				}
			}
			This.client.session.start(callback, This._secret, null, This._sessionType, This._partnerId, null, null);
		});
	}

	_handleRequestPromise(params)
	{
		const This = this;
		const RequestParams = params.Params;

		return new Promise(function (resolve, reject)
		{
			function callback(result, err)
			{
				if (err)
				{
					KalturaLogger.error(`Got error when calling API server :${util.inspect(err)}`);
					if (err.hasOwnProperty('objectType') && err.objectType === 'KalturaAPIException' && err.code === 'INVALID_KS' && err.args.KSID === 'EXPIRED')
						This._invalidateKs(This.client);
					reject(err);
				}

				else
				{
					if (ApiServerClientConnector._isValidResponse(result))
					{
						KalturaLogger.log(`Response from API server was : ${JSON.stringify(result)}`);
						resolve({ cacheParams: RequestParams, response: result, Params: null });
					}
					else
					{
						This._markErrorAPIResponse(result, reject);
					}
				}
			}

			let apiParams = RequestParams.params.slice();
			if (apiParams !== null && Array.isArray(apiParams))
				apiParams.unshift(callback);
			else
				apiParams = new Array(callback);

			const actionFunction = This.client[RequestParams.apiCallService][RequestParams.apiCallAction];

			if (RequestParams.impersonatePartnerId)
				This._impersonate(RequestParams.impersonatePartnerId);
			actionFunction.apply(This, apiParams);
			if (RequestParams.impersonatePartnerId)
				This._unimpersonate(RequestParams.impersonatePartnerId);
		});
	}

	_markErrorAPIResponse(result, reject)
	{
		KalturaLogger.log(`Failed to get response from API server :${util.inspect(result)}`);
		if (result)
			reject(`KalturaAPIException ${result.message}`);
		else
			reject('KalturaAPIException got null as result');
	}


	/**
	 * handle an api call
	 * @param apiCallService - the service of the api call we wish to execute
	 * @param apiCallAction - the action of the api call we wish to execute
	 * @param params - the parameters of the api function passed as an array
	 */
	handleApiRequest(apiCallService, apiCallAction, params = null, impersonatePartnerId = null)
	{
		const reqParams = { apiCallService, apiCallAction, params, impersonatePartnerId };

		return ApiServerClientConnector._getValueFromCache(reqParams, reqParams).bind(this).
		then(ApiServerClientConnector._returnCachePromise, ApiServerClientConnector._handleReqNoCachePromise).
		then(ApiServerClientConnector._returnRequestValue);
	}

	static _returnRequestValue(params)
	{
		return new Promise(function (resolve)
		{
			resolve(params.response);
		});
	}

	static _returnCachePromise(value)
	{
		return new Promise(function (resolve)
		{
			resolve(value);
		});
	}


	static _handleReqNoCachePromise(reqParams)
	{
		if (!this.client.getKs())
		{
			return this._startSession(reqParams).bind(this).
			then(this._handleRequestPromise).
			then(ApiServerClientConnector._setValueInCache);

		}
		return this._handleRequestPromise({ Params: reqParams }).
		then(ApiServerClientConnector._setValueInCache);
	}


	static _setValueInCache(params)
	{
		const cacheKey = ApiServerClientConnector._generateCacheKey(params.cacheParams);
		const cacheTime = KalturaConfig.config.cache.vodApiTimeout;

		return new Promise(function (resolve, reject)
		{
			const json = JSON.stringify(params.response);
			function callback()
			{
				KalturaLogger.log(`set key [${cacheKey}] and value[${json}] in cache with ttl[${cacheTime}]`);
				resolve({ Params: params.Params, response: params.response });
			}

			function errorCallback()
			{
				KalturaLogger.log(`Error: failed to set key [${cacheKey}] and value[${json}] in cache`);
				reject({ Params: params.Params, response: params.response }); //still want to get the api response
			}
			KalturaCache.set(cacheKey, json, cacheTime, callback, errorCallback, null);
		});
	}

	static _getValueFromCache(cacheParams, passParams = null)
	{
		const cacheKey = ApiServerClientConnector._generateCacheKey(cacheParams);
		return new Promise(function (resolve, reject)
		{
			function cacheHitCallback(data)
			{
				if (!data)
				{
					KalturaLogger.log(`Cache miss - failed to get key [${cacheKey}] from cache`);
					reject(passParams);
				}
				else
				{
					KalturaLogger.log(`got key [${cacheKey}] and value[${data}] from cache`);
					resolve({Params: passParams, response: JSON.parse(data)});
				}
			}

			function cacheErrCallback(err)
			{
				KalturaLogger.log(`Could not get cache value for [${cacheKey}] due to cache error ${util.inspect(err)}`);
				reject(passParams);
			}

			KalturaCache.get(cacheKey, cacheHitCallback, cacheErrCallback);
		});
	}

	static _generateCacheKey(cacheKeyParams)
	{
		let cacheKey = '';
		for (const property in cacheKeyParams)
		{
			if (cacheKeyParams.hasOwnProperty(property))
				cacheKey = cacheKey + property + cacheKeyParams[property];
		}
		return cacheKey.md5();
	}

	static _isValidResponse(result)
	{
		if (result === null || result.objectType === 'KalturaAPIException')
			return false;
		return true;
	}

	_impersonate(partnerId)
	{
		this.client.setPartnerId(partnerId);
	}

	_unimpersonate()
	{
		this.client.setPartnerId(this.clientConfig.partnerId);
	}

}
module.exports = ApiServerClientConnector;
