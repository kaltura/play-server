const util = require('util');
const udpsender = require('../utils/udpsender');
const crypto = require('crypto');
var kaltura = module.exports = require('../KalturaManager');

/**
 * @service tracking
 */
class KalturaTrackingManager extends kaltura.KalturaManager {

    constructor() {
        super();
    }

    /***
     * create a url to call the sendBeacon action when beacon tracking is needed.
     */
    static generateBeaconRequest(domain, partnerId, params) {

        KalturaLogger.log('Generating beacon request.');
        var kalturaManager = new kaltura.KalturaManager();
        var beaconRequest = kalturaManager.getPlayServerUrl('tracking', 'sendBeacon', partnerId, params, null, domain);
        KalturaLogger.log('BeaconRequest generated: ' + beaconRequest);
        return beaconRequest;
    }

    /***
     * create a url to call the sendBeacon action when beacon tracking is needed.
     */
    static buildTrackingBeaconCacheKey(params) {
        KalturaLogger.log('Building tracking beacon cache key.');
        // build cache key and check for duplicates
        var keyToHash = params.partnerId + '.' + params.entryId + '.' + params.cuePointId + '.' + params.url + '.' + params.headers;
        var trackingBeaconCacheKey = crypto.createHash('sha1').update(JSON.stringify(keyToHash)).digest('hex');
        KalturaLogger.log('Tracking beacon cache key created: ' + trackingBeaconCacheKey);
        return trackingBeaconCacheKey;
    }

    /**
     * Send beacons to track ad progress
     *
     * @action tracking.sendBeacon
     *
     * @param partnerId
     * @param entryId
     * @param cuePointId
     * @param type
     * @param url
     * @param headers
     */
    sendBeacon(request, response, params) {

        response.log('Start sendBeacon.');
        response.log(JSON.stringify(params));
        //params = this.parsePlayServerParams(response, params, ['entryId', 'cuePointId', 'partnerId', 'url', 'type']);
        if (!params) {
            this.errorMissingParameter(response);
            return;
        }
        if (!params.url) {
            response.error('URL is missing. can\'t send beacon tracking request.');
            return;
        }

        this.okResponse(response, 'OK', 'text/plain');

        var beaconUrl = params.url;
        if (params.headers) {
            response.log('Adding additional headers to url request: ' + params.headers);
            beaconUrl += '&headers=' + params.headers;
        }
        response.log('Sending tracking beacon for partnerId: [' + params.partnerId + '] entryId: [' + params.entryId + '] cuePointId: [' + params.cuePointId+ '] beaconUrl: [' + beaconUrl + ']' + 'type: [' + params.type + ']');
        this.handleTrackingBeacon(request, response, params, beaconUrl);
    }

    handleTrackingBeacon(request, response, params, beaconUrl) {
        var trackingBeaconCacheKey = KalturaTrackingManager.buildTrackingBeaconCacheKey(params);
        var This = this;
        KalturaCache.get(trackingBeaconCacheKey, function (trackingBeaconItem) {
            if (trackingBeaconItem) {
                response.log('Tracking info found in cache. duplicate beacon will not be sent again...');
            }
            else {
                response.log('Tracking info not found in cache. Continue sending beacon request.');
                This.sendBeaconForType(response, beaconUrl, params);
                KalturaCache.set(trackingBeaconCacheKey, true, 100);
            }
        }, function (err) {
            response.log('Error finding Tracking info in cache. Continue sending beacon request.' + err);
            This.sendBeaconForType(response, beaconUrl, params);
            KalturaCache.set(trackingBeaconCacheKey, true, 100);
        });
    }

    sendBeaconForType(response, url, params) {
        response.log('Start sending beacon: Url[' + url + ' type [' + params.type + '] partner [' + params.partnerId + ']');
        if (!url) {
            response.log('Failed to send beacon Url[' + url + ' type [' +params.type + '] partner [' + params.partnerId + '], empty url');
            return;
        }

        var responseEnded = false;
        var httpModule = KalturaUtils.getHttpModuleByProtocol(null, url);
        var request = httpModule.get(url, function (res) {
            responseEnded = true;

            var msgobj = new Object();
            msgobj.params = JSON.stringify(params);
            msgobj.eventType = params.type;
            msgobj.statusCode = res.statusCode;
            msgobj.url = url;

            if (res.statusCode == 408) {
                response.log('Failed to send beacon for type [' + params.type + '] partner [' + params.partnerId + '] url [' + url + '], timeout');
                msgobj.status = 'Failed';
            }
            else {
                response.log('Beacon for type [' + params.type + '] partner [' + params.partnerId + '] url [' + url + '] sent with status: [' + res.statusCode + ']');
                msgobj.status = 'success';
            }

            udpsender.sendFunction(JSON.stringify(msgobj), response);
            res.on('data', function () { /* do nothing */
            });
        });
        request.setTimeout(KalturaConfig.config.cloud.requestTimeout * 1000, function () {});
        request.on('error', function (e) {
            if (!responseEnded) {
                response.log('Failed to send beacon for type [' + params.type + '] partner [' + params.partnerId + '] url [' + url + '], ' + e.message);
            }
            else {
                response.log('beacon was sent, ignoring the error type [' + params.type + '] partner [' + params.partnerId + '] url [' + url + ']');
            }
        });
        request.on('socket', function (e) {
            response.log('Socket send beacon for type [' + params.type + '] partner [' + params.partnerId + '] url [' + url + ']');
        });
    }

}

module.exports.KalturaTrackingManager = KalturaTrackingManager;