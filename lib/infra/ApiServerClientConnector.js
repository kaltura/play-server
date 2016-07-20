const Promise = require('bluebird');
const KalturaClient = require('../client/KalturaClient').KalturaClient;
const KalturaConfiguration = require('../client/KalturaClient').KalturaConfiguration;
require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
//require('../utils/KalturaCache');
require('../utils/KalturaLogger');

/**
 * class to create a client and handle api calls
 */
class ApiServerClientConnector
{
	constructor(partnerId, secret, sessionType, serviceUrl)
	{
		const clientConfig = new KalturaConfiguration();
		clientConfig.serviceUrl = serviceUrl;
		clientConfig.setLogger(KalturaLogger);

		this.client = new KalturaClient(clientConfig);
		this._secret = secret;
		this._partnerId = partnerId;
		this._sessionType = sessionType;
	}

	/**
	 * start session with the server
	 */
	startSession()
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
					if (ApiServerClientConnector.isValidResponse(result))
					{
						This.client.setKs(result);
						resolve(result);
					}
					else
						reject(`KalturaAPIException ${result.message}`);
				}
			}

			This.client.session.start(callback, This._secret, null, This._sessionType, This._partnerId, null, null);
		});
	}
	/**
	 * handle an api call
	 * @param apiCallService - the service of the api call we wish to execute
	 * @param apiCallAction - the action of the api call we wish to execute
	 * @param params - the parameters of the api function passed as an array
	 */
	handleRequset(apiCallService, apiCallAction, params = null)
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
					if (ApiServerClientConnector.isValidResponse(result))
						resolve(result);
					else
						reject(`KalturaAPIException ${result.message}`);
				}
			}

			let apiParams = params.slice();
			if (apiParams !== null && Array.isArray(apiParams))
				apiParams.unshift(callback);
			else
				apiParams = new Array(callback);

			const actionFunction = This.client[apiCallService][apiCallAction];
			actionFunction.apply(This, apiParams);
		});
	}

	static isValidResponse(result)
	{
		if (result.objectType === 'KalturaAPIException')
			return false;
		return true;
	}

}
module.exports = ApiServerClientConnector;
