
const chai = require('chai');
const expect = chai.expect;
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../lib/utils/KalturaMediaInfo');
const TrancodinfEngine = require('../lib/infra/TranscodingEngine');
const KalturaFFMpegCmdGenerator = require('../lib/utils/KalturaFFMpegCmdGenerator');
const KalturaMediaInfoResponse = require('../lib/utils/KalturaMediaInfoResponse');
const TranscodingEngineResponse = require('../lib/infra/TranscodingEngineResponse');


describe('test the flow of ad transcode', function() {
    
    //local test config
    let serviceUrl = 'nadavh';
    let secret = '4c1b5bab0076b742a55f6f0d708ab32f';
    let partnerId = -6;
    let flavorId = '0_t50woq53'; //just for example
    let response = null;
    let commandLine = null;
    let filePath = './resources/1';
    let outPath = './resources/1_output.mpg';

    let info = new KalturaMediaInfo('ffprobe');
    let connector = new ApiClientConnector(partnerId,secret,kalturaTypes.KalturaSessionType.ADMIN,serviceUrl);

    it('test - get mediaInfo for ad', function() {
        return info.mediaInfoExec(filePath).then(function(data){
            expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
            expect(data.jsonInfo.substring(0,20)).to.equal("{\"programs\":[],\"stre");
            response = data;

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

        return KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, response.jsonInfo,connector).then(function(data){
            expect(data).to.not.be.null;
            commandLine =  KalturaFFMpegCmdGenerator.fillCmdLineFormat(data , filePath , outPath);
            expect(commandLine).to.not.be.null;

        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

    it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {

        let engine = new TrancodinfEngine('ffmpeg');
        return engine.transcodeFile(commandLine,filePath,outPath).then(function(data){
            expect(data).to.be.an.instanceof(TranscodingEngineResponse);
            expect(data.ffmpegResponse.substring(0,66)).to.equal("ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers");
        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

});