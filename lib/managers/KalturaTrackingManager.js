const util = require('util');
const udpsender = require('../utils/udpsender');
const crypto = require('crypto');
const kaltura = require('../KalturaManager');
const requestPckg = require('request');

/**
 * @service tracking
 */
class KalturaTrackingManager extends kaltura.KalturaManager
{
    constructor(){
        super();
    }

    /***
     * create a url to call the sendBeacon action when beacon tracking is needed.
     * given entryId, partnerId, cuePointId, beaconTrackingURL this method will make a one url that triggers trackingManager.sendBeacon method using http
     */
    static generateBeaconRequest(partnerId, params)
    {
        let kalturaManager = new kaltura.KalturaManager();
        let beaconRequest = this.getPlayServerUrl('tracking', 'sendBeacon', partnerId, params);
        KalturaLogger.log('BeaconRequest generated: ' + beaconRequest);
        return beaconRequest;
    }

    /***
     * create a key for caching usages
     * @param partnerId
     * @param entryId
     * @param cuePointId
     * @param url
     * @param headers
     */
    static buildTrackingBeaconCacheKey(params)
    {
        let keyToHash = params.partnerId + '.' + params.entryId + '.' + params.cuePointId + '.' + params.url + '.' + JSON.stringify(params.headers);
        let trackingBeaconCacheKey = params.trackingId + "-" + crypto.createHash('md5').update(keyToHash).digest('hex');
        KalturaLogger.log('Tracking beacon cache key created: ' + trackingBeaconCacheKey);
        return trackingBeaconCacheKey;
    }


    validateBeaconTrackingArguments(response, params)
    {
        let missingParams = this.getMissingParams(params, ['entryId', 'partnerId', 'cuePointId', 'url', 'type']);
        if(missingParams.length)
        {
            response.error('Missing arguments [' + missingParams.join(', ') + ']');
            this.errorMissingParameter(response);
            return false;
        }
        return true;
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
     */
    sendBeacon(request, response, params)
    {

        if (!this.validateBeaconTrackingArguments(response, params))
            return;

        this.okResponse(response, 'OK', 'text/plain');

        KalturaLogger.log('Sending tracking beacon for trackingId: [' + params.trackingId + ' partnerId: [' + params.partnerId + '] entryId: [' + params.entryId + '] cuePointId: [' + params.cuePointId+ '] beaconUrl: [' + params.url + ']' + ' type: [' + params.type + ']');
        this.handleTrackingBeacon(response, params, request.headers);
    }

    handleTrackingBeacon(response, params, headers)
    {
        let trackingBeaconCacheKey = KalturaTrackingManager.buildTrackingBeaconCacheKey(params);
        let This = this;
        KalturaCache.get(trackingBeaconCacheKey, function (trackingBeaconItem) {
            if (trackingBeaconItem)
                response.log('Tracking info found in cache. duplicate beacon will not be sent again...');
            else
            {
                KalturaLogger.log('Tracking info deosn\'t exist in cache. Continue sending beacon request.');
                This.sendBeaconForType(response, params, headers);
                KalturaCache.set(trackingBeaconCacheKey, true, KalturaConfig.config.cache.trackingBeaconUrl);
            }
        }, function (err) {
            KalturaLogger.log('Tracking info deosn\'t exist in cache. Continue sending beacon request.' + err);
            This.sendBeaconForType(response, params, headers);
            KalturaCache.set(trackingBeaconCacheKey, true, KalturaConfig.config.cache.trackingBeaconUrl);
        });
    }

    sendBeaconForType(response, params, headers)
    {
        KalturaLogger.log('Start sending beacon request for beaconUrl: [' + params.url + ' type: [' + params.type + '] tracking id: [ '+ params.trackingId + '] partnerId: [' + params.partnerId + ']');
        if (!params.url)
        {
            KalturaLogger.log('Failed to send beaconUrl[' + params.url + ' type [' +params.type + '] tracking id: [ '+ params.trackingId + '] partner [' + params.partnerId + '], empty url');
            return;
        }

        let requestHeaders = null;
        if (headers)
            requestHeaders = headers;

        let options = {
            url: params.url,
            headers: headers,
            timeout: KalturaConfig.config.cloud.requestTimeout * 1000,
        };

        let responseEnded = false;
        let httpModule = KalturaUtils.getHttpModuleByProtocol(null, params.url);

        let msgobj = new Object();
        msgobj.params = JSON.stringify(params);
        msgobj.eventType = params.type;
        msgobj.url = params.url;

        requestPckg.get(options)
            .on('response', function (res, body) {
                responseEnded = true;

                if (res.statusCode >= 200 && res.statusCode <= 299)
                {
                    KalturaLogger.log('Beacon for type [' + params.type + '] tracking id: [ ' + params.trackingId + '] partnerId [' + params.partnerId + '] url [' + params.url + '] sent with status: [' + res.statusCode + ']');
                    msgobj.status = 'success';
                }
                else
                {
                    KalturaLogger.log('Failed to send beacon for type [' + params.type + '] tracking id: [ ' + params.trackingId + '] partnerId [' + params.partnerId + '] url [' + params.url + '] statusCode [' + res.statusCode + ']');
                    msgobj.status = 'Failed';
                }

                udpsender.sendFunction(JSON.stringify(msgobj), response);
            })
            .on('data', function () { /* do nothing */})
            .on('error', function (e) {
                if (!responseEnded)
                {
                    KalturaLogger.log('Failed to send beacon for type [' + params.type + '] tracking id: [ ' + params.trackingId + '] partnerId [' + params.partnerId + '] url [' + params.url + '], ' + e.message);
                    msgobj.status = 'Failed';
                    udpsender.sendFunction(JSON.stringify(msgobj), response);
                }
                else
                    KalturaLogger.log('Beacon was sent, ignoring the error type [' + params.type + '] tracking id: [ ' + params.trackingId + '] partnerId [' + params.partnerId + '] url [' + params.url + '], ' + e.message);
            })
            .on('socket', function (e) {
                    KalturaLogger.log('Socket send beacon for type [' + params.type + '] tracking id: [ ' + params.trackingId + '] partnerId [' + params.partnerId + '] url [' + params.url + ']');
            });
    }

}
module.exports.KalturaTrackingManager = KalturaTrackingManager;