const os = require('os');
const util = require('util');
const fs = require('fs');
const child_process = require('child_process');
const chai = require('chai');
const assert = require('chai').assert;
const kalturaClient = require('../lib/client/KalturaClient');
const testingHelper = require('./testingHelper');

let Promise = require("bluebird");
zbarimg = require('zbarimg');
let adCuePointsList = [];
let errorsArray = [];
let videoTumbDir = null;
let playServerTestingHelper = new testingHelper.PlayServerTestingHelper();
let sessionClient = null;

const outputDir = '/opt/kaltura/play-server/tests/output';
const beaconTrackingDir = outputDir  + '/beaconTracking'

class AdTester {

	getReadThumbsDirPromise(input) {
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus("reading thumbs from dir " + input.videoTumbDir);
			fs.readdir(input.videoTumbDir, function (err, filenames) {
				if (err) {
					playServerTestingHelper.printError('Fail reading Thumb files: ' + err);
					reject(err);
				} else {
					playServerTestingHelper.printOk('SUCCESS readThumbsDirPromise');
					if (resolve) {
						input.filenames = filenames;
						resolve(input);
					}
				}
			});
		});
	}

	getGenerateThumbsFromM3U8Promise(input) {
		let This = this;
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus("Generating thumbs from M3U8 url ");
			child_process.exec('ffmpeg -i ' + input.m3u8Url + ' -f image2 -r 0.5 -y ' + input.videoTumbDir + '%d.jpg',
				function (error, stdout, stderr) {
					if (error !== null) {
						playServerTestingHelper.printError('Error while generateThumbsFromM3U8Promise: ' + error);
						reject(error);
					} else {
						playServerTestingHelper.printOk('SUCCESS generateThumbsFromM3U8Promise');
						if (resolve)
							resolve(input);
					}
				});
		});
	}

	handleThumbsAndValidateQrCodes(input) {
		Promise.all(AdTester.getIterateThumbsPromises(input.videoTumbDir, input.filenames, AdTester.ReadQrCode)).then(function () {
			if (errorsArray.length > 0) {
				for (let i = 0; i < errorsArray.length; i++)
					playServerTestingHelper.printError(errorsArray[i]);
				input.errorCallback(false);
			} else {
				input.callback(true);
			}
		}, function (reason) {
			playServerTestingHelper.printError(reason);
		});
	}

	static ReadQrCode(videoTumbDir, filename) {
		return new Promise(function (resolve, reject) {
			console.log("ReadQrCode " + videoTumbDir + " " + filename);
			let thumdTime = ((filename.split("."))[0] - 1) * 2;
			console.log("Time Of thumb is: [" + thumdTime + " seconds] from beginning if video.");
			child_process.exec('zbarimg ' + videoTumbDir + filename,
				(error, stdout, stderr) => {
					console.log();
					let result = stdout.split("QR-Code:")[1];
					if (result) {
						console.log('Found Ad: ' + result + ' at Time: [' + thumdTime + " seconds] from beginning if video.");
						if (AdTester.validateQrResult(result, thumdTime)) {
							resolve();
						} else {
							let msg = 'FAIL - Found Ad thumb at time: [' + thumdTime + " seconds] from beginning if video but Ad cue point is not defined for that time";
							errorsArray.push(msg);
							resolve();
						}
					}
					else if (error !== null || stderr) {
						console.log('Found video at time: [' + thumdTime + " seconds] from beginning if video.");
						if (AdTester.validateQrResult('Video thumb', thumdTime)) {
							resolve();
						} else {
							let msg = 'FAIL - Found video thumb at time: [' + thumdTime + " seconds] from beginning if video but Ad cue point is defined for that time";
							errorsArray.push(msg);
							resolve();
						}
					}
				});
		});
	}

	static validateQrResult(adString, timeOfCuePoint) {
		let timeInMillis = timeOfCuePoint * 1000;
		adString = adString.trim();
		if (adString == 'This is An Ad Code') {
			console.log('Validating an Ad: ' + adString + ' at time: ' + timeOfCuePoint);
			for (let i = 0; i < adCuePointsList.length; i++) {
				if (timeInMillis >= adCuePointsList[i].startTime && timeInMillis <= (adCuePointsList[i].startTime + adCuePointsList[i].duration)) {
					return true;
				}
			}
			return false;
		}
		else // case of thumb not of a ad - should not be in time of a cuePoint
		{
			console.log('Validating a video: ' + adString + ' at time: ' + timeOfCuePoint);
			for (var i = 0; i < adCuePointsList.length; i++) {
				if (timeInMillis >= adCuePointsList[i].startTime && timeInMillis <= (adCuePointsList[i].startTime + adCuePointsList[i].duration)) {
					return false;
				}
			}
			return true;
		}
	}

	static getIterateThumbsPromises(videoTumbDir, array, fn) {
		var index = 0;
		let qrPromises = [];
		array.forEach(function (name) {
			qrPromises.push(AdTester.ReadQrCode(videoTumbDir, name));
		});
		return qrPromises;
	}

	runTest(m3u8Url, name, callback, errorCallback) {

		videoTumbDir = outputDir + '/' + name + 'Stream/';

		let This = this;
		if (!fs.existsSync(outputDir))
			fs.mkdirSync(outputDir);

		if (!fs.existsSync(videoTumbDir))
			fs.mkdirSync(videoTumbDir);

		if (!fs.existsSync(beaconTrackingDir))
			fs.mkdirSync(beaconTrackingDir);

		let value = 0;
		let input = {m3u8Url, videoTumbDir, callback, errorCallback};
		This.getGenerateThumbsFromM3U8Promise(input)
			.then(This.getReadThumbsDirPromise)
			.then(This.handleThumbsAndValidateQrCodes)
			.catch(function(){
			errorCallback(false);
		});
	}

}

playServerTestingHelper.parseCommandLineOptionsAndRunTest(main);
function main(){
	playServerTestingHelper.printInfo("Starting Test for: ");
	playServerTestingHelper.printInfo('serverHost: [' + playServerTestingHelper.serverHost + '] partnerId: [' +  playServerTestingHelper.partnerId + '] entryId: [' + playServerTestingHelper.adminSecret + ']');
	playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, init);
}

function init(client)
{
	sessionClient = client;
	let adTester = new AdTester();
	createEntry()
		.then(createCuePoint1)
		.then(createCuePoint2)
		.then(createCuePoint3)
		.then(buildM3U8Url)
		.then(testInvoker)
		.catch(playServerTestingHelper.printError);
}

function buildM3U8Url(input) {
	return new Promise(function (resolve, reject) {
		sessionClient.flavorAsset.getByEntryId(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					console.log('Got FlavorAssests for entry id');
					let flavor = null;
					for (let i = 0; i < results.length; i++) {
						if (!(results[i].tags.indexOf('source') > -1)) {
							flavor = results[i];
						}
					}

					let m3u8Url = 'http://' + playServerTestingHelper.serverHost + ':88/hls/p/' + playServerTestingHelper.partnerId + '/serveFlavor/entryId/' + input.entry.id + '/v/2/flavorId/' + flavor.id + '/index.m3u8';
					input.m3u8Url = m3u8Url;
					playServerTestingHelper.printStatus("Build m3u8 Url is: " + m3u8Url);
					resolve(input);
				}
			},
			input.entry.id);
	});
}

function testInvoker(input) {
	playServerTestingHelper.printInfo("StartAdTesting for entryId: " + input.entry.id);
	let adTester = new AdTester();
		adTester.runTest(input.m3u8Url, 'video1', function (res) {
			playServerTestingHelper.printInfo("Finished Test");
			playServerTestingHelper.printOk('TEST Ads - SUCCESS validating all Thumb ads');
			validateTrackedBeaconsFile();
			//playServerTestingHelper.cleanFolder(videoTumbDir);
			return assert.equal(res, true);
		}, function (res) {
			playServerTestingHelper.printInfo("Finished Test");
			playServerTestingHelper.cleanFolder(videoTumbDir);
			playServerTestingHelper.printError('TEST Ads- FAILED validating all Thumb ads');
			return assert.equal(res, false);
		});
}

function validateTrackedBeaconsFile() {
	playServerTestingHelper.printInfo("Start validateTrackedBeaconsFile");

	if (fs.existsSync(beaconTrackingDir + '/beaconTracking.txt')) {
		var array = fs.readFileSync(beaconTrackingDir + '/beaconTracking.txt').toString().split("\n");
		for (i in array)
			playServerTestingHelper.printStatus(array[i]);
	}else {
		playServerTestingHelper.printError("Can't read " + beaconTrackingDir + '/beaconTracking.txt - file doesn\'t exists');
	}
}

function createEntry(){
	return new Promise( function (resolve, reject){
		createEntryPromise()
			.then(uploadTokenPromise)
			.then(uploadFilePromise)
			.then(addContentPromise)
			.then(resolve)
			.catch(reject);
	});
}

function createEntryPromise()
{
	return new Promise(function (resolve, reject) {
		playServerTestingHelper.printInfo("Start CreateEntry");
		let entry = new kalturaClient.objects.KalturaMediaEntry();
		entry.mediaType = kalturaClient.enums.KalturaMediaType.VIDEO;
		entry.name = "testEntry";
		entry.description = "testEntry";
		sessionClient.baseEntry.add(function(results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk('createEntry OK');
					resolve(results);
				}
			},
			entry);
	});
}

function uploadTokenPromise(entry)
{
	return new Promise(function (resolve, reject) {
		playServerTestingHelper.printInfo("Start uploadToken for entry:" + entry.id);
		let uploadToken = new kalturaClient.objects.KalturaUploadToken();
		uploadToken.filename = "/opt/kaltura/play-server/tests/resources/TestMovieWithAds.mp4";
		sessionClient.uploadToken.add(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk('uploadToken OK');
					resolve({entry, uploadToken:results});
				}
			},
			uploadToken);
	});
}

function uploadFilePromise(input)
{
	return new Promise(function (resolve, reject) {
		playServerTestingHelper.printInfo("Start uploadFile for upload token: " + input.uploadToken.id);
		sessionClient.uploadToken.upload(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk('uploadFile OK');
					resolve(input);
				}
			},
			input.uploadToken.id,
			"/opt/kaltura/play-server/tests/resources/TestMovieWithAds.mp4",
			null,
			null,
			null);
	});
}

function addContentPromise(input){
	return new Promise(function (resolve, reject) {
		playServerTestingHelper.printInfo("Start add content for entry: " + input.entry.id + " and uploadToken: " + input.uploadToken.id);
		var resource = new kalturaClient.objects.KalturaUploadedFileTokenResource();
		resource.token = input.uploadToken.id;

		sessionClient.media.addContent(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk("entry was created and content was added");
					WaitForEntryToBeReady(input, 10, resolve, reject);
				}
			},
			input.entry.id,
			resource);
	});
}

function createCuePoint1(input) {
	return new Promise(function (resolve, reject) {
		let cuePoint = new kalturaClient.objects.KalturaAdCuePoint();
		cuePoint.entryId = input.entry.id;
		cuePoint.startTime = 11000;
		cuePoint.duration = 12000;
		cuePoint.sourceUrl = "http://testUrl.com";

		sessionClient.cuePoint.add(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk('Added CuePoint ' + results.id);
					adCuePointsList.push(results);
					resolve(input);
				}
			},
			cuePoint);
	});
}

function createCuePoint2(input) {
	return new Promise(function (resolve, reject) {
		let cuePoint = new kalturaClient.objects.KalturaAdCuePoint();
		cuePoint.entryId = input.entry.id;
		cuePoint.startTime = 33000;
		cuePoint.duration = 10000;
		cuePoint.sourceUrl = "http://testUrl.com";

		sessionClient.cuePoint.add(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk('Added CuePoint ' + results.id);
					adCuePointsList.push(results);
					resolve(input);
				}
			},
			cuePoint);
	});
}

function createCuePoint3(input) {
	return new Promise(function (resolve, reject) {
		let cuePoint = new kalturaClient.objects.KalturaAdCuePoint();
		cuePoint.entryId = input.entry.id;
		cuePoint.startTime = 53000;
		cuePoint.duration = 10000;
		cuePoint.sourceUrl = "http://testUrl.com";

		sessionClient.cuePoint.add(function (results) {
				if (results && results.code && results.message) {
					playServerTestingHelper.printError('Kaltura Error', results);
					reject(results);
				} else {
					playServerTestingHelper.printOk('Added CuePoint ' + results.id);
					adCuePointsList.push(results);
					resolve(input);
				}
			},
			cuePoint);
	});
}

function WaitForEntryToBeReady(input, attempts, callback, errorCallback)
{
	playServerTestingHelper.printInfo("Waiting for entry: " + input.entry.id + " to be ready... (attempts left - "+ attempts +")");
		if (input.entry.id != null) {
			sessionClient.baseEntry.get(function (result) {
					playServerTestingHelper.printStatus("Entry Status is " + result.status );
					if (result.status == 2) {
						playServerTestingHelper.printOk("Entry " + input.entry.id + " is ready!");
						callback(input);
					} else {
						if (attempts == 0)
							errorCallback("Entry is not ready");
						else {
							playServerTestingHelper.sleep(10000);
							WaitForEntryToBeReady(input, attempts - 1, callback, errorCallback);
						}
					}
				}
				, input.entry.id);
		} else
			errorCallback("Entry id is null");
}