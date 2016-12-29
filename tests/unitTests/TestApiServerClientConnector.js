/**
 * This is a unit test to validate proper functionality of the ApiServerClientConnector class
 */
const chai = require('chai');
const expect = chai.expect;
const continuationLocalStorage = require('continuation-local-storage');
const clsBluebird = require('cls-bluebird');
const kalturaTypes = require('../../lib/client/KalturaTypes');
const ApiClientConnector = require('../../lib/infra/ApiServerClientConnector');
require('../../lib/utils/KalturaConfig');
const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const uiConfId = KalturaConfig.config.testing.uiConfId;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const flavorId = KalturaConfig.config.testing.transcodedFlavorId;
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);

describe('testApiClientConnector', function () {
	before(function() {
		const namespace = continuationLocalStorage.createNamespace('play-server');//Here just to make sure we create it only once
		clsBluebird(namespace);
	});
	it('test api exception', function () {
		const wrongSecret = '123456789abcdefghi';
		const falseConnector = new ApiClientConnector(partnerId, wrongSecret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
		return falseConnector._startSession().then(function (data) {
			expect(data).to.be.null;
		}, function (err) {
			if (typeof(err) == 'string')
				expect(err).to.equal('KalturaAPIException Error while starting session for partner [-6]');
			else { // because this mean we had cache fault but not actual fault
				expect(err.objectType).to.equal('KalturaAPIException');
				expect(err.message).to.equal('Error while starting session for partner [-6]');
			}
		});
	});
	it('test session start', function () {
		return connector._startSession().then(function (data) {
			expect(data).to.not.be.null;
		}, function (err) {
			if (!err)
				expect(true).to.equal.true; // because it mean err == null
			else {
				expect(err.response).to.not.be.null;
				expect(err.response).to.not.equal('undifined');
				expect(err.response).to.not.equal('');
				// because this mean we had cache fault but not actual fault
			}
		});
	});
	it('test handleApiRequest with uiConf get action ', function () {
		return connector.handleApiRequest('uiConf', 'get', [uiConfId], impersonatePartnerId).then(function (data) {
			expect(data).to.have.property('objectType').and.equal('KalturaUiConf');
		}, function (err) {
			if (!err)
				expect(true).to.equal.true; // because it mean err == null
			else {
				expect(err).to.have.property('response');
				expect(err.response).to.have.property('objectType').and.equal('KalturaUiConf');
				// because this mean we had cache fault but not actual fault
			}
		});
	});

	it('test setValueInCache  ', function () {
		const params = { apiCallService: 'someService', apiCallAction: 'someAction', params: [199], impersonatePartnerId: 101 };
		const res = { member1: 'val1', member2: 'val2' };
		return ApiClientConnector._setValueInCache({ cacheParams: params, response: res }).then(function (data) {
			expect(data.response).to.have.property('member1').and.equal('val1');
			expect(data.response).to.have.property('member2').and.equal('val2');
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test getValueFromCache  ', function () {
		const params = { apiCallService: 'someService', apiCallAction: 'someAction', params: [199], impersonatePartnerId: 101};
		return ApiClientConnector._getValueFromCache(params).then(
			function (data) {
				expect(data.response).to.have.property('member1').and.equal('val1');
				expect(data.response).to.have.property('member2').and.equal('val2');
			}, function (err) {
				expect(err).to.be.null;
			}
		);
	});


	it('test handleApiRequest with flavorId get action', function () {
		return connector.handleApiRequest('flavorAsset', 'get', [flavorId], impersonatePartnerId).then(function (data) {
			expect(data).not.to.be.null;
		}, function (err) {
			if (!err)
				expect(true).to.equal.true; // because it mean err == null
			else {
				expect(err).to.have.property('response');
				expect(err.response).to.have.property('objectType').and.equal('KalturaFlavorAsset');
				// because this mean we had cache fault but not actual fault
			}
		});
	});
});
