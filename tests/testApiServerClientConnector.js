/**
 * This is a unit test to validate proper functionality of the ApiServerClientConnector class
 */
const chai = require('chai');
const expect = chai.expect;
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');
const Promise = require('bluebird');

const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
const uiConfId = KalturaConfig.config.testing.uiConfId;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;

describe('testApiClientConnector', function () {
	it('test session start', function () {
		return connector._startSession().then(function (data) {
			expect(data).to.not.be.null;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test api exception', function () {
		const falseConnector = new ApiClientConnector(partnerId, '12345678910111213abcdefghijklmno', kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
		return falseConnector._startSession().then(function(data) {
			expect(data).to.be.null;
		}, function (err) {
			expect(err).to.equal('KalturaAPIException Error while starting session for partner [-6]');
		});
	});

	it('test handleRequset with uiConf get action ', function () {
		return connector.handleRequset('uiConf', 'get', [uiConfId], impersonatePartnerId).then(function (data) {
			expect(data).to.have.property('objectType').and.equal('KalturaUiConf');
		}, function (err) {
			console.log(err);
			expect(err).to.be.null;
		});
	});

	it('test handleRequset with uiConf get action with timeout', function () {
		return connector.handleRequset('uiConf', 'get', [uiConfId], impersonatePartnerId).timeout(1).then(function (data) {
			expect(data).to.be.null;
		}, function (err) { //TimeoutError
			expect(err).to.be.an.instanceof(Promise.TimeoutError);
			expect(err.message).to.equal('operation timed out');
		});
	});
});
