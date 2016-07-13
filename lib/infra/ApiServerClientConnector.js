
const util = require('util');
const Promise = require("bluebird");
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
        let clientConfig = new KalturaConfiguration();
        clientConfig.serviceUrl=serviceUrl;
        clientConfig.setLogger(KalturaLogger);

        this.client = new KalturaClient(clientConfig);
        this._secret=secret;
        this._partnerId=partnerId;
        this._sessionType=sessionType;
    }

    /**
     * start session with the server
     */
    startSession()
    {

        let This = this;

        return new Promise(function(resolve, reject)
        {
            function callback(result, err)
            {
                if (err)
                    reject(err);

                else
                {
                    if(ApiServerClientConnector.isValidResponse(result))
                    {
                        This.client.setKs(result);
                        resolve(result);
                    }
                    else
                        reject("KalturaAPIException " + result.message);
                }
            }

            This.client.session.start(callback , This._secret , 'some@user.com' , This._sessionType , This._partnerId , null, null);
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
        let This = this;

        return new Promise(function(resolve,reject)
        {
            function callback(result, err)
            {
                if (err)
                    reject(err);

                else
                {
                    if(ApiServerClientConnector.isValidResponse(result))
                        resolve(result);
                    else
                        reject("KalturaAPIException " + result.message);
                }
            }

            if(params !== null && Array.isArray(params))
                params.unshift(callback)
            else
                params = new Array(callback);

            let actionFunction = This.client[apiCallService][apiCallAction];
            actionFunction.apply(This, params);
        });
    }

     static isValidResponse(result)
    {
        if (result.objectType == "KalturaAPIException")
            return false;
        return true;
    }

}

module.exports = ApiServerClientConnector;
