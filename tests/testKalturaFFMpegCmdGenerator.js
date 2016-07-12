const util = require('util');
const chai = require('chai');
const expect = chai.expect;
const KalturaFFMpegCmdGenerator = require('../lib/utils/KalturaFFMpegCmdGenerator');
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../lib/utils/KalturaMediaInfo');
const KalturaMediaInfoResponse = require('../lib/utils/KalturaMediaInfoResponse');

describe('test KalturaFFMpegCmdGenerator', function() {

    //local test config
    let serviceUrl = 'nadavh';
    let secret = '4c1b5bab0076b742a55f6f0d708ab32f';
    let partnerId = -6;
    let flavorId = '0_t50woq53';
    let response = null;

    let info = new KalturaMediaInfo('ffprobe');
    let connector = new ApiClientConnector(partnerId,secret,kalturaTypes.KalturaSessionType.ADMIN,serviceUrl);


    it('test - get mediaInfo for ad', function() {
        return info.mediaInfoExec('./resources/1').then(function(data){
            expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
            expect(data.jsonInfo.substring(0,20)).to.equal("{\"programs\":[],\"stre");
            response=data;
            
        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

    it('test - start client session', function() {
        return connector.startSession().then(function(data){
            expect(data.client.getKs()).to.not.be.null;
        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

    it('test - get command line via Api call', function() {

        let filePath = './resources/1';
        let outputPath = './resources/1_output.mpg';
        return KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId , response.jsonInfo ,connector).then(function(data){
            let cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat( data , filePath , outputPath);
            expect(data).to.not.be.null;
            expect(cmdLine).to.not.be.null;

        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

});