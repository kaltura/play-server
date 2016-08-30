/**
 * This is a unit test to validate proper functionality of the TranscodeingEngine class
 */
const chai = require('chai');
const expect = chai.expect;
const TranscodingEngineResponse = require('../lib/infra/TranscodingEngineResponse');
const TrancodinfEngine = require('../lib/infra/TranscodingEngine');
const path = require('path');
const testDirName = __dirname;

const fileName = `${testDirName}/resources/adSample`;
const outputPath = `${testDirName}/resources/adSample_output.mpg`;
const engine = new TrancodinfEngine('ffmpeg');
const commandLine = ` -i ${fileName} -y ${outputPath}`;

describe('test TranscodeingEngine class', function () {
	this.timeout(0);
	it('test TranscodeingEngine - validate files path exists', function () {
		return TrancodinfEngine.validateFilePaths(fileName, outputPath).then(function (data) {
			expect(data).to.be.true;
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test TranscodeingEngine - transcode file using ffmpeg and save output', function () {
		return engine.transcodeFile(commandLine).then(function (data) {
			expect(data).to.be.an.instanceof(TranscodingEngineResponse);
			expect(data.transcoderResponse.substring(0, 66)).to.equal('ffmpeg version 2.7.2 Copyright (c) 2000-2015 the FFmpeg developers');
		}, function (err) {
			expect(err).to.be.null;
		});
	});

	it('test TranscodeingEngine - source file doest exist', function () {
		const badfileName = `${testDirName}/resources/12345`;
		return TrancodinfEngine.validateFilePaths(badfileName, outputPath).then(function (data) {
			expect(data).to.be.null;
		}, function (err) {
			expect(err).to.equal(`File [${badfileName}] doesn't exists on the file system`);
		});
	});

	it('test TranscodeingEngine - library doest exist in save path', function () {
		const badoutputPath = `${testDirName}/resources/test/adSample_output.mpg`;
		return TrancodinfEngine.validateFilePaths(fileName, badoutputPath).then(function (data) {
			expect(data).to.be.null;
		}, function (err) {
			expect(err).to.equal(`[${path.dirname(badoutputPath)}] doesn't exists on the file system`);
		});
	});

	it('test TranscodeingEngine - command line error', function() {
		const badengine = new TrancodinfEngine('ffmpegg');
		return badengine.transcodeFile(commandLine, fileName, outputPath).then(function (data) {
			expect(data).to.be.null;
		}, function (err) {
			expect(err).to.be.an('error');
		});
	});
});
