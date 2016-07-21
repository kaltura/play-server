/**
 * This is a unit test to validate proper functionality of the KalturaFFMpegCmdGenerator class
 */
const chai = require('chai');
const expect = chai.expect;
const KalturaFFMpegCmdGenerator = require('../lib/utils/KalturaFFMpegCmdGenerator');
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../lib/utils/KalturaMediaInfo');
const KalturaMediaInfoResponse = require('../lib/utils/KalturaMediaInfoResponse');

const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const testsDirName = __dirname;
const flavorId = KalturaConfig.config.testing.flavorId;
const info = new KalturaMediaInfo('ffprobe');
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
let response = null;

describe('test KalturaFFMpegCmdGenerator', function () {
	it('test - get mediaInfo for ad', function () {
		return info.mediaInfoExec(`${testsDirName}/resources/adSample`).then(function (data) {
			expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
			expect(data.jsonInfo.substring(0, 20)).to.equal('{"programs":[],"stre');
			response = data;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test - start client session', function() {
		return connector._startSession().then(function (data) {
			expect(data).to.not.be.null;
			expect(connector.client.getKs()).to.not.be.null;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test - get command line via Api call', function() {
		const filePath = `${testsDirName}/resources/adSample`;
		const outputPath = `${testsDirName}/resources/adSample_output.mpg`;
		return KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, response.jsonInfo, connector, KalturaConfig.config.testing.partnerImp).then(function (data) {
			const cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, filePath, outputPath);
			expect(data).to.not.be.null;
			expect(cmdLine).to.not.be.null;
		}, function (err) {
			expect(err).to.be.null;
		});
	});
});
