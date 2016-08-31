const util = require('util');
const udpsender = require('../utils/udpsender');
const crypto = require('crypto');
const kaltura = require('../KalturaManager');
const requestPckg = require('request');
var fs = require('fs');
/**
 * @service testing
 */
class KalturaTestingManager extends kaltura.KalturaManager {
    constructor() {
        super();
    }


    static getRandomNumber(lowInclusive, highInclusive) {
        return Math.floor(Math.random() * (highInclusive - lowInclusive + 1) + lowInclusive);
    }

    /***
     *
     * @action getVast.
     */
    getVast(request, response, params) {
        let This = this;
        let fileName = KalturaConfig.config.testing.resourcesPath + '/vast' + KalturaTestingManager.getRandomNumber(1, 5) + '.xml';
	//let fileName = KalturaConfig.config.testing.resourcesPath + '/vast1.xml';
        fs.readFile(fileName, 'utf8', function (err, vast) {
            if (err)
                throw err;
            KalturaLogger.log("Rerieving Vast File : " + fileName);
            This.okResponse(response, vast, 'text/xml');
        });
    }

    /**
     * @action trackBeacon.
     * @param eventType
     */
    trackBeacon(request, response, params) {
        // TODO - smart handling for beacon tracking. for testing. return all sorts of status codes.

        KalturaLogger.log("Track beacon Succesfully");
        this.okResponse(response, 'Track beacon Successfully', 'text/plain');
        this.writeBeaconToFile("beacon to track");


    }

    writeBeaconToFile(TrackingBeacon) {
        let beaconTrackingPath = KalturaConfig.config.tests.beaconTrackingPath;
        let fileName = beaconTrackingPath + '/beaconTracking.txt';

        fs.exists(fileName, function (exists) {
            if (exists) {
                fs.appendFile(fileName, "Tracked beacon: " + TrackingBeacon + " " + new Date().getTime() + '\n', function (err) {
                    if (err) {
                        return console.log(err);
                    }
                    console.log("The file was saved!");
                });
            }
            else {
                fs.writeFile(fileName, "Tracked beacon: " + TrackingBeacon + " " + new Date().getTime() + '\n', function (err) {
                    if (err) {
                        return console.log(err);
                    }
                    console.log("The file was saved!");
                });
            }
        });
    }
}

module.exports.KalturaTestingManager = KalturaTestingManager;
