const chai = require('chai');
const expect = chai.expect;
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');
const TranscodingHelper = require('../lib/managers/helpers/TranscodingHelper');

const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const flavorId = KalturaConfig.config.testing.flavorId;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const testsDirName = __dirname + '/output/';
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);

describe('testTranscodingHelper', function ()
{
	it('test get Adapted Transcoding Command', function (done)
	{
		TranscodingHelper.getAdaptedTranscodingCommand(flavorId, null, 30, connector, impersonatePartnerId, null, testsDirName).then(
			function (response) {
				console.log("\n1: " + JSON.stringify(response));
				expect(response.command.indexOf('/dev/zero')).to.not.equal(-1);
				done();
			},
			function (err) {
				console.log("Error from 1" + err);
				expect(err).to.equal(null);
				done();
			}
		);
	});

	it('test transcode And Save To Disk', function (done)
	{
		this.timeout(30000);
		TranscodingHelper.transcodeAndSaveToDisk(flavorId, null, 30, connector, impersonatePartnerId, null, testsDirName).then(
			function (response) {
				console.log("\n2: " + JSON.stringify(response));
				done();
			},
			function (err) {
				console.log("Error from 2" + err);
				expect(err).to.equal(null);
				done();
			}
		);
	});

	it('test transcode Ad To Disk', function (done)
	{
		this.timeout(30000);
		const adVideoFile = __dirname + '/resources/15SecAd.mp4';
		console.log('transcodeExistingFileToDisk test out path ' + testsDirName);
		TranscodingHelper.transcodeExistingFileToDisk(flavorId, connector, impersonatePartnerId, adVideoFile, testsDirName).then(
			function (outPath) {
				console.log("\n3: " +JSON.stringify(outPath));
				console.log(outPath);
				done();
			},
			function (err) {
				console.log("Error from 3" + err);
				expect(err).to.equal(null);
				done();
			}
		);
	});

	it('test transcode Black Filler To Disk', function (done)
	{
		this.timeout(30000);
		console.log('transcodeBlackFillerToDisk test');
		TranscodingHelper.transcodeBlackFillerToDisk(flavorId, 30, connector, impersonatePartnerId, testsDirName).then(
			function (outPath) {
				console.log("\n4: " +JSON.stringify(outPath));
				done();
			},
			function (err) {
				console.log("Error from 4" + err);
				expect(err).to.equal(null);
				done();
			}
		);
	});


});
