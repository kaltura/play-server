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

class UnAlignedCuePointTester {

	static validateUnAlignedCuePoint(qrCodesResults)
	{
		return new Promise(function (resolve, reject) {
			playServerTestingHelper.printStatus('Validating Ads and Videos according to CuePoints...');
			let errorsArray = [];
			for (let i = 0; i < qrCodesResults.length; i++) {
				if (!UnAlignedCuePointTester.validateQrResult(qrCodesResults[i]))
				{
					if (qrCodesResults[i].ad)
						errorsArray.push(`FAIL - Found Ad thumb at time: [${qrCodesResults[i].thumbTime} seconds] from beginning of video but Ad cue point is not defined for that time`);
					else
						errorsArray.push(`FAIL - Found video thumb at time: [${qrCodesResults[i].thumbTime} seconds] from beginning of video but Ad cue point is defined for that time`);
				}
			}
			if (errorsArray.length > 0)	{
				for (let i = 0; i < errorsArray.length; i++)
					playServerTestingHelper.printError(errorsArray[i]);
				reject(false);
			}
			else {
				playServerTestingHelper.printOk('The Cue point was aligned to even second and the Ad is Valid...');
				resolve(true);
			}
		});
	}

	static validateQrResult(qrCodeItem)
	{
		if (qrCodeItem.ad)
			return UnAlignedCuePointTester.isValidAd(qrCodeItem);
		return !UnAlignedCuePointTester.isValidAd(qrCodeItem); // case of thumb not of a ad - should not be in time of a cuePoint
	}

	static isValidAd(qrCodeItem)
	{
		const timeInMillis = qrCodeItem.thumbTime * 1000;
		for (let i = 0; i < cuePointList.length; i++) {
			if (timeInMillis >= cuePointList[i].startTime && timeInMillis < (cuePointList[i].startTime + cuePointList[i].duration))
				return true;
		}
		return false;
	}

	runTest(input, resolve, reject)
	{
		playServerTestingHelper.generateThumbsFromM3U8Promise(input.m3u8Url, input.outputDir)
			.then(function () {
				playServerTestingHelper.getThumbsFileNamesFromDir(input.outputDir)
					.then(function (filenames) {
						playServerTestingHelper.readQrCodesFromThumbsFileNames(input.outputDir, filenames, function (results) {
							playServerTestingHelper.printStatus('run validateUnAlignedCuePoint');
							UnAlignedCuePointTester.validateUnAlignedCuePoint(results).then(function () {
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
	it('test - UnAligned Cue-Point', function (done) {
		this.timeout(120000);
		DoneMethod = done;
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
         playServerTestingHelper.deleteEntry(sessionClient,entry).then(function (results) {
                playServerTestingHelper.printInfo("return from delete entry");
                if (res)
                         DoneMethod();
        });
}

function testInit(client)
{
	sessionClient = client;
	const testName = 'unAlignedCuePointTester';

	const videoThumbDir = `${outputDir}/${testName}/`;

	if (!fs.existsSync(videoThumbDir))
		fs.mkdirSync(videoThumbDir);

	playServerTestingHelper.createEntry(sessionClient, `${resourcesPath}/1MinVideo.mp4`)
		.then(function (resultEntry) {
			entry = resultEntry;
			return playServerTestingHelper.createCuePoint(sessionClient, entry, 16900, 6000);
		}).
		then(function (cuePoint) {
			cuePointList.push(cuePoint);
			return playServerTestingHelper.buildM3U8Url(sessionClient, entry);
		})
		.then(function (m3u8Url) {
			let input = [];
			input.m3u8Url = m3u8Url;
			input.outputDir = videoThumbDir;

			const unalignedCuePointTester = new UnAlignedCuePointTester();
			return playServerTestingHelper.testInvoker(testName, unalignedCuePointTester, input, finishTest);
		})
		.catch(playServerTestingHelper.printError);
}

