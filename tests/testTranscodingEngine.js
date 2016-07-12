
const chai = require('chai');
const expect = chai.expect;
const TranscodingEngineResponse = require('../lib/infra/TranscodingEngineResponse');
const TrancodinfEngine = require('../lib/infra/TranscodingEngine');

/**
 * This is a unit test to validate proper functionality of the TranscodeingEngine class
 */
describe('test TranscodeingEngine class', function() {

     it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {

         let engine = new TrancodinfEngine('ffmpeg');
         let fileName = './resources/1';
         let outputPath = './resources/1_output.mpg';
         let commandLine = ' -i '+fileName+' -y '+outputPath;
         return engine.transcodeFile(commandLine,fileName,outputPath).then(function(data){
           expect(data).to.be.an.instanceof(TranscodingEngineResponse);
           expect(data.ffmpegResponse.substring(0,66)).to.equal("ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers");
            }, function(err){ // error handling
             expect(err).to.be.null;
         });
     });

    it('test TranscodeingEngine - source file doest exist', function() {

        let engine = new TrancodinfEngine();
        let fileName = './resources/12345';
        let outputPath = './resources/1_output.mpg';
        let commandLine = ' -i '+fileName+' -y '+outputPath;
        return engine.transcodeFile(commandLine,fileName,outputPath).then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.equal("File [" + fileName + "] doesnt exists on the file system");
        });
    });

    it('test TranscodeingEngine - command line error', function() {

        let engine = new TrancodinfEngine('ffmpegg');
        let fileName = './resources/1';
        let outputPath = './resources/1_output.mpg';
        let commandLine = ' -i '+fileName+' -y '+outputPath;
        return engine.transcodeFile(commandLine,fileName,outputPath).then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.be.an('error');
        });
    });

    it('test TranscodeingEngine - library doest exist in save path', function() {
        let engine = new TrancodinfEngine('ffmpeg');
        let fileName = './resources/1';
        let outputPath = './resources/test/1_output.mpg';
        let commandLine = ' -i '+fileName+' -y '+outputPath;
        return engine.transcodeFile(commandLine,fileName,outputPath).then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.equal("[./resources/test] doesnt exists on the file system");
        });
    });
    
});
