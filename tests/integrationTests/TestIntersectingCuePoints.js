const fs = require('fs');
const chai = require('chai');
const testingHelper = require('./../infra/testingHelper');
require('../../lib/utils/KalturaConfig');
const Promise = require('bluebird');
const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const outputDir = KalturaConfig.config.testing.outputPath;
const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const secretImpersonatePartnerId = KalturaConfig.config.testing.secretImpersonatePartnerId;

const playServerTestingHelper = testingHelper.PlayServerTestingHelper;
let sessionClient = null;
const cuePointList = [];

class IntersectingCuePointsTester {

	static validateIntersectingCuePoints(qrCodesResults)
	{
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!IntersectingCuePointsTester.validateQrResult(qrCodesResults[i])) {
					if (qrCodesResults[i].ad)
						errorsArray.push(`FAIL - Found Ad thumb at time: [${qrCodesResults[i].thumbTime} seconds] from beginning of video but Ad cue point is not defined for that time`);
					else
						errorsArray.push(`FAIL - Found video thumb at time: [${qrCodesResults[i].thumbTime} seconds] from beginning of video but Ad cue point is defined for that time`);
				}
			}
			if (errorsArray.length > 0) {
				for (let i = 0; i < errorsArray.length; i++)
					playServerTestingHelper.printError(errorsArray[i]);
				reject(false);
			} else {
				playServerTestingHelper.printOk('The ad is played only in first cue point, and Validated Successfully...');
				resolve(true);
			}
		});
	}

	static validateQrResult(qrCodeItem)
	{
		if (qrCodeItem.ad)
			return IntersectingCuePointsTester.isValidAd(qrCodeItem);
		return !IntersectingCuePointsTester.isValidAd(qrCodeItem); // case of thumb not of a ad - should not be in time of a cuePoint
	}

	static isValidAd(qrCodeItem)
	{
		const timeInMillis = qrCodeItem.thumbTime * 1000;
		if (cuePointList.length === 2 && IntersectingCuePointsTester.isIntersectingCuePoints(cuePointList[0], cuePointList[1]))
		{
			const cuePoint = IntersectingCuePointsTester.getFirstAdIntersectingCuePoint(cuePointList[0], cuePointList[1]);
			if (timeInMillis >= cuePoint.startTime && timeInMillis < (cuePoint.startTime + cuePoint.duration))
			{
				playServerTestingHelper.printStatus(`the Ad is Valid , the cue point start time is ${cuePoint.startTime} and the qrThumbTIme is ${timeInMillis}`);
				return true;
			}
		}
		return false;
	}

	static isIntersectingCuePoints(firstCuePoint, secondCuePoint)
	{
		if ((firstCuePoint.startTime + firstCuePoint.duration <= secondCuePoint.startTime) || (secondCuePoint.startTime + secondCuePoint.duration <= firstCuePoint.startTime))
			return false;
		return true;
	}

	static getFirstAdIntersectingCuePoint(firstCuePoint, secondCuePoint)
	{
		if (firstCuePoint.startTime <= secondCuePoint.startTime)
			return firstCuePoint;
		return secondCuePoint;
	}

	runTest(input, resolve, reject)
	{
		playServerTestingHelper.generateThumbsFromM3U8Promise(input.m3u8Url, input.outputDir)
			.then(function () {
				playServerTestingHelper.getThumbsFileNamesFromDir(input.outputDir)
					.then(function (filenames) {
						playServerTestingHelper.readQrCodesFromThumbsFileNames(input.outputDir, filenames, function (results) {
							playServerTestingHelper.printStatus('run validateIntersectingCuePoints');
							IntersectingCuePointsTester.validateIntersectingCuePoints(results).then(function () {
								resolve(true);
							}
								, reject);
						});
					})
					.catch(function () {
						reject(false);
					});
			}).catch(function () {
				reject(false);
			});
	}
}

let DoneMethod;
describe('test full flow', function () {
	it('test - Intersecting CuePoints Tester', function (done) {
		this.timeout(360000);
		DoneMethod = done;
		playServerTestingHelper.initTestHelper(serviceUrl, impersonatePartnerId, secretImpersonatePartnerId);
		playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);
	});
});
function finishTest(res){
	chai.expect(res).to.be.true;
	DoneMethod();
}

function testInit(client)
{
	cuePointList = [];
	sessionClient = client;
	let entry;
	const testName = 'IntersectingCuePointsTester';

	const videoThumbDir = `${outputDir}/${testName}/`;

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	playServerTestingHelper.createEntry(sessionClient, `${resourcesPath}/2MinVideo.mp4`)
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 30000, 15000);
		}).
		then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 35000, 15000);
		}).
		then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			//playServerTestingHelper.warmupVideo(m3u8Url);
			playServerTestingHelper.getVideoSecBySec(input.m3u8Url, 137);
			const intersectingCuePointsTester = new IntersectingCuePointsTester();
			return playServerTestingHelper.testInvoker(testName, intersectingCuePointsTester, input, 138000, finishTest);
		})
		.catch(playServerTestingHelper.printError);
}
