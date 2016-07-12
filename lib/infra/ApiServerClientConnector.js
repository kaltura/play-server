
const util = require('util');
const Promise = require("bluebird");
const ApiServerClientConnectorResponse = require('./ApiServerClientConnectorResponse');
const KalturaClient = require('../client/KalturaClient').KalturaClient;
const KalturaConfiguration = require('../client/KalturaClient').KalturaConfiguration; //api config

/**
 * class to create a client and handle api calls
 */
class ApiServerClientConnector
{
    constructor(partnerId,secret,sessionType,serviceUrl)
    {
        let clientConfig = new KalturaConfiguration();
        clientConfig.serviceUrl = 'http://' + serviceUrl;
        //clientConfig.setLogger(KalturaLogger); //todo

        this.client = new KalturaClient(clientConfig);
        this.secret=secret;
        this.partnerId=partnerId;
        this.sessionType=sessionType;
    }


    /**
     * start session with the server
     */
    startSession()
    {
        const This = this;

        return new Promise(function(resolve,reject)
        {
            function callback(result,err)
            {
                if (err)
                    reject(err);

                else
                {
                    if(ApiServerClientConnector.isValidResponse(result))
                    {
                        This.client.setKs(result);
                        resolve(new ApiServerClientConnectorResponse(This.client,result));
                    }
                    else
                        reject("KalturaAPIException " + result.message);

                }
            }

            This.client.session.start(callback , This.secret , 'some@user.com' , This.sessionType , This.partnerId , null, null);
        });
    }


    /**
     * handle an api call
     * @param apiCall - the function of the api call we wish to execute
     * @param params - the parameters of the api function passed as an array
     */
    handleRequset( apiCall , params = null)
    {
        const This = this;

        return new Promise(function(resolve,reject)
        {
            function callback(result,err)
            {
                if (err)
                    reject(err);

                else
                {
                    if(ApiServerClientConnector.isValidResponse(result))
                        resolve(result); //handle command
                    else
                        reject("KalturaAPIException " + result.message);
                }
            }

            if(params !== null && Array.isArray(params))
                params.unshift(callback)
            else
                params = new Array(callback);


            apiCall.apply(This , params);
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