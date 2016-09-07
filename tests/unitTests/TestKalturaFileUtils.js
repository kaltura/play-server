/**
* This is a unit test to validate proper functionality of the KalturaFileUtils class
*/
const chai = require('chai');
const expect = chai.expect;
const KalturaFileUtils = require('../../lib/utils/KalturaFileUtils');
require('../../lib/utils/KalturaUtils');
require('../../lib/utils/KalturaConfig');
const testDirPath = KalturaConfig.config.fileUtils.dirPath;
const testFilePath = KalturaConfig.config.fileUtils.filePath;
const day = KalturaConfig.config.fileUtils.day;
const month = KalturaConfig.config.fileUtils.month;
const year = KalturaConfig.config.fileUtils.year;
const prefix = KalturaConfig.config.fileUtils.prefix;
const suffix = KalturaConfig.config.fileUtils.suffix;

describe('test KalturaFileUtils class', function () {
	it('test KalturaFileUtils - delete file modified before given date', function () {
		return KalturaFileUtils.deleteOldFiles(testDirPath, day, month, year).then(function (data) {
			expect(data).to.not.be.null;
			expect(data).to.be.instanceof(Array);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaFileUtils - touch file to updated modified time', function () {
		return KalturaFileUtils.touchFile(testFilePath).then(function (data) {
			expect(data).to.equal('');
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaFileUtils - find file with given prefix and optional suffix', function () {
		return KalturaFileUtils.findFile(testDirPath, prefix, suffix).then(function (data) {
			expect(data).to.not.be.null;
		}, function (err) {
			if (err != null)
				expect(err).to.equal('Error - found more then one match');//if found more then one
			else
				expect(err).to.be.null; //if not found
		});
	});
});

