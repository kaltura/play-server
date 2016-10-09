/**
 * This is a unit test to validate proper functionality of the KalturaFFMpegCmdGenerator class
 */
const chai = require('chai');
const expect = chai.expect;
const continuationLocalStorage = require('continuation-local-storage');
const clsBluebird = require('cls-bluebird');
const KalturaFFMpegCmdGenerator = require('../../lib/utils/KalturaFFMpegCmdGenerator');
const kalturaTypes = require('../../lib/client/KalturaTypes');
const ApiClientConnector = require('../../lib/infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../../lib/utils/KalturaMediaInfo');
const KalturaMediaInfoResponse = require('../../lib/utils/KalturaMediaInfoResponse');

const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const flavorId = KalturaConfig.config.testing.flavorId;
const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const outputPath = KalturaConfig.config.testing.outputPath;
const info = new KalturaMediaInfo('ffprobe');
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
let response = null;
function removeWhiteSpaces(text){
	return text.replace(/ /g,'');
}


describe('test KalturaFFMpegCmdGenerator', function () {
	before(function() {
		const namespace = continuationLocalStorage.createNamespace('play-server');//Here just to make sure we create it only once
		clsBluebird(namespace);
	});
	it('test - get mediaInfo for ad', function () {
		return info.mediaInfoExec(resourcesPath + '/adSample').then(function (data) {
			expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
			expect(removeWhiteSpaces(data.jsonInfo).substring(0, 20)).to.equal('{"programs":[],"stre');
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
			//to check with no cache:
			//expect(err).to.have.property('response');
			//expect(err.response).to.not.equal('').and.not.equal(null);
			expect(err).to.be.null;
		});
	});

	it('test - get command line via Api call', function() {
		const filePath = resourcesPath + '/adSample';
		const outputFilePath = outputPath + '/adSample_output.mpg';
		return KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, response.jsonInfo, 15, connector, KalturaConfig.config.testing.impersonatePartnerId).then(function (data) {
			expect(data).to.not.be.null;
			const cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, filePath, outputFilePath);
			expect(cmdLine).to.not.be.null;
		}, function (err) {
			if (!err)
				expect(true).to.be.true;
			else {
				expect(err).to.have.property('response');
				const cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(err.response, filePath, outputFilePath);
				expect(cmdLine).to.not.be.null;
			}
		});
	});

	it('test - check fill command ', function()
	{
		let format = 'File: __inFileName__ out File: __outFileName__';
		let cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(format, '/dev/zero/1.1', '/opt/tmp/2.2');
		expect(cmdLine).to.equal('File: /dev/zero/1.1 out File: /opt/tmp/2.2');
		format = 'File: __inFileName__';
		cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(format, '/dev/zero/1.1', '/opt/tmp/2.2');
		expect(cmdLine).to.equal('File: /dev/zero/1.1');
		cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(format, '/dev/zero/1.1', null);
		expect(cmdLine).to.equal('File: /dev/zero/1.1');
		format = 'out File: __outFileName__';
		cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(format, '/dev/zero/1.1', '/opt/tmp/2.2');
		expect(cmdLine).to.equal('out File: /opt/tmp/2.2');
		cmdLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(format, null, '/opt/tmp/2.2');
		expect(cmdLine).to.equal('out File: /opt/tmp/2.2');

	})
});
