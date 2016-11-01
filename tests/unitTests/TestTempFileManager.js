/**
 * This is a unit test to validate proper functionality of the KalturaTempFileHandler class
 */

const chai = require('chai');
const expect = chai.expect;
const KalturaTempFileHandler = require('../../lib/utils/KalturaTempFileHandler');
require('../../lib/dataObjects/PlayServerConstants');
require('../../lib/utils/KalturaConfig');
require('../../lib/utils/KalturaLogger');

const fileReady = KalturaConfig.config.testing.resourcesPath + '/fileReady';
const fileProcessing = KalturaConfig.config.testing.resourcesPath + '/fileProcessing';
const fileDoesntExist = KalturaConfig.config.testing.resourcesPath + '/fileDoesntExist';

describe('test KalturaTempFileHandler class', function () {
	this.timeout(0);
	it('test KalturaTempFileHandler - getFileStatus READY', function () {
		return KalturaTempFileHandler.getFileStatus(fileReady).then(function (data) {
			expect(data).to.equal(FILE_STATUS.READY);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaTempFileHandler - getFileStatus PROCESSING', function () {
		return KalturaTempFileHandler.getFileStatus(fileProcessing).then(function (data) {
			expect(data).to.equal(FILE_STATUS.PROCESSING);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaTempFileHandler - getFileStatus DOESNT_EXIST', function () {
		return KalturaTempFileHandler.getFileStatus(fileDoesntExist).then(function (data) {
			expect(data).to.equal(FILE_STATUS.DOESNT_EXIST);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
});

