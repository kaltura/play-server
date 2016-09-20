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
const beaconTrackingFile = outputDir  + '/beaconTracking.txt';
const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const secretImpersonatePartnerId = KalturaConfig.config.testing.secretImpersonatePartnerId;

let playServerTestingHelper = testingHelper.PlayServerTestingHelper;
let sessionClient = null;
let cuePointList = [];

class TestFullFlowMultiCuePoint {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!TestFullFlowMultiCuePoint.validateQrResult(qrCodesResults[i])) {
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
			return TestFullFlowMultiCuePoint.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
			return !TestFullFlowMultiCuePoint.isValidAd(qrCodeItem);
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
							TestFullFlowMultiCuePoint.ValidateAll(results).then(function () {
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

function validateTrackedBeaconsFile() {
	playServerTestingHelper.printInfo("Start validateTrackedBeaconsFile");
	if (fs.existsSync(beaconTrackingFile)) {
		var array = fs.readFileSync(beaconTrackingFile).toString().split('\n').map(function (line) {
			return line.trim();
		}).filter(Boolean);
		var flag = true;
		// those option are using in vastForBeaconPODTest
		let options = ['start', 'midpoint', 'firstQuartile', 'thirdQuartile', 'complete', 'impression'];
		array.forEach(function (line) {
			playServerTestingHelper.printStatus(line);
			let start = ('Tracked beacon: id: 10 of event Type: ').length;
			line = line.substring(start,line.length);
			let beaconTag = line.substring(0, line.indexOf(' '));
			if (options.indexOf(beaconTag) < 0)
				flag =  false;

		});
		playServerTestingHelper.printInfo('found ' + array.length + ' beacon Tracks');
		if (array.length == 12 && flag)  // this is the number of beacon for this test using vastForBeaconPODTest
			return true;
	} else {
		playServerTestingHelper.printError("Can't read " + beaconTrackingFile + ' - file doesn\'t exists');
		return false;
	}
}


let DoneMethod;
describe('test full flow', function () {
	it('test - Beacon POD Sending', function (done) {
		this.timeout(150000);
		DoneMethod = done;
		if (fs.existsSync(beaconTrackingFile))
			fs.unlinkSync(beaconTrackingFile);
		playServerTestingHelper.initTestHelper(serviceUrl, impersonatePartnerId, secretImpersonatePartnerId);
		playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
	});
});

let entry;
function finishTest(res){
        if (res)
                playServerTestingHelper.printOk("test SUCCESS");
        else
                playServerTestingHelper.printError("test FAIL");
        let res2 = validateTrackedBeaconsFile();
        if (res2)
                playServerTestingHelper.printOk("beacon validation SUCCESS");
        else
                playServerTestingHelper.printError("beacon validation FAIL");
        res = res && res2;
         playServerTestingHelper.deleteEntry(sessionClient,entry).then(function (results) {
                playServerTestingHelper.printInfo("return from delete entry");
                if (res)
                         DoneMethod();
        });
}

function testInit(client) {
	sessionClient = client;
	let testFullFlowMultiCuePoint = new TestFullFlowMultiCuePoint();
	let testName = 'fullFlowBeaconPODSendingTest';

	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/2MinVideo.mp4")
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 30000, 30500, 'vastForBeaconPODTest');
		})
		.then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			let testFullFlowMultiCuePoint = new TestFullFlowMultiCuePoint();
			return playServerTestingHelper.testInvoker(testName, testFullFlowMultiCuePoint, input, finishTest);
		})
		.catch(playServerTestingHelper.printError);
}
