
const chai = require('chai');
const expect = chai.expect;
const KalturaMediaInfo = require('../lib/utils/KalturaMediaInfo');
const KalturaMediaInfoResponse = require('../lib/utils/KalturaMediaInfoResponse');

/**
 * This is a unit test to validate proper functionality of the KalturaMediaInfo class
 */

describe('test KalturaMediaInfo class', function() {

    it('test KalturaMediaInfo - get media info for a file that exist', function() {

        let info = new KalturaMediaInfo('ffprobe');

        return info.mediaInfoExec('./resources/1').then(function(data){
            expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
            expect(data.jsonInfo.substring(0,20)).to.equal("{\"programs\":[],\"stre");

        }, function(err){ // error handling
            expect(err).to.be.null;
        });
    });

    it('test KalturaMediaInfo - file doesnt exist', function() {

        let fileName = './resources/12345';
        let info = new KalturaMediaInfo();

        return info.mediaInfoExec(fileName).then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.equal("File [" + fileName + "] doesnt exists on the file system");
        });
    });

    it('test KalturaMediaInfo - command line error', function() {

        let info = new KalturaMediaInfo('ffrobb');

        return info.mediaInfoExec('./resources/1').then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.be.an('error');
        });
    });

    it('test KalturaMediaInfo - emptyFile', function() {

        let info = new KalturaMediaInfo('ffprobe');
        return info.mediaInfoExec('./resources/emptyFile').then(function(data){
            expect(data).to.be.null;
        }, function(err){ // error handling
            expect(err).to.not.be.null;
            expect(err.message.substring(0,25)).to.equal("Command failed: ffprobe -");
        });
    });

});
