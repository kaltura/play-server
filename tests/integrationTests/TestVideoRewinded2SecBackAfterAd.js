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
let thumbsToCompare = [];
let entry = null;
let DoneMethod = null;

class VideoRewindTester {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!VideoRewindTester.validateQrResult(qrCodesResults[i])) {
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
			return VideoRewindTester.isValidAd(qrCodeItem);
		else // case of thumb not of a ad - should not be in time of a cuePoint
			return !VideoRewindTester.isValidAd(qrCodeItem);
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

	static validateRewindedThumbs(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Video is rewinded 2 seconds back after ad...');
			let errorsArray = [];
			for (let j = 0; j < thumbsToCompare.length; j++) {
				playServerTestingHelper.printStatus('validating thumb ' + j + ': ' + JSON.stringify(thumbsToCompare[j]));
				for (let i = 0; i < qrCodesResults.length; i++) {
					let found = false;
					if (thumbsToCompare[j].startThumb == qrCodesResults[i].thumbTime) {
						for (let k = 0; k < qrCodesResults.length; k++) {
							if (thumbsToCompare[j].endThumb == qrCodesResults[k].thumbTime) {
								if (qrCodesResults[i].contentTime == qrCodesResults[k].contentTime) {
									playServerTestingHelper.printOk('Video thumb before Ad is the same as video thumb after Ad');
									found = true;
								} else {
									errorsArray.push('Video thumb before Ad [' + qrCodesResults[i].thumbTime + " seconds] from beginning of video " +
										" is NOT the same as video thumb after Ad [ " + qrCodesResults[k].thumbTime + " seconds ] from beginning of video." +
										"[EXPECTED BOTH CONTENT TIME TO BE EQUAL - " + qrCodesResults[i].contentTime + " vs. "+ qrCodesResults[k].contentTime + " ]");
									found = true;
								}
							}
						}
						if ( !found )
							errorsArray.push('Video thumb before Ad [' + qrCodesResults[i].thumbTime + " seconds] from beginning of video was found but Video after ad Not found");
					}
				}
			}

			if (errorsArray.length > 0) {
				for (let i = 0; i < errorsArray.length; i++)
					playServerTestingHelper.printError(errorsArray[i]);
				reject(false);
			} else {
				playServerTestingHelper.printOk('All Video Thumbs before ads were rewinded after ads...');
				resolve(true);
			}
		});
	}

	runTest(input, resolve, reject) {
		playServerTestingHelper.generateThumbsFromM3U8Promise(input.m3u8Url, input.outputDir)
			.then(function () {
				playServerTestingHelper.getThumbsFileNamesFromDir(input.outputDir)
					.then(function (filenames) {
						playServerTestingHelper.readQrCodesFromThumbsFileNames(input.outputDir, filenames, function (results) {
							VideoRewindTester.ValidateAll(results).then(function () {
									VideoRewindTester.validateRewindedThumbs(results).then(function () {
											resolve(true);
										}
										, reject);
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



describe('test full flow', function () {
	it('test - Video Rewinded 2 Sec Back After', function (done) {
		this.timeout(210000);
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
		if (res) //if test pass finish test else wait for timeout
			DoneMethod();
	});
}


// This test validate the BEFORE LAST thumbnail of the ad and the FIRST after The ad
// to make sure that the video was rewinded 2 seconds back

function testInit(client) {
	sessionClient = client;
	let testName = 'VideoRewindTester';

	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	if (!fs.existsSync(beaconTrackingDir))
		fs.mkdirSync(beaconTrackingDir);

	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/1MinVideo.mp4")
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 15000, 6500);

		})
		.then(function (cuePoint) {
			cuePointList.push(cuePoint);
			thumbsToCompare.push({"startThumb":Math.floor((cuePoint.startTime-2)/1000), "endThumb":Math.ceil((cuePoint.startTime + cuePoint.duration)/1000)});
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 29000, 4000);
		})
		.then(function (cuePoint) {
			cuePointList.push(cuePoint);
			thumbsToCompare.push({"startThumb":Math.floor((cuePoint.startTime-2)/1000), "endThumb":Math.ceil((cuePoint.startTime + cuePoint.duration + 1)/1000)});
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			//playServerTestingHelper.warmupVideo(m3u8Url);
			playServerTestingHelper.getVideoSecBySec(input.m3u8Url, 73);
			let videoRewindTester = new VideoRewindTester();
			return playServerTestingHelper.testInvoker(testName, videoRewindTester, input, 74000, finishTest);
		})
		.catch(playServerTestingHelper.printError);
}
