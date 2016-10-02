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

class TestFullFlowSingleCuePoint {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!TestFullFlowSingleCuePoint.validateQrResult(qrCodesResults[i])) {
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
			return TestFullFlowSingleCuePoint.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
			return !TestFullFlowSingleCuePoint.isValidAd(qrCodeItem);
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
							TestFullFlowSingleCuePoint.ValidateAll(results).then(function () {
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

	//function validateTrackedBeaconsFile() {
//	playServerTestingHelper.printInfo("Start validateTrackedBeaconsFile");
//
//	if (fs.existsSync(beaconTrackingDir + '/beaconTracking.txt')) {
//		var array = fs.readFileSync(beaconTrackingDir + '/beaconTracking.txt').toString().split("\n");
//		for (i in array)
//			playServerTestingHelper.printStatus(array[i]);
//	}else {
//		playServerTestingHelper.printError("Can't read " + beaconTrackingDir + '/beaconTracking.txt - file doesn\'t exists');
//	}
//}

}


let numOfTests = 4;
describe('test full flow', function () {
	it('test - Single Cue Point', function (done) {
		this.timeout(90000 + 30000 * numOfTests);
		DoneMethod = done;
		playServerTestingHelper.initTestHelper(serviceUrl, impersonatePartnerId, secretImpersonatePartnerId);
		playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
	});
});

let testCounter = 0;
function finishTest(res){
	testCounter += 1;
	if (res)
		playServerTestingHelper.printOk("test num " + testCounter + " SUCCESS");
	else
		playServerTestingHelper.printError("test num " + testCounter + " FAIL");
	if (testCounter == numOfTests)
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
	let testFullFlowSingleCuePoint = new TestFullFlowSingleCuePoint();
	let testName = 'TestFullFlowSingleCuePoint';
	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	if (!fs.existsSync(beaconTrackingDir))
		fs.mkdirSync(beaconTrackingDir);

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
			for (let i = 0; i < numOfTests; i++)
			{
				const secondm3u8 = m3u8Url;
				const input = [];
				input.m3u8Url = m3u8Url;
				input.outputDir = videoThumbDir;
				const y = i;
				videoThumbDir = outputDir + '/' + testName + y + '/';
				input.outputDir = videoThumbDir;
				if (!fs.existsSync(videoThumbDir))
					fs.mkdirSync(videoThumbDir);
				// every minute let it run again
				let myArray = secondm3u8.split('sessionId');
				if (myArray.length !== 2){
					throw new Error('only single sessionId allowed');
				}
				let suffix = myArray[1].substr(myArray[1].indexOf('/v/2/'));
				input.m3u8Url = myArray[0] + 'sessionId/' + Math.floor(Math.random() * 50000000) + suffix;
				playServerTestingHelper.warmupVideo(input.m3u8Url);
				console.log('test ' + y);
				const testFullFlowSingleCuePoint = new TestFullFlowSingleCuePoint();
				playServerTestingHelper.testInvoker(testName, testFullFlowSingleCuePoint, input, ((y * 5000) + 60000), finishTest);
			}
		})
		.catch(playServerTestingHelper.printError);
}
