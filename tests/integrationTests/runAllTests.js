const util = require('util');
const fs = require('fs');
const chai = require('chai');
const child_process = require('child_process');
const kalturaClient = require('../../lib/client/KalturaClient');
const testingHelper = require('./../infra/testingHelper');
const config = require('../../lib/utils/KalturaConfig');

const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const serviceUrl = KalturaConfig.config.testing.serviceUrl;
const nginxHost = KalturaConfig.config.testing.nginxHost;
const nginxPass = KalturaConfig.config.testing.nginxPass;
const impersonatePartnerId = KalturaConfig.config.testing.impersonatePartnerId;
const secretImpersonatePartnerId = KalturaConfig.config.testing.secretImpersonatePartnerId;
const testsPath = KalturaConfig.config.testing.testsPath;

let playServerTestingHelper = testingHelper.PlayServerTestingHelper;
let sessionClient = null;
let entry = null;

playServerTestingHelper.initTestHelper(serviceUrl, impersonatePartnerId, secretImpersonatePartnerId);
playServerTestingHelper.initClient(playServerTestingHelper.serverHost, playServerTestingHelper.partnerId, playServerTestingHelper.adminSecret, testInit);

function testInit(client) {
    sessionClient = client;
    let entry;
    playServerTestingHelper.createEntry(sessionClient, resourcesPath + "/2MinVideo.mp4", null)
        .then(function (resultEntry) {
                entry = resultEntry;
                console.log(" got " + entry.id);
                console.log(" reading path: " + testsPath);
                var files = fs.readdirSync(testsPath);
                console.log(" got " + files);
                for (var i = 0; i < files.length; i++) {
                    let fileName = files[i];
                    if (fileName.split('.')[1] == 'js' && fileName != 'runAllTests.js' && fileName != 'TestVideoRewinded2SecBackAfterAd.js') {
                        console.log("Serving " + fileName);
                        console.log("Restartung Nginx before test...");
                        child_process.execSync('sshpass -p ' + nginxPass + ' ssh root@'+ nginxHost + ' \'service nginx restart\'');
                        console.log("Flushing couchbase before test...");
                        child_process.execSync('echo Yes | /opt/couchbase/bin/couchbase-cli bucket-flush -c localhost:8091 -u kaltura -p kaltura --bucket=playServer --enable-flush --force');
                        console.log("Sleeping 10 secs");
                        sleepFor(10000);
                        let command = 'env reRunTest=0 entryId=' + entry.id + ' mocha -R xunit ' + testsPath + '/' + fileName + ' | tee -a /tmp/results.xml';
                        console.log("Running: " + command);
                        let code = child_process.execSync(command);
                        playServerTestingHelper.printStatus(code);
                    }
                }

                playServerTestingHelper.deleteEntry(sessionClient, entry, 'true').then(function (results) {
                    runMoreTests(sessionClient);
                    playServerTestingHelper.printInfo("Run All Tests Finished");
                }, function (err) {
                    playServerTestingHelper.printError(err);
                });
            },
            function (err) {
                playServerTestingHelper.printError(err);
            });
}


function runMoreTests(client) {
    let tests = ['TestVideoRewinded2SecBackAfterAd.js' ];
    for (var i = 0; i < tests.length; i++) {
        let fileName = tests[i];
        process.env.entryId = '';
        let command = 'mocha  -R xunit ' + testsPath + '/' + fileName + ' | tee -a /tmp/results.xml';
        console.log("Running: " + command);
        let code = child_process.execSync(command);
        playServerTestingHelper.printStatus(code);
    }
}

function sleepFor( sleepDuration ){
    var now = new Date().getTime();
    while(new Date().getTime() < now + sleepDuration){ /* do nothing */ }
}
