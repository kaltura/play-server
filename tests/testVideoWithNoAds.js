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

class VideoWithNoAdsTester {

	static ValidateAll(qrCodesResults) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (qrCodesResults[i].ad)
					errorsArray.push('FAIL - Found Ad thumb at time: [' + qrCodesResults[i].thumbTime + " seconds] from beginning if video but no ads should be played");
			}
			if (errorsArray.length > 0) {
				for (let i = 0; i < errorsArray.length; i++)
					playServerTestingHelper.printError(errorsArray[i]);
				reject(false);
			} else {
				playServerTestingHelper.printOk('All Thumbs are Videos and were Validated Successfully...');
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
							VideoWithNoAdsTester.ValidateAll(results).then(function () {
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

playServerTestingHelper.parseCommandLineOptionsAndRunTest(main);

function main(){
	playServerTestingHelper.printInfo("Starting Test for: ");
	playServerTestingHelper.printInfo('serverHost: [' + playServerTestingHelper.serverHost + '] partnerId: [' +  playServerTestingHelper.partnerId + '] adminSecret: [' + playServerTestingHelper.adminSecret + ']');
	playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
}


function testInit(client) {
	sessionClient = client;
	let entry;
	let testName = 'VideoWithNoAdsTester';

	let videoThumbDir = outputDir + '/' + testName +'/';

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/1MinVideo.mp4")
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			let tester = new VideoWithNoAdsTester();
			return playServerTestingHelper.testInvoker(testName, tester, input);
		})
		.catch(playServerTestingHelper.printError);
}