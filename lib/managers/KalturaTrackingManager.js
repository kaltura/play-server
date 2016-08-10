const util = require('util');
const udpsender = require('../utils/udpsender');
const crypto = require('crypto');
const kaltura = module.exports = require('../KalturaManager');
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

		if (!this.validateActionArguments(params, ['trackingId', 'entryId', 'partnerId'], response))
			return;
		const trackingInfoString = KalturaUtils.decodeString(params.trackingId);
		KalturaLogger.log(`DELETE tracking info as string ${trackingInfoString}`);
		const trackingInfo = JSON.parse(trackingInfoString);
		trackingInfo.entryId = params.entryId;
		trackingInfo.partnerId = params.partnerId;
		this.okResponse(response, 'OK', 'text/plain');

		KalturaLogger.log(`Sending tracking beacon for trackingId: ${JSON.stringify(trackingInfo)}`);
		this.handleTrackingBeacon(response, trackingInfo, request.headers);
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
				KalturaCache.set(trackingBeaconCacheKey, true, parseInt(KalturaConfig.config.cache.trackingBeaconUrl));
			}
		}, function (err) {
			KalturaLogger.log('Tracking info doesn\'t exist in cache. Continue sending beacon request.' + err);
			This.sendBeaconForType(response, params, headers);
			KalturaCache.set(trackingBeaconCacheKey, true, parseInt(KalturaConfig.config.cache.trackingBeaconUrl));
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