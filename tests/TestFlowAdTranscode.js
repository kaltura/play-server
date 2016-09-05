const chai = require('chai');
const expect = chai.expect;
const kalturaTypes = require('../lib/client/KalturaTypes');
const ApiClientConnector = require('../lib/infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../lib/utils/KalturaMediaInfo');
const TrancodinfEngine = require('../lib/infra/TranscodingEngine');
const KalturaFFMpegCmdGenerator = require('../lib/utils/KalturaFFMpegCmdGenerator');
const KalturaMediaInfoResponse = require('../lib/utils/KalturaMediaInfoResponse');
const TranscodingEngineResponse = require('../lib/infra/TranscodingEngineResponse');


const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const secret = KalturaConfig.config.testing.secret;
const partnerId = KalturaConfig.config.testing.partnerId;
const flavorId = KalturaConfig.config.testing.flavorId;
const filePath = KalturaConfig.config.testing.resourcesPath + '/adSample';
const outPath = KalturaConfig.config.testing.outputPath + '/adSample_output.mpg';
const info = new KalturaMediaInfo('ffprobe');
const connector = new ApiClientConnector(partnerId, secret, kalturaTypes.KalturaSessionType.ADMIN, serviceUrl);
let response = null;
let commandLine = null;

describe('test the flow of ad transcode', function () {
	this.timeout(0);
	it('test - get mediaInfo for ad', function () {
		return info.mediaInfoExec(filePath).then(function (data) {
			expect(data).to.be.an.instanceof(KalturaMediaInfoResponse);
			expect(data.jsonInfo.substring(0, 40)).to.equal('{    "programs": [    ],    "streams": [');
			response = data;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test - get command line via Api call', function () {
		// 15 is the duration of /adSample
		return KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, response.jsonInfo, 15, connector, KalturaConfig.config.testing.impersonatePartnerId).then(function (data) {
			expect(data).to.not.be.null;
			commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, filePath, outPath);
			expect(commandLine).to.not.be.null;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {
		const engine = new TrancodinfEngine('ffmpeg');
		return engine.transcodeFile(commandLine, filePath, outPath).then(function (data) {
			expect(data).to.be.an.instanceof(TranscodingEngineResponse);
			expect(data.transcoderResponse.substring(0, 66)).to.equal('ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers');
		}, function (err) {
			expect(err).to.be.null;
		});
	});
});
