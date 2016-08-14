const os = require('os');
const util = require('util');
const fs = require('fs');
const child_process = require('child_process');
const kalturaClient = require('../lib/client/KalturaClient');
const testingHelper = require('./infra/testingHelper');
const config = require('../lib/utils/KalturaConfig')

let Promise = require("bluebird");

const resourcesPath = KalturaConfig.config.testClient.resourcesPath;
const outputDir = KalturaConfig.config.testClient.outputPath;
const beaconTrackingDir = outputDir  + '/beaconTracking';

let playServerTestingHelper = testingHelper.PlayServerTestingHelper;
let sessionClient = null;
let cuePointList = [];

class PreRoleAdTester {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!PreRoleAdTester.validateQrResult(qrCodesResults[i])) {
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
			return PreRoleAdTester.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
			return !PreRoleAdTester.isValidAd(qrCodeItem);
	}

	static isValidAd(qrCodeItem) {
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
								playServerTestingHelper.printStatus('1st Attempt - Validating Ads and Videos according to CuePoints. Expected To fail and not play Ad at starting of video');
								PreRoleAdTester.ValidateAll(results).then(function () {
										playServerTestingHelper.printError('Pre-role Ad was played on first attempt.');
										reject(fail);
									}
									, function (results) {
										playServerTestingHelper.printOk('1st Attempt failed as expected');
										playServerTestingHelper.printStatus('2st Attempt - Validating Ads and Videos according to CuePoints. Expected To Succeed and play Ad at starting of video');
										PreRoleAdTester.ValidateAll(results).then(function () {
											resolve(true);
										}, reject);
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

playServerTestingHelper.parseCommandLineOptionsAndRunTest(main);

function main(){
	playServerTestingHelper.printInfo("Starting Test for: ");
	playServerTestingHelper.printInfo('serverHost: [' + playServerTestingHelper.serverHost + '] partnerId: [' +  playServerTestingHelper.partnerId + '] adminSecret: [' + playServerTestingHelper.adminSecret + ']');
	playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
}

function testInit(client) {
	sessionClient = client;
	let entry;
	let testName = 'PreRoleAdTest';

	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/Video30Secs.mp4")
		.then(function (resultEntry) {
			entry = resultEntry;
			// when bug is fixed please modify cue point start time to 0
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 1000, 5000);
		})
		.then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			let preRoleAdTester = new PreRoleAdTester();
			return playServerTestingHelper.testInvoker(testName, preRoleAdTester, input);
		})
		.catch(playServerTestingHelper.printError);
}
