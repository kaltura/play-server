const os = require('os');
const fs = require('fs');
const url = require('url');
const dns = require('dns');
const util = require('util');
const http = require('http');
const colors = require('colors/safe'); // does not alter string prototype
const rmdir = require('rmdir');
const kalturaClient = require('../lib/client/KalturaClient');

const KalturaClientLogger = {
    log: function(str) {
        console.log(str);
    }
};

class PlayServerTestingHelper {

    constructor() {
    }

    printInfo(msg) {
        console.log(colors.blue(msg));
    }

    printError(msg) {
        console.log(colors.red("ERROR: " + msg));
    }

    printOk(msg)
    {
        console.log(colors.green(msg));
    }

    printStatus(msg)
    {
        console.log(colors.yellow(msg));
    }

    sleep(time) {
        var stop = new Date().getTime();
        while (new Date().getTime() < stop + time) {
            ;
        }
    }

    initClient(serverHost, partnerId, adminSecret, callback) {
        console.log('Initializing client');
        var clientConfig = new kalturaClient.KalturaConfiguration(partnerId);

        clientConfig.serviceUrl = 'http://' + serverHost;
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

    parseCommandLineOptionsAndRunTest(callback) {
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

    cleanFolder(folder) {
        let This = this;
        console.log("remove folder: " + folder);
        rmdir(folder, function (err, dirs, files) {
            if (err) {
                This.printError(err);
            }
        });
    }

    static printHelp() {
        console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' serverHost partner-id admin-secret entry-id');
        console.log('Options:');
        console.log('\t -h / --help - This help');
        process.exit(1);
    }
}

module.exports.PlayServerTestingHelper = PlayServerTestingHelper;