const Promise = require('bluebird');
const KalturaClient = require('../client/KalturaClient').KalturaClient;
const KalturaConfiguration = require('../client/KalturaClient').KalturaConfiguration;
require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaCache');
require('../utils/KalturaLogger');

/**
 * class to create a client and handle api calls
 */
class ApiServerClientConnector
{
	constructor(partnerId = KalturaConfig.config.client.partnerId,
				secret = KalturaConfig.config.client.secret,
				sessionType = kalturaTypes.KalturaSessionType.ADMIN,
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
						resolve({ cacheParams: cacheParam, response: result, Params: params });
					}
					else
						reject(`KalturaAPIException ${result.message}`);
				}
			}
			This.client.session.start(callback, This._secret, null, This._sessionType, This._partnerId, null, null);
		});
	}

	_handleApiRequset(params)
	{
		const This = this;
		const RequestParams = params.Params;

		return new Promise(function (resolve, reject)
		{
			function callback(result, err)
			{
				if (err)
					reject(err);

				else
				{
					if (ApiServerClientConnector._isValidResponse(result))
						resolve({ cacheParams: RequestParams, response: result });

					else
						reject(`KalturaAPIException ${result.message}`);
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

	/**
	 * handle an api call
	 * @param apiCallService - the service of the api call we wish to execute
	 * @param apiCallAction - the action of the api call we wish to execute
	 * @param params - the parameters of the api function passed as an array
	 */
	doRequset(apiCallService, apiCallAction, params = null, impersonatePartnerId = null)
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
			then(this._handleApiRequset).
			then(ApiServerClientConnector._setValueInCache);
		}
		return this._handleApiRequset({ Params: reqParams }).
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
				KalturaLogger.log(`got key [${cacheKey}] and value[${data.value}] from cache`);
				resolve({ Params: passParams, response: JSON.parse(data.value) });
			}

			function cacheMissCallback()
			{
				KalturaLogger.log(`Cache miss - failed to get key [${cacheKey}] from cache`);
				reject(passParams);
			}

			KalturaCache.get(cacheKey, cacheHitCallback, cacheMissCallback, null);
		});
	}

	static _generateCacheKey(cacheKeyParams)
	{
		let cacheKey = '';
		for (const property in cacheKeyParams)
		{
			if (cacheKeyParams.hasOwnProperty(property))
				cacheKey += cacheKeyParams[property];
		}
		return cacheKey.md5();
	}

	static _isValidResponse(result)
	{
		if (result.objectType === 'KalturaAPIException')
			return false;
		return true;
	}

	_impersonate(partnerId)
	{
		this.clientConfig.partnerId = partnerId;
		this.client.setConfig(this.clientConfig);
	}

	_unimpersonate()
	{
		this.clientConfig.partnerId = this.partnerId;
		this.client.setConfig(this.clientConfig);
	}

}
module.exports = ApiServerClientConnector;
