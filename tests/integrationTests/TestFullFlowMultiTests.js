const os = require('os');
const util = require('util');
const fs = require('fs');
const chai = require('chai');
const child_process = require('child_process');
const kalturaClient = require('../../lib/client/KalturaClient');
const testingHelper = require('./../infra/testingHelper');
const config = require('../../lib/utils/KalturaConfig');

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

class TestFullFlowMultiTests {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!TestFullFlowMultiTests.validateQrResult(qrCodesResults[i])) {
					if (qrCodesResults[i].ad)
						errorsArray.push('FAIL - Found Ad thumb at time: [' + qrCodesResults[i].thumbTime + " seconds] from beginning if video but Ad cue point is not defined for that time");
					else
						errorsArray.push('FAIL - Found video thumb at time: [' + qrCodesResults[i].thumbTime + " seconds] from beginning if video but Ad cue point is defined for that time");
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
			return TestFullFlowMultiTests.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
			return !TestFullFlowMultiTests.isValidAd(qrCodeItem);
	}

	static isValidAd(qrCodeItem){
		let timeInMillis = qrCodeItem.thumbTime * 1000;
		for (let i = 0; i < cuePointList.length; i++) {
			if (timeInMillis >= cuePointList[i].startTime && timeInMillis < (cuePointList[i].startTime + cuePointList[i].duration)) {
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
							TestFullFlowMultiTests.ValidateAll(results).then(function () {
									resolve(true);
								}
								, reject);
						}, reject);
					}).catch(function () {
					reject(false);
				});
			})
			.catch(function () {
				reject(false);
			});
	}

}


describe('test full flow multi test', function () {
	it('test - video with no ads', function (done) {
		this.timeout(240000);
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


//var exec = require('child_process').execSync; //exec('pwd', {stdio:[0,1,2]});
function testInit(client) {
	cuePointList = [];
	sessionClient = client;
	let testFullFlowMultiTests = new TestFullFlowMultiTests();
	let testName1 = 'TestFullFlowMultiTests1';
	let testName2 = 'TestFullFlowMultiTests2';
	let videoThumbDir1 = outputDir + '/' + testName1 +'/';
	let videoThumbDir2 = outputDir + '/' + testName2 +'/';

	let m3u8Urls = [];
	let videoThumbDirs = [];
	let testNames = [];
	let waitBeforeRunningTests = [];

	testNames.push(testName1);
	testNames.push(testName2);
	videoThumbDirs.push(videoThumbDir1);
	videoThumbDirs.push(videoThumbDir2);
	waitBeforeRunningTests.push(null);
	waitBeforeRunningTests.push(null);

	if (!fs.existsSync(videoThumbDir1))
		fs.mkdirSync(videoThumbDir1);

	if (!fs.existsSync(videoThumbDir2))
		fs.mkdirSync(videoThumbDir2);

	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/1MinVideo.mp4", process.env.entryId)
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 30000, 15000);
		})
		.then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			m3u8Urls.push(m3u8Url);
			playServerTestingHelper.getVideoSecBySec(m3u8Url, 30, null);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			m3u8Urls.push(m3u8Url);

			playServerTestingHelper.getVideoSecBySec(input.m3u8Url, 30, function () {
				let testFullFlowMultiTests = new TestFullFlowMultiTests();
				playServerTestingHelper.runMultiTests(m3u8Urls, videoThumbDirs, testNames, testFullFlowMultiTests, waitBeforeRunningTests, finishTest);
			});
		})
		.catch(playServerTestingHelper.printError);
}
