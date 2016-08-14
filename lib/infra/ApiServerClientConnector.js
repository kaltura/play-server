const Promise = require('bluebird');
const KalturaClient = require('../client/KalturaClient').KalturaClient;
const KalturaConfiguration = require('../client/KalturaClient').KalturaConfiguration;
const KalturaTypes = require('../client/KalturaTypes');
require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
//require('../utils/KalturaCache');
require('../utils/KalturaLogger');

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
		//clientConfig.setLogger(KalturaLogger);

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
		const This = this;

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
						resolve({ requestParams: params, ks: result });
					}
					else
						reject(`KalturaAPIException ${result.message}`);
				}
			}
			This.client.session.start(callback, This._secret, null, This._sessionType, This._partnerId, null, null);
		});
	}

	_handleRequestPromise(params)
	{
		const This = this;
		const RequestParams = params.requestParams;
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
						KalturaLogger.log(`Response from API server was : ${result}`);
						resolve(result);
					}
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
	handleApiRequest(apiCallService, apiCallAction, params = null, impersonatePartnerId = null)
	{
		const This = this;
		const reqParams = { apiCallService, apiCallAction, params, impersonatePartnerId };

		if (!This.client.getKs())
		{
			return This._startSession(reqParams).bind(This).
			then(This._handleRequestPromise);
		}
		return This._handleRequestPromise({ requestParams: reqParams });
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
