const os = require('os');
const util = require('util');
const fs = require('fs');
const chai = require('chai');
const child_process = require('child_process');
const kalturaClient = require('../../lib/client/KalturaClient');
const testingHelper = require('./../infra/testingHelper');
const config = require('../../lib/utils/KalturaConfig')

let Promise = require("bluebird");

const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const outputDir = KalturaConfig.config.testing.outputPath;
const beaconTrackingDir = outputDir  + '/beaconTracking';
const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const secretImpersonatePartnerId = KalturaConfig.config.testing.secretImpersonatePartnerId;

let playServerTestingHelper = testingHelper.PlayServerTestingHelper;
let sessionClient = null;
let cuePointList = [];
let entry = null;
let DoneMethod = null;

class PreRoleAdTester {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!PreRoleAdTester.validateQrResult(qrCodesResults[i])) {
					if (qrCodesResults[i].ad)
						errorsArray.push('FAIL - Found Ad thumb at time: [' + qrCodesResults[i].thumbTime + " seconds] from beginning of video but Ad cue point is not defined for that time");
					else
						errorsArray.push('FAIL - Found video thumb at time: [' + qrCodesResults[i].thumbTime + " seconds] from beginning of video but Ad cue point is defined for that time");
				}
			}
			if (errorsArray.length > 0) {
				for (let i = 0; i < errorsArray.length; i++)
					playServerTestingHelper.printError(errorsArray[i]);
				reject(false);
			} else {
				playServerTestingHelper.printOk('All Ads and Videos were Validated Successfully...');
				resolve(true);
			}
		});
	}

	static validateQrResult(qrCodeItem) {
		if (qrCodeItem.ad)
			return PreRoleAdTester.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
			return !PreRoleAdTester.isValidAd(qrCodeItem);
	}

	static isValidAd(qrCodeItem) {
		let timeInMillis = qrCodeItem.thumbTime * 1000;
		for (let i = 0; i < cuePointList.length; i++) {
			if (timeInMillis >= cuePointList[i].startTime && timeInMillis < (cuePointList[i].startTime + cuePointList[i].duration - 500)) {
				return true;
			}
		}
		return false;
	}

	runTest(input, resolve, reject) {
		playServerTestingHelper.generateThumbsFromM3U8Promise(input.m3u8Url, input.outputDir)
			.then(function () {
				playServerTestingHelper.getThumbsFileNamesFromDir(input.outputDir)
					.then(function (filenames) {
						playServerTestingHelper.readQrCodesFromThumbsFileNames(input.outputDir, filenames, function (results) {
								playServerTestingHelper.printStatus('1st Attempt - Validating Ads and Videos according to CuePoints. Expected To pass or fail on first try to play Ad at starting of video');
								PreRoleAdTester.ValidateAll(results).then(function () {
										playServerTestingHelper.printStatus('Pre-role Ad was played on first attempt.');
										resolve(true);
									}
									, function (results) {
										playServerTestingHelper.printStatus('Pre-role Ad weren\'t played on first attempt.');
										PreRoleAdTester.runTest2ndAttempt(input, resolve, reject);
									})
									.catch(function () {
										reject(false);
									});
							})
							.catch(function () {
								reject(false);
							});
					});

			}).catch(function () {
			reject(false);
		});
	}



	static runTest2ndAttempt(input, resolve, reject) {

		playServerTestingHelper.printStatus('2st Attempt - Validating Ads and Videos according to CuePoints. Expected To Succeed and play Ad at starting of video');

		playServerTestingHelper.cleanFolder(input.outputDir);

		input.outputDir = outputDir +'/attempt2/';

		if (!fs.existsSync(input.outputDir))
			fs.mkdirSync(input.outputDir);

		playServerTestingHelper.generateThumbsFromM3U8Promise(input.m3u8Url, input.outputDir)
			.then(function () {
				playServerTestingHelper.getThumbsFileNamesFromDir(input.outputDir)
					.then(function (filenames) {
						playServerTestingHelper.readQrCodesFromThumbsFileNames(input.outputDir, filenames, function (results) {
								playServerTestingHelper.printStatus('2nd Attempt - Validating Ads and Videos according to CuePoints. Expected To play Ads');
								PreRoleAdTester.ValidateAll(results).then(function () {
										playServerTestingHelper.printError('Pre-role Ad was played on first attempt.');
										playServerTestingHelper.printError('Ads were verified on 2nd attempt.');
										resolve(true);
									}
									, function (results) {
										playServerTestingHelper.printOk('2nd Attempt failed');
										reject(fail);
									})
									.catch(function () {
										reject(false);
									});
							})
							.catch(function () {
								reject(false);
							});
					});
			}).catch(function () {
			reject(false);
		});
	}
}



describe('test full flow', function () {
	it('test - Pre Role Ad', function (done) {
		this.timeout(180000);
		DoneMethod = done;
		playServerTestingHelper.initTestHelper(serviceUrl, impersonatePartnerId, secretImpersonatePartnerId);
		playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
	});
});

function finishTest(res){
	if (res)
		playServerTestingHelper.printOk("test SUCCESS");
	else
		playServerTestingHelper.printError("test FAIL");
	playServerTestingHelper.deleteEntry(sessionClient,entry).then(function (results) {
		playServerTestingHelper.printInfo("return from delete entry");
		if (res)
			DoneMethod();
		else
			DoneMethod('Test failed');
	});
}


function testInit(client) {
	sessionClient = client;
	let testName = 'PreRoleAdTest';

	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	let aggregateAdTime = 0;
	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/1MinVideo.mp4")
		.then(function (resultEntry) {
			entry = resultEntry;
			// when bug is fixed please modify cue point start time to 0
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 2000, 15000);
		})
		.then(function (cuePoint) {
			cuePoint.startTime = 0; // Any ad that is set to the first two seconds of the movie will be set to the beginning (to time 0);
			aggregateAdTime += cuePoint.duration;//extra two seconds because we stitch the last two seconds to the end of the ad
			cuePointList.push(cuePoint);
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 20000, 15000);
		})
		.then(function (cuePoint) {
			cuePoint.startTime = cuePoint.startTime + aggregateAdTime;
			aggregateAdTime += cuePoint.duration + 2000;//extra two seconds because we stitch the last two seconds to the end of the ad
			cuePointList.push(cuePoint);
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 40000, 15000);
		})
		.then(function (cuePoint) {
			cuePoint.startTime = cuePoint.startTime + aggregateAdTime;
			aggregateAdTime += cuePoint.duration + 2000;//extra two seconds because we stitch the last two seconds to the end of the ad
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			playServerTestingHelper.warmupVideo(m3u8Url);
			let preRoleAdTester = new PreRoleAdTester();
			return playServerTestingHelper.testInvoker(testName, preRoleAdTester, input, 60000, finishTest);
		})
		.catch(playServerTestingHelper.printError);
}
