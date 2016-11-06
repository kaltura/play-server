const chai = require('chai');
const expect = chai.expect;
const kalturaTypes = require('../../lib/client/KalturaTypes');
const ApiClientConnector = require('../../lib/infra/ApiServerClientConnector');
const TranscodingHelper = require('../../lib/managers/helpers/TranscodingHelper');

const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const flavorId = KalturaConfig.config.testing.transcodedFlavorId;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const adVideoFile = KalturaConfig.config.testing.resourcesPath + '/15SecAd.mp4';
const outputPath = KalturaConfig.config.testing.outputPath;
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);

const continuationLocalStorage = require('continuation-local-storage');
const namespace = continuationLocalStorage.createNamespace('play-server');//Here just to make sure we create it only once

describe('testTranscodingHelper', function ()
{
	this.timeout(0);
	it('test get Adapted Transcoding Command', function (done)
	{
		TranscodingHelper.getAdaptedTranscodingCommand(flavorId, null, 30, connector, impersonatePartnerId, null, outputPath, false).then(
			function (response) {
				expect(response.command.indexOf('/dev/zero')).to.not.equal(-1);
				done();
			},
			function (err) {
				expect(err).to.equal(null);
				done();
			}
		);
	});

	it('test transcode And Save To Disk', function (done)
	{
		this.timeout(30000);
		TranscodingHelper.transcodeAndSaveToDisk(flavorId, null, 30, connector, impersonatePartnerId, null, outputPath, false).then(
			function (response) {
				done();
			},
			function (err) {
				expect(err).to.equal(null);
				done();
			}
		);
	});

	it('test transcode Ad To Disk', function (done)
	{
		this.timeout(30000);
		TranscodingHelper.transcodeExistingFileToDisk(flavorId, connector, impersonatePartnerId, adVideoFile, adVideoFile, null, false).then(
			function (outPath) {
				done();
			},
			function (err) {
				expect(err).to.equal(null);
				done();
			}
		);
	});

	it('test transcode Black Filler To Disk', function (done)
	{
		this.timeout(30000);
		TranscodingHelper.transcodeBlackFillerToDisk(flavorId, 30, connector, impersonatePartnerId, outputPath).then(
			function (outPath) {
				done();
			},
			function (err) {
				expect(err).to.equal(null);
				done();
			}
		);
	});
});
