
const chai = require('chai');
const expect = chai.expect;
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');


describe('testApiClientConnector', function() {

    //local test config
    let serviceUrl = 'nadavh';
    let secret = '4c1b5bab0076b742a55f6f0d708ab32f';
    let partnerId = -6;

    let connector = new ApiClientConnector(partnerId,secret,kalturaTypes.KalturaSessionType.ADMIN,serviceUrl);

    it('test session start', function() {

        return connector.startSession().then(function(data){
            expect(data.client.getKs()).to.not.be.null;
        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

    it('test api exception', function() {

        let falseConnector = new ApiClientConnector(partnerId,'4c1b5bab0076b742a55f6f0d708ab32w',kalturaTypes.KalturaSessionType.ADMIN,serviceUrl);
        return falseConnector.startSession().then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.equal("KalturaAPIException Error while starting session for partner [-6]");
            //expect(err).to.have.property('objectType').and.equal('KalturaAPIException');
        });
    });


    it('test handleRequset with uiConf get action ', function() {

        return connector.handleRequset(connector.client.uiConf.get ,[199]).then(function(data){
            expect(data).to.have.property('objectType').and.equal('KalturaUiConf');
           }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

});

