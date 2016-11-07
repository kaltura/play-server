const os = require('os');
const fs = require('fs');
const url = require('url');
const dns = require('dns');
const util = require('util');
const http = require('http');
const chai = require('chai');
const assert = require('chai').assert;
const colors = require('colors/safe'); // does not alter string prototype
const rmdir = require('rmdir');
const kalturaClient = require('../../lib/client/KalturaClient');
const zbarimg = require('zbarimg');
const child_process = require('child_process');
const uuid = require('uuid');
require('../../lib/utils/KalturaUtils.js');
const config = require('../../lib/utils/KalturaConfig');
const outputDir = KalturaConfig.config.testing.outputPath;
const uiConfId = KalturaConfig.config.testing.uiConfId;
if (!fs.existsSync(outputDir))
    fs.mkdirSync(outputDir);

let errorsArray = [];
let testsErrorsArray = [];
let qrResults = [];
let cuePointsErrorsArray = [];

const KalturaClientLogger = {
    log: function(str) {
        console.log(str);
    }
};

class PlayServerTestingHelper {
    constructor() {
    }

    static printInfo(msg) {
        console.log(colors.blue(msg));
    }

    static printError(msg) {
        console.log(colors.red("ERROR: " + msg));
    }

    static printOk(msg) {
        console.log(colors.green(msg));
    }

    static printStatus(msg) {
        console.log(colors.yellow(msg));
    }

    static sleep(time) {
        var stop = new Date().getTime();
        while (new Date().getTime() < stop + time) {
            ;
        }
    }

    static initClient(serverHost, partnerId, adminSecret, callback) {
        console.log('Initializing client');
        var clientConfig = new kalturaClient.KalturaConfiguration(partnerId);

        clientConfig.serviceUrl = serverHost;
        clientConfig.clientTag = 'play-server-test-' + os.hostname();
        clientConfig.setLogger(KalturaClientLogger);

        var type = kalturaClient.enums.KalturaSessionType.ADMIN;
        var client = new kalturaClient.KalturaClient(clientConfig);
        if (typeof callback === 'function') {
            client.session.start(function (ks) {
                client.setKs(ks);

                callback(client);
            }, adminSecret, 'test', type, partnerId, 86400, 'disableentitlement');
        }
        else {
            client.setKs(callback);
            return client;
        }
    }

    static initTestHelper(serverHost, partnerId, adminSecret) {
        this.serverHost = serverHost;
        this.partnerId = partnerId;
        this.adminSecret = adminSecret;
    }

    static parseCommandLineOptionsAndRunTest(callback) {
        var argv = process.argv.slice(2);

        var option;
        if (argv.length != 3)
            PlayServerTestingHelper.printHelp();

        while (argv.length) {
            option = argv.shift();

            if (option[0] != '-' && argv.length == 2)
                this.serverHost = option;

            else if (option[0] != '-' && argv.length == 1) {
                this.partnerId = option;
                if (isNaN(this.partnerId)) {
                    console.error('Partner ID must be numeric [' + this.partnerId + ']');
                    PlayServerTestingHelper.printHelp();
                }
                this.partnerId = parseInt(this.partnerId);
            }

            else if (option[0] != '-' && argv.length == 0)
                this.adminSecret = option;

            else if (option == '-h' || option == '--help')
                PlayServerTestingHelper.printHelp();

        }

        console.log('Validating Kaltura API hostname [' + this.serverHost + ']');
        let This = this;
        dns.lookup(this.serverHost, function (err, address, family) {
            if (err) {
                console.error('Invalid Kaltura API hostname [' + This.serverHost + ']: ' + err);
                PlayServerTestingHelper.printHelp();
            } else {
                console.log('Kaltura API hostname [' + This.serverHost + '] is valid');
                callback();
            }
        });

        if (!this.serverHost || !this.partnerId || !this.adminSecret) {
            PlayServerTestingHelper.printHelp();
        }
    }

    static cleanFolder(folder,callback)
    {
        console.log("remove folder: " + folder);
        rmdir(folder,
            function (err, dirs, files)
            {
                if (err) throw err;
                callback();
            });
    }

    static printHelp() {
        console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' serverHost partner-id admin-secret entry-id');
        console.log('Options:');
        console.log('\t -h / --help - This help');
        process.exit(1);
    }

    static createEntry(client, path, entryId) {
        let input = {client: client, path: path};
        if (entryId)
        {
            return PlayServerTestingHelper.getEntryPromise(client, entryId);
        }

        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.createEntryPromise(input)
                .then(PlayServerTestingHelper.uploadTokenPromise)
                .then(PlayServerTestingHelper.uploadFilePromise)
                .then(PlayServerTestingHelper.addContentPromise)
                .then(function (result) {
                    process.env.entryId = result.entry.id;
                    resolve(result.entry);
                })
                .catch(reject);
        });
    }

    static deleteEntry(client, entry, shouldDeleteEntry = 'false') {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printInfo("Start DeleteEntry " + entry.id);
            if ( shouldDeleteEntry != 'true' && KalturaConfig.config.testing.shouldDeleteEntriesAfterTest != 'true')
                resolve();
            else {
                client.baseEntry.deleteAction(function (results) {
                        if (results && results.code && results.message) {
                            PlayServerTestingHelper.printError('Kaltura Error', results);
                            reject(results);
                        } else {
                            PlayServerTestingHelper.printOk('deleteEntry ' + entry.id + ' OK');
                            resolve(entry);
                        }
                    },
                    entry.id);
            }
        });
    }

    static deleteCuePoints(client, cuePointList, resolve, reject) {
        cuePointsErrorsArray = [];
        Promise.all(PlayServerTestingHelper.getIterateCuePointsToDeletePromises(client, cuePointList)).then(function () {
            if (cuePointsErrorsArray.length > 0) {
                for (let i = 0; i < cuePointsErrorsArray.length; i++)
                    PlayServerTestingHelper.printError(cuePointsErrorsArray[i]);
                reject();
            } else {
                PlayServerTestingHelper.printOk('Finished deleting cuePoints');
                resolve();
            }
        }, function (reason) {
            PlayServerTestingHelper.printError(reason);
            reject();
        });
    }

    static getIterateCuePointsToDeletePromises(client, cuePointsList) {
        let cuePointPromises = [];
        cuePointsList.forEach(function (cuePoint) {
            cuePointPromises.push(PlayServerTestingHelper.deleteCuePoint(client, cuePoint));
        });
        return cuePointPromises;
    }

    static deleteCuePoint(client, cuePoint) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printInfo("Start deleteCuePoint "  + cuePoint.id);
            client.cuePoint.deleteAction(function (results) {
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        PlayServerTestingHelper.printOk('deleteCuePoint ' + cuePoint.id + ' OK');
                        resolve();
                    }
                },
                cuePoint.id);
        });
    }

    static getEntryPromise(client, endryId) {
        return new Promise(function (resolve, reject) {
            client.baseEntry.get(function (results) {
                if (results && results.code && results.message) {
                    PlayServerTestingHelper.printError('Kaltura Error', results);
                    reject(results);
                } else {
                    PlayServerTestingHelper.printOk('createEntry OK');
                    resolve(results);
                }
            }, endryId);
        })
    }

    static createEntryPromise(input) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printInfo("Start CreateEntry");
            let entry = new kalturaClient.objects.KalturaMediaEntry();
            entry.mediaType = kalturaClient.enums.KalturaMediaType.VIDEO;
            entry.name = "testEntry";
            entry.description = "testEntry";
            input.client.baseEntry.add(function (results) {
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        PlayServerTestingHelper.printOk('createEntry OK');
                        input.entry = results;
                        resolve(input);
                    }
                },
                entry);
        });
    }

    static uploadTokenPromise(input) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printInfo("Start uploadToken for entry:" + input.entry.id);
            let uploadToken = new kalturaClient.objects.KalturaUploadToken();
            if (!input.path)
                reject("No file path is defined for upload token file. please specify a path.");
            else {
                uploadToken.filename = input.path;
                input.client.uploadToken.add(function (results) {
                        if (results && results.code && results.message) {
                            PlayServerTestingHelper.printError('Kaltura Error', results);
                            reject(results);
                        } else {
                            PlayServerTestingHelper.printOk('uploadToken OK');
                            input.uploadToken = results;
                            resolve(input);
                        }
                    },
                    uploadToken);
            }
        });

    }

    static uploadFilePromise(input) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printInfo("Start uploadFile for upload token: " + input.uploadToken.id);
            input.client.uploadToken.upload(function (results) {
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        PlayServerTestingHelper.printOk('uploadFile OK');
                        resolve(input);
                    }
                },
                input.uploadToken.id, input.path, null, null, null);
        });
    }

    static addContentPromise(input) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printInfo("Start add content for entry: " + input.entry.id + " and uploadToken: " + input.uploadToken.id);
            var resource = new kalturaClient.objects.KalturaUploadedFileTokenResource();
            resource.token = input.uploadToken.id;

            input.client.media.addContent(function (results) {
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        PlayServerTestingHelper.printOk("entry was created and content was added");
                        PlayServerTestingHelper.waitForEntryToBeReady(input, 15, resolve, reject);
                    }
                },
                input.entry.id,
                resource);
        });
    }

    static createCuePoint(client, entry, cuePointStartTime, cuePointDuration, specificVast) {
        return new Promise(function (resolve, reject) {
            let cuePoint = new kalturaClient.objects.KalturaAdCuePoint();
            cuePoint.entryId = entry.id;
            cuePoint.startTime = cuePointStartTime;
            cuePoint.duration = cuePointDuration;
            let beaconServer = KalturaConfig.config.testing.beaconServer;
            if (specificVast)
                cuePoint.sourceUrl = beaconServer + "/p/1/testing/getVast?specificVast=" + specificVast;
            else 
                cuePoint.sourceUrl = beaconServer + "/p/1/testing/getVast";
            console.log(cuePoint.sourceUrl);
            client.cuePoint.add(function (results) {
                    if (!results) {
                        reject("No cue point was created");
                    }
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        PlayServerTestingHelper.printOk('Added CuePoint ' + results.id);
                        resolve(results);
                    }
                },
                cuePoint);
        });

    }

    static waitForEntryToBeReady(input, attempts, callback, errorCallback) {
        PlayServerTestingHelper.printInfo("Waiting for entry: " + input.entry.id + " to be ready... (attempts left - " + attempts + ")");
        if (input.entry.id != null) {
            input.client.baseEntry.get(function (result) {
                    PlayServerTestingHelper.printStatus("Entry Status is " + result.status);
                    if (result.status == 2) {
                        PlayServerTestingHelper.printOk("Entry " + input.entry.id + " is ready!");
                        callback(input);
                    } else {
                        if (attempts == 0)
                            errorCallback("Entry is not ready");
                        else {
                            PlayServerTestingHelper.sleep(15000);
                            PlayServerTestingHelper.waitForEntryToBeReady(input, attempts - 1, callback, errorCallback);
                        }
                    }
                }
                , input.entry.id);
        } else
            errorCallback("Entry id is null");
    }

    static buildM3U8Url(client, entry) {
        return new Promise(function (resolve, reject) {
            client.flavorAsset.getByEntryId(function (results) {
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        console.log('Got FlavorAssests for entry id');
                        let flavor = null;
                        for (let i = 0; i < results.length; i++) {
                            if (!(results[i].tags.indexOf('source') > -1)) {
                                flavor = results[i];
                            }
                        }

                        let playManifest = PlayServerTestingHelper.serverHost + '/p/' + PlayServerTestingHelper.partnerId + '/sp/10300/playManifest/usePlayServer/1/uiconf/' + uiConfId + '/entryId/' + entry.id + '/flavorIds/' + flavor.id + '/format/applehttp/protocol/http/a.m3u8';
                        PlayServerTestingHelper.printStatus("trying to get play manifest " + playManifest);

                        new Promise( function (resolve, reject){
                           KalturaUtils.getHttpUrl(playManifest, null, function (manifestContent) {
                               PlayServerTestingHelper.printStatus("manifestContent is: " + manifestContent);
                               if(resolve){
                                   let m3u8Url;
                                   var split = manifestContent.split('\n');
                                   for (let i = 0 ; i < split.length ; i++)
                                   if (split[i].trim().startsWith("http"))
                                       m3u8Url = split[i];
                                   PlayServerTestingHelper.printStatus("Build m3u8 Url is: " + m3u8Url);
                                   resolve(m3u8Url);
                               }
                           }, function (err) {
                               PlayServerTestingHelper.printStatus("Error getting manifestContent:");
                               if(reject){
                                   reject(err);
                               }
                           });
                        }
                        ).then(resolve,reject );
                    }
                },
                entry.id);
        });
    }

    static getFlavorAssetToUse(client, entry) {
        return new Promise(function (resolve, reject) {
            client.flavorAsset.getByEntryId(function (results) {
                    if (results && results.code && results.message) {
                        PlayServerTestingHelper.printError('Kaltura Error', results);
                        reject(results);
                    } else {
                        console.log('Got FlavorAssests for entry id');
                        let flavor = null;
                        for (let i = 0; i < results.length; i++) {
                            if (!(results[i].tags.indexOf('source') > -1)) {
                                flavor = results[i];
                                resolve(flavor);
                                return;
                            }
                        }
                        reject('No Suitable flavor asset was found for entry ' + entry.id );
                    }
                },
                entry.id);
        });
    }

    static generateThumbsFromM3U8Promise(m3u8Url, videoThumbDir) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printStatus("Generating thumbs from M3U8 url ");
            child_process.exec('ffmpeg -i ' + m3u8Url + ' -vf fps=0.5 -f image2 -r 0.5 -y ' + videoThumbDir + '%d.jpg >> /dev/null 2>&1',
                function (error, stdout, stderr) {
                    if (error !== null) {
                        PlayServerTestingHelper.printError('Error while generateThumbsFromM3U8Promise: ' + error);
                        reject(error);
                    } else {
                        PlayServerTestingHelper.printOk('SUCCESS generateThumbsFromM3U8Promise');
                        resolve();
                    }
                });
        });
    }

    static getVideoSecBySec(m3u8Url, lengthOfVideo, callback)
    {
        if (process.env.reRunTest)
        {
            if (callback)
                return callback();
            else
                return;
        }

        let startTimeForReading = new Date();
        const interval = setInterval(function()
                    {
                        let currentSecond = Math.floor((new Date() - startTimeForReading)/1000);
                        if ((currentSecond + 1) > lengthOfVideo)
                        {
                            PlayServerTestingHelper.printOk('SUCCESS video is warmed-up');
                            clearInterval(interval);
                            if (callback)
                                return callback();
                            else
                                return;
                        }
                        child_process.exec('ffmppeg -i ' + m3u8Url + ' -c copy -f mp4 -ss ' + currentSecond + ' -t 1 -y /dev/null'),
                            function(error, stdout, stderr)
                            {
                                if (error !== null) {
                                    PlayServerTestingHelper.printError('Error while trying to get second ' + currentSecond + ' of video: ' + error);
                                }
                                else {
                                    if (callback)
                                        return callback();
                                    else
                                        return;
                                }
                            }
                        ;
                    }, 1000);
    }

    static warmupVideo(m3u8Url)
    {
        child_process.exec('ffmppeg -i ' + m3u8Url + ' -c copy -f mp4  -t 2 -y /dev/null'),
            function(error, stdout, stderr)
            {
                if (error !== null) {
                    PlayServerTestingHelper.printError('Error while trying to warmup video: ' + error);
                } else {
                    PlayServerTestingHelper.printOk('SUCCESS video is warmed-up');
                }
            }
        ;
    }

    static getThumbsFileNamesFromDir(videoThumbDir) {
        return new Promise(function (resolve, reject) {
            PlayServerTestingHelper.printStatus("Reading thumbs from dir " + videoThumbDir);
            fs.readdir(videoThumbDir, function (err, filenames) {
                if (err) {
                    PlayServerTestingHelper.printError('Fail reading Thumb files: ' + err);
                    reject(err);
                } else {
                    PlayServerTestingHelper.printOk('SUCCESS reading thumbs from dir ' + videoThumbDir);
                    resolve(filenames);
                }
            });
        });
    }

    static readQrCodesFromThumbsFileNames(videoThumbDir, filenames, resolve, reject) {
        Promise.all(PlayServerTestingHelper.getIterateThumbsPromises(videoThumbDir, filenames)).then(function () {
            if (errorsArray.length > 0) {
                for (let i = 0; i < errorsArray.length; i++)
                    PlayServerTestingHelper.printError(errorsArray[i]);
                reject(false);
            } else {
                PlayServerTestingHelper.printOk('Finished reading ' + filenames.length + ' QRCodes from thumbs File Names');
                resolve(qrResults);
            }
        }, function (reason) {
            PlayServerTestingHelper.printError(reason);
            reject(false);
        });
    }

    static ReadQrCode(videoThumbDir, filename) {
        return new Promise(function (resolve, reject) {
            let thumbTime = ((filename.split("."))[0] - 1) * 2;
            child_process.exec('zbarimg ' + videoThumbDir + filename,
                (error, stdout, stderr) => {
                    let result = stdout.split("QR-Code:")[1];
                    if (result) {
                        var res = result.replace(/\'/gi, "\"");
                        result = JSON.parse(res);
                        result.thumbTime = thumbTime;
                        result.filename = filename;
                        qrResults.push(result);
                        resolve();
                    }
                    else if (error !== null || stderr) {
                        console.log(error);
                        console.log(stderr);

                        //assuming black filler
                        result = require('./frameData');
                        result.ad.status = 3; // as filler
                        result.thumbTime = thumbTime;
                        result.filename = filename;
                        qrResults.push(result);
                        //errorsArray.push("Could not read QR Code for " + filename);
                        resolve();
                    }
                });
        });
    }

    static getIterateThumbsPromises(videoThumbDir, array) {
        let qrPromises = [];
        array.forEach(function (name) {
            qrPromises.push(PlayServerTestingHelper.ReadQrCode(videoThumbDir, name));
        });
        return qrPromises;
    }

	static testInvoker(testName, test, input, waitBeforeRunningTest = 0,doneMethod = null) {
        errorsArray = [];
        testsErrorsArray = [];
        qrResults = [];

        PlayServerTestingHelper.printInfo("Starting testing: " + testName);
        setTimeout(function () {
            test.runTest(input, function (res) {
                PlayServerTestingHelper.printInfo("Finished Test: " + testName);
                PlayServerTestingHelper.printOk('TEST ' + test.constructor.name + ' - SUCCESS');
                PlayServerTestingHelper.reRunTestInfo(test.constructor.name);
                PlayServerTestingHelper.cleanFolder(input.outputDir, function () {
                    if (typeof doneMethod === 'function')
                        doneMethod(res);
                    return assert.equal(res, true);
                });
            }, function (res) {
                PlayServerTestingHelper.printInfo("Finished Test" + testName);
                PlayServerTestingHelper.reRunTestInfo(test.constructor.name);
                PlayServerTestingHelper.printError('TEST ' + test.constructor.name + ' - FAILED');
                PlayServerTestingHelper.cleanFolder(input.outputDir, function () {
                    if (typeof doneMethod === 'function')
                        doneMethod(res);
                    return assert.equal(res, false);
                });
            });
        }, waitBeforeRunningTest);
    }

    static reRunTestInfo(testName)
    {
        PlayServerTestingHelper.printStatus("To Re-Run Test run the following command: ");
        PlayServerTestingHelper.printStatus('env reRunTest=0 entryId=' + process.env.entryId + ' mocha ' +  testName +'.js');
        PlayServerTestingHelper.printStatus("Please make sure that shouldDeleteEntriesAfterTest was set to false in config file while running original test before re running the test.");
    }

    static runMultiTests(m3u8Urls, videoThumbDirs, testNames, testClass, waitBeforeRunningTests, doneMethod = null) {
	errorsArray = [];
	testsErrorsArray = [];
	qrResults = [];
        let testsPromises = [];
        for (let i = 0; i < testNames.length; i++) {
            let input = [];
            input.m3u8Url = m3u8Urls[i];
            input.outputDir = videoThumbDirs[i];

            testsPromises.push(PlayServerTestingHelper.multiTestInvoker(testNames[i], testClass, input, waitBeforeRunningTests[i]));
            PlayServerTestingHelper.sleep(100);
        }

        Promise.all(testsPromises).then(function () {
            if (testsErrorsArray.length > 0) {
                for (let i = 0; i < testsErrorsArray.length; i++)
                    PlayServerTestingHelper.printError(testsErrorsArray[i]);
				if (typeof doneMethod === 'function')
					doneMethod(false);
                return false;
            } else {
                PlayServerTestingHelper.printOk('Finished invoking Multi tests Successfully');
				if (typeof doneMethod === 'function')
					doneMethod(true);
                return true;
            }
        }, function (reason) {
            PlayServerTestingHelper.printError(reason);
			if (typeof doneMethod === 'function')
				doneMethod(false);
            return false;
        });

    }

    static multiTestInvoker(testName, test, input, waitBeforeRunningTest = 0) {

        return new Promise(function (resolve, reject)
        {
            PlayServerTestingHelper.printInfo("Starting testing: " + testName);
            setTimeout(
                function ()
                {
                    test.runTest(input, function (res)
                    {
                        PlayServerTestingHelper.printInfo("Finished Test: " + testName);
                        PlayServerTestingHelper.printOk('TEST ' + test.constructor.name + ' - SUCCESS');
                        PlayServerTestingHelper.cleanFolder(input.outputDir,function(){
                        if (!res)
                            testsErrorsArray.push(testName + " Failed");
                        resolve()});

                    }, function (res)
                    {
                        PlayServerTestingHelper.printInfo("Finished Test" + testName);
                        PlayServerTestingHelper.printError('TEST ' + test.constructor.name + ' - FAILED');
                        PlayServerTestingHelper.cleanFolder(input.outputDir,
                        function()
                        {
                            if (!res)
                                testsErrorsArray.push(testName + " Failed Here");
                            resolve();
                        });
                    });
                }, waitBeforeRunningTest);
        });
    }

	static warmupVideo(m3u8Url)
	{
		child_process.exec('ffmppeg -i ' + m3u8Url + ' -c copy -f mp4  -t 2 -y /dev/null'),
			function(error, stdout, stderr)
			{
				if (error !== null) {
					PlayServerTestingHelper.printError('Error while trying to warmup video: ' + error);
				} else {
					PlayServerTestingHelper.printOk('SUCCESS video is warmed-up');
				}
			}
		;
	}

}

module.exports.PlayServerTestingHelper = PlayServerTestingHelper;
