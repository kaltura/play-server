const kaltura = module.exports = require('../KalturaManager');
const util = require('util');
const crypto = require('crypto');
const requestPckg = require('request');
const udpsender = require('../utils/udpsender');
const TrackingIdentifier = require('../dataObjects/URLDataObjects/TrackingIdentifier');
/**
 * @service tracking
 */
class KalturaTrackingManager extends kaltura.KalturaManager
{
	constructor()
	{
		super();
	}

	/**
	 * create a key for caching usages
	 * @param trackingPrefix
	 * @param partnerId
	 * @param entryId
	 * @param cuePointId
	 * @param url
	 * @param sessionId
	 * @param innerId index of order in the origin vast
	 * @returns {key}
	 */
	static buildTrackingBeaconCacheKey(trackingPrefix, partnerId, entryId, cuePointId, url, sessionId, innerId)
	{
		const keyToHash = `${partnerId}-${entryId}-${cuePointId}-${url}-${sessionId}-${innerId}`;
		const md5 = crypto.createHash('md5').update(keyToHash).digest('hex');
		const trackingBeaconCacheKey = `${trackingPrefix}-${md5}`;
		KalturaLogger.log('Tracking beacon cache key created: ' + trackingBeaconCacheKey);
		return trackingBeaconCacheKey;
	}

	/**
	 * Send beacons to track ad progress
	 *
	 * @action tracking.sendBeacon
	 *
	 * @param params
	 */
	sendBeacon(request, response, params)
	{
        const This = this;
		response.dir(params);

		if (!this.validateActionArguments(params, ['trackingId', 'entryId', 'partnerId', 'sessionId'], response))
			return;
		TrackingIdentifier.getTrackingId(params.trackingId,
        function (trackingIdentifier)
        {
            KalturaLogger.log(`Got tracking info ${trackingIdentifier}`);
            const trackingPrefix = `tracking-${params.entryId}-${trackingIdentifier.cuePointId}-${trackingIdentifier.type}`;
            This.okResponse(response, 'OK', 'text/plain');

            KalturaLogger.log(`Sending tracking beacon for trackingId: ${util.inspect(trackingIdentifier)}`);
            this.handleTrackingBeacon(response, trackingIdentifier, trackingPrefix, params.entryId, params.partnerId, params.sessionId, request.headers);
        });
	}

	handleTrackingBeacon(response, trackingIdentifier, trackingPrefix, entryId, partnerId, sessionId, headers)
	{
		let trackingBeaconCacheKey = KalturaTrackingManager.buildTrackingBeaconCacheKey(
			trackingPrefix, partnerId, entryId, trackingIdentifier.cuePointId, trackingIdentifier.url, sessionId, trackingIdentifier.seqId);
		let This = this;
		KalturaCache.get(trackingBeaconCacheKey, function (trackingBeaconItem) {
			if (trackingBeaconItem)
				response.log('Tracking info found in cache. duplicate beacon will not be sent again...');
			else
			{
				KalturaLogger.log('Tracking info deosn\'t exist in cache. Continue sending beacon request.');
				This.sendBeaconForType(response, trackingIdentifier.url, trackingIdentifier.type, trackingPrefix, partnerId, headers);
				KalturaCache.set(trackingBeaconCacheKey, true, parseInt(KalturaConfig.config.cache.trackingBeaconUrl));
			}
		}, function (err) {
			KalturaLogger.log('Tracking info doesn\'t exist in cache. Continue sending beacon request.' + err);
			This.sendBeaconForType(response, trackingIdentifier.url, trackingIdentifier.type, trackingPrefix, partnerId, headers);
			KalturaCache.set(trackingBeaconCacheKey, true, parseInt(KalturaConfig.config.cache.trackingBeaconUrl));
		});
	}

	sendBeaconForType(response, url, type, trackingPrefix, partnerId, headers)
	{
		KalturaLogger.log('Start sending beacon request for beaconUrl: [' + url + ' type: [' + type + '] tracking id: [ ' + trackingPrefix + '] partnerId: [' + partnerId + ']');
		if (!url)
		{
			KalturaLogger.log('Failed to send beaconUrl[' + url + ' type [' + type + '] tracking id: [ ' + trackingPrefix + '] partner [' + partnerId + '], empty url');
			return;
		}
		// we use different headers to avoid disruptive headers (like Host)
		const requestHeaders = [];
		if (headers && headers['user-agent'])
			requestHeaders['User-Agent'] = headers['user-agent'];
		if (headers && headers['x-forwarded-for'])
			requestHeaders['x-forwarded-for'] = headers['x-forwarded-for'];
		const options = {
			url: url,
			timeout: KalturaConfig.config.cloud.requestTimeout * 1000
		};
		if (requestHeaders['User-Agent'] || requestHeaders['x-forwarded-for'])
			options.headers = requestHeaders;
		let responseEnded = false;

		let msgobj = new Object();
		msgobj.partnerId = partnerId;
		msgobj.trackingPrefix = trackingPrefix;
		msgobj.eventType = type;
		msgobj.url = url;

		requestPckg.get(options)
			.on('response', function (res, body) {
				responseEnded = true;

				if (res.statusCode >= 200 && res.statusCode <= 299)
				{
					KalturaLogger.log('Beacon for type [' + type + '] tracking id: [ ' + trackingPrefix + '] partnerId [' + partnerId + '] url [' + url + '] sent with status: [' + res.statusCode + ']');
					msgobj.status = 'success';
				}
				else
				{
					KalturaLogger.log('Failed to send beacon for type [' + type + '] tracking id: [ ' + trackingPrefix + '] partnerId [' + partnerId + '] url [' + url + '] statusCode [' + res.statusCode + ']');
					msgobj.status = 'Failed';
				}

				udpsender.sendFunction(JSON.stringify(msgobj), response);
			})
			.on('data', function () { /* do nothing */})
			.on('error', function (e) {
				if (!responseEnded)
				{
					KalturaLogger.log('Failed to send beacon for type [' + type + '] tracking id: [ ' + trackingPrefix + '] partnerId [' + partnerId + '] url [' + url + '], ' + e.message);
					msgobj.status = 'Failed';
					udpsender.sendFunction(JSON.stringify(msgobj), response);
				}
				else
					KalturaLogger.log('Beacon was sent, ignoring the error type [' + type + '] tracking id: [ ' + trackingPrefix + '] partnerId [' + partnerId + '] url [' + url + '], ' + e.message);
			})
			.on('socket', function (e) {
				KalturaLogger.log('Socket send beacon for type [' + type + '] tracking id: [ ' + trackingPrefix + '] partnerId [' + partnerId + '] url [' + url + ']');
			});
	}

	/**
	 * Calculates the offset at which this type of beacon should be sent
	 * if the number is not natural we floor it
	 * @param type
	 * @param initialOffsetMsecs
	 * @param durationMsecs
	 * @private
	 * @returns number calculated offset or -1 on failure
	 */
	static calculateBeaconOffset(type, initialOffsetMsecs, durationMsecs)
	{
		switch (type)
		{
			case 'impression':
			case 'start':
				return initialOffsetMsecs;
			case 'firstQuartile':
				return Math.floor(initialOffsetMsecs + (durationMsecs / 4));
			case 'midpoint':
				return Math.floor(initialOffsetMsecs + (durationMsecs / 2));
			case 'thirdQuartile':
				return Math.floor(initialOffsetMsecs + (durationMsecs * 3 / 4));
			case 'complete':
				return initialOffsetMsecs + durationMsecs;
			default :
				return -1; // not relevant
		}
	}

}
module.exports = KalturaTrackingManager;
