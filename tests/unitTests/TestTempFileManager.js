/**
 * This is a unit test to validate proper functionality of the KalturaTranscodeFileNames class
 */

const chai = require('chai');
const expect = chai.expect;
//const TranscodingEngineResponse = require('../../lib/infra/TranscodingEngineResponse');
//const TrancodinfEngine = require('../../lib/infra/TranscodingEngine');
//const path = require('path');
//const testDirName = __dirname;
const KalturaTempFileManager = require('../../lib/utils/KalturaTempFileManager');
require('../../lib/dataObjects/PlayServerConstants');
require('../../lib/utils/KalturaConfig');
//const fileName = KalturaConfig.config.testing.resourcesPath + '/f7d5c6643bebe19b2ba8629a72030d12';
//const outputPath = KalturaConfig.config.testing.outputPath + '/adSample_output';

const fileReady = KalturaConfig.config.testing.resourcesPath + '/fileReady';
const fileProcessing = KalturaConfig.config.testing.resourcesPath + '/fileProcessing';
const fileDoesntExist = KalturaConfig.config.testing.resourcesPath + '/fileDoesntExist';

require('../../lib/utils/KalturaLogger');

//const engine = new TrancodinfEngine('ffmpeg');
//const commandLine = ` -i ${fileName} -y ${outputPath}`;

describe('test KalturaTranscodeFileNames class', function () {
	this.timeout(0);
	it('test KalturaTranscodeFileNames - getFileStatus READY', function () {
		return KalturaTempFileManager.getFileStatus(fileReady).then(function (data) {
			expect(data).to.equal(FILE_STATUS.READY);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaTranscodeFileNames - getFileStatus PROCESSING', function () {
		return KalturaTempFileManager.getFileStatus(fileProcessing).then(function (data) {
			expect(data).to.equal(FILE_STATUS.PROCESSING);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	it('test KalturaTranscodeFileNames - getFileStatus DOESNT_EXIST', function () {
		return KalturaTempFileManager.getFileStatus(fileDoesntExist).then(function (data) {
			expect(data).to.equal(FILE_STATUS.DOESNT_EXIST);
		}, function (err) {
			expect(err).to.be.null;
		});
	});
	// it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {
	// 	return engine.transcodeFile(commandLine).then(function (data) {
	// 		expect(data).to.be.an.instanceof(TranscodingEngineResponse);
	// 		expect(data.transcoderResponse.substring(0, 66)).to.equal('ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers');
	// 	}, function (err) {
	// 		expect(err).to.be.null;
	// 	});
	// });
	// it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {
	// 	return engine.transcodeFile(commandLine).then(function (data) {
	// 		expect(data).to.be.an.instanceof(TranscodingEngineResponse);
	// 		expect(data.transcoderResponse.substring(0, 66)).to.equal('ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers');
	// 	}, function (err) {
	// 		expect(err).to.be.null;
	// 	});
	// });
	//
	// it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {
	// 	return engine.transcodeFile(commandLine).then(function (data) {
	// 		expect(data).to.be.an.instanceof(TranscodingEngineResponse);
	// 		expect(data.transcoderResponse.substring(0, 66)).to.equal('ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers');
	// 	}, function (err) {
	// 		expect(err).to.be.null;
	// 	});
	// });
	//
	// it('test TranscodeingEngine - command line error', function() {
	// 	const badengine = new TrancodinfEngine('ffmpegg');
	// 	return badengine.transcodeFile(commandLine, fileName, outputPath).then(function (data) {
	// 		expect(data).to.be.null;
	// 	}, function (err) {
	// 		expect(err).to.be.an('error');
	// 	});
	// });
});

