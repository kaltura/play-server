const chai = require('chai');
const continuationLocalStorage = require('continuation-local-storage');
const clsBluebird = require('cls-bluebird');
const expect = chai.expect;
const kalturaTypes = require('../../lib/client/KalturaTypes');
const ApiClientConnector = require('../../lib/infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../../lib/utils/KalturaMediaInfo');
const TrancodinfEngine = require('../../lib/infra/TranscodingEngine');
const KalturaFFMpegCmdGenerator = require('../../lib/utils/KalturaFFMpegCmdGenerator');
const KalturaMediaInfoResponse = require('../../lib/utils/KalturaMediaInfoResponse');
const TranscodingEngineResponse = require('../../lib/infra/TranscodingEngineResponse');
const KalturaTempFileHandler = require('../../lib/utils/KalturaTempFileHandler');

const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const flavorId = KalturaConfig.config.testing.transcodedFlavorId;
const filePath = KalturaConfig.config.testing.resourcesPath + '/adSample';
const outPath = KalturaConfig.config.testing.outputPath + '/adSample_output.mpg';
const tempOutputPath = KalturaTempFileHandler._getTempFilePath(outPath);
const info = new KalturaMediaInfo('ffprobe');
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
let response = null;
let commandLine = null;
function removeWhiteSpaces(text){
	return text.replace(/ /g,'');
}

describe('test the flow of ad transcode', function () {
	before(function() {
		const namespace = continuationLocalStorage.createNamespace('play-server');//Here just to make sure we create it only once
		clsBluebird(namespace);
	});
	this.timeout(0);
	it('test - get mediaInfo for ad', function () {
		return info.mediaInfoExec(filePath).then(function (data) {
			expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
			expect(removeWhiteSpaces(data.jsonInfo).substring(0, 20)).to.equal('{"programs":[],"stre');
			response = data;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test - get command line via Api call', function () {
		// 15 is the duration of /adSample
		return KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, response.jsonInfo, 15, connector, KalturaConfig.config.testing.impersonatePartnerId).then(function (data) {
			expect(data).to.not.be.null;
			commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, filePath, tempOutputPath);
			expect(commandLine).to.not.be.null;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {
		const engine = new TrancodinfEngine('ffmpeg');
		return engine.transcodeFile(commandLine, flavorId, outPath).then(function (data) {
			expect(data).to.be.an.instanceof(TranscodingEngineResponse);
			expect(data.pathToLogFile).to.equal(`${KalturaConfig.config.logger.convertLogDir}/${flavorId}_adSample_output.mpg.log`);
			expect(data.pathToAdFile).to.equal(outPath);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
});
