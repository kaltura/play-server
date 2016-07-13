
const chai = require('chai');
const expect = chai.expect;
const KalturaMediaInfo = require('../lib/utils/KalturaMediaInfo');
const KalturaMediaInfoResponse = require('../lib/utils/KalturaMediaInfoResponse');

/**
 * This is a unit test to validate proper functionality of the KalturaMediaInfo class
 */

describe('test KalturaMediaInfo class', function() {

    let testsDirName = __dirname;

    it('test KalturaMediaInfo - get media info for a file that exist', function() {

        let info = new KalturaMediaInfo('ffprobe');
        return info.mediaInfoExec(testsDirName + '/resources/1').then(function(data){
            expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
            expect(data.jsonInfo.substring(0,20)).to.equal("{\"programs\":[],\"stre");
        }, function(err){
            expect(err).to.be.null;
        });
    });

    it('test KalturaMediaInfo - file doesn\'t exist', function() {

        let fileName = testsDirName +'/resources/12345';
        let info = new KalturaMediaInfo();
        return info.mediaInfoExec(fileName).then(function(data){
            expect(data).to.be.null;
        }, function(err){
            expect(err).to.equal("File [" + fileName + "] doesn't exists on the file system");
        });
    });

    it('test KalturaMediaInfo - command line error', function() {

        let info = new KalturaMediaInfo('ffrobb');
        return info.mediaInfoExec(testsDirName +'/resources/1').then(function(data){
            expect(data).to.be.null;
        }, function(err){
            expect(err).to.be.an('error');
        });
    });

    it('test KalturaMediaInfo - emptyFile', function() {

        let info = new KalturaMediaInfo('ffprobe');
        return info.mediaInfoExec(testsDirName + '/resources/emptyFile').then(function(data){
            expect(data).to.be.null;
        }, function(err){
            expect(err).to.not.be.null;
            expect(err.message.substring(0,25)).to.equal("Command failed: ffprobe -");
        });
    });

});
