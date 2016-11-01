/**
 * This is a unit test to validate proper functionality of the KalturaTempFileManager class
 */

const chai = require('chai');
const expect = chai.expect;
const KalturaTempFileManager = require('../../lib/utils/KalturaTempFileManager');
require('../../lib/dataObjects/PlayServerConstants');
require('../../lib/utils/KalturaConfig');
require('../../lib/utils/KalturaLogger');

const fileReady = KalturaConfig.config.testing.resourcesPath + '/fileReady';
const fileProcessing = KalturaConfig.config.testing.resourcesPath + '/fileProcessing';
const fileDoesntExist = KalturaConfig.config.testing.resourcesPath + '/fileDoesntExist';

describe('test KalturaTempFileManager class', function () {
	this.timeout(0);
	it('test KalturaTempFileManager - getFileStatus READY', function () {
		return KalturaTempFileManager.getFileStatus(fileReady).then(function (data) {
			expect(data).to.equal(FILE_STATUS.READY);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaTempFileManager - getFileStatus PROCESSING', function () {
		return KalturaTempFileManager.getFileStatus(fileProcessing).then(function (data) {
			expect(data).to.equal(FILE_STATUS.PROCESSING);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaTempFileManager - getFileStatus DOESNT_EXIST', function () {
		return KalturaTempFileManager.getFileStatus(fileDoesntExist).then(function (data) {
			expect(data).to.equal(FILE_STATUS.DOESNT_EXIST);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
});

