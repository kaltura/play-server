/**
 * class to hold the response from ApiServerClientConnector
 */
class ApiServerClientConnectorResponse  {

    constructor (client,ks)
    {
        this.client=client;
        this.ks=ks;
    }

}

module.exports = ApiServerClientConnectorResponse;