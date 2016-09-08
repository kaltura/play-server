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
const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const secretImpersonatePartnerId = KalturaConfig.config.testing.secretImpersonatePartnerId;

let playServerTestingHelper = testingHelper.PlayServerTestingHelper;
let sessionClient = null;
let cuePointList = [];
let videoTimings = [];

class LengthOfVideoWithAdTest {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!LengthOfVideoWithAdTest.validateQrResult(qrCodesResults[i])) {
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
			return LengthOfVideoWithAdTest.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
		{
			videoTimings.push(qrCodeItem.contentTime);
			return !LengthOfVideoWithAdTest.isValidAd(qrCodeItem);
		}
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

	static validateLengthOfVideo() {
		return new Promise(function (resolve, reject) {
			if (videoTimings.length != 31) {
				playServerTestingHelper.printError("Video content length should be 60 Seconds (31 thumbs) but received only :  " + videoTimings.length);
				reject(false);
				return;
			}
			var sorted_arr = videoTimings.slice().sort();

			for (var i = 0; i < sorted_arr.length - 1; i++) {
				if (sorted_arr[i + 1] == sorted_arr[i]) {
					playServerTestingHelper.printError("Found duplicated video thumbs at video content time:  " + sorted_arr[i + 1]);
					reject(false);
				}
			}
			playServerTestingHelper.printOk("All video thumb received successfully and were unique without any duplicates.");
			resolve(true);
		});
	}

	runTest(input, resolve, reject) {
		playServerTestingHelper.generateThumbsFromM3U8Promise(input.m3u8Url, input.outputDir)
			.then(function () {
				playServerTestingHelper.getThumbsFileNamesFromDir(input.outputDir)
					.then(function (filenames) {
						playServerTestingHelper.readQrCodesFromThumbsFileNames(input.outputDir, filenames, function (results) {
							LengthOfVideoWithAdTest.ValidateAll(results).then(function () {
									 LengthOfVideoWithAdTest.validateLengthOfVideo().then(function () {
											resolve(true);
										 } , function () {
											 reject(false);
										 });
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



let DoneMethod;
describe('test full flow', function () {
	it('test - Length Of Video With Ad', function (done) {
		this.timeout(180000);
		DoneMethod = done;
		playServerTestingHelper.initTestHelper(serviceUrl, impersonatePartnerId, secretImpersonatePartnerId);
		playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
	});
});
function finishTest(res){
	chai.expect(res).to.be.true;
	DoneMethod();
}

function testInit(client) {
	sessionClient = client;
	let entry;
	let testName = 'LengthOfVideoWithAdTest.js';

	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/1MinVideo.mp4")
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 30000, 15000);
		})
		.then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			let lengthOfVideoWithAdTest = new LengthOfVideoWithAdTest();
			return playServerTestingHelper.testInvoker(testName, lengthOfVideoWithAdTest, input, finishTest);
		})
		.catch(playServerTestingHelper.printError);
}