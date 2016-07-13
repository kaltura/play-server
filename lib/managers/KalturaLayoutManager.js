/**
 * Manager to handle all layout API requests
 * 1. layout for VOD entry (full length)
 * 2. layout for Ad-break (according to previously fetch command)
 */
const util = require('util');

const kaltura = module.exports = require('../KalturaManager');
const VODManifestLayoutData = require('../dataObjects/layoutObjects/VODManifestLayoutData');
const DynamicClipDataArray = require('../dataObjects/layoutObjects/DynamicClipDataArray');
const SourceClipData = require('../dataObjects/layoutObjects/SourceClipData');
const SourceClipDataArray = require('../dataObjects/layoutObjects/SourceClipDataArray');
const NotificationLayoutData = require('../dataObjects/layoutObjects/NotificationLayoutData');
const AdBreakLayoutData = require('../dataObjects/layoutObjects/AdBreakLayoutData');
const VodData = require('../dataObjects/apiResponseObjects/VodData');
const Promise = require('bluebird');

/**
 * @service layout
 *
 * This service is responsible for returning all different layout
 * - vod layout
 * - ad break layout
 * - path layout
 */
class KalturaLayoutManager extends kaltura.KalturaManager
{
	constructor()
	{
		super();
		this._sessionId = null;
	}

	/**
	 * Returns the main layout for vod entry, includes :
	 *  - mp4 file path
	 *  - durations
	 *  - ad break layout links
	 *  - fetch links
	 *
	 * @action layout.manifest
	 *
	 * @param entryId
	 * @param flavorIds
	 */
	manifest(request, response, params)
	{
		const This = this;
		response.dir(params);

		if (!this._validateActionArguments(params, ['entryId', 'flavorIds'], response))
			return;
		this._initActionCall(params, request);
		const ids = params.flavorIds;
		let decoded;
		let flavors;
		try
		{
			decoded = decodeURI(ids);
			flavors = JSON.parse(decoded);
		}
		catch (e)
		{
			response.error('Failed to parse flavor ids from url given');
			return;
		}

		response.log(`Handling layout manifest request for partner [${params.partnerId$}] flavor ids [${flavors}] session [${this._sessionId}]`);
		// TODO what is the impact if the ui conf is not supplied (expecting black filler)

		this.isPermissionAllowedForPartner(params.partnerId, 'FEATURE_PLAY_SERVER',
			function (isAllowed)
			{
				This._getLayoutAPIInformation(params.partnerId, params.entryId, flavors,
					function (vodData)
					{
						let body;
						if (isAllowed && vodData.cuePointList.totalCount > 0)
							body = This._createFullManifestLayout(vodData);
						else
							body = This._createNoCuePointsManifestLayout(vodData);
						This.okResponse(response, body, 'text/plain');
					},
					function (errorMessage)
					{
						response.error(errorMessage);
					}
				);
			}
		);
	}

	_validateActionArguments(params, mandatoryParams, response)
	{
		const missingParams = this.getMissingParams(params, mandatoryParams);
		if (missingParams.length)
		{
			response.error(`Missing arguments [${missingParams.join(', ')}]`);
			this.errorMissingParameter(response);
			return false;
		}
		return true;
	}

	_initActionCall(params, request)
	{
		//if (!params.playerConfig)
		//{
		//	params.playerConfig = null;
		//	KalturaLogger.debug('No player config was provided.');
		//}
		//else
		//	this.playerConfig = JSON.parse(decodeURI(params.playerConfig));
		//
		//// todo - why is the seesion id part of the player config  - what does Eran have to say about that
		//if (this.playerConfig && this.playerConfig.sessionId)
		//	this.sessionId = this.playerConfig.sessionId;
		//else if (params.sessionId)
			this.sessionId = params.sessionId;
		//else
		//	this.sessionId = this.generateSessionID(request);
	}

	/**
	 * Constructs layout with the given entry content from begin to end
	 * @param vodData VodData
	 * @returns {*}
	 * @private
	 */
	_createNoCuePointsManifestLayout(vodData)
	{
		const layout = new VODManifestLayoutData(vodData.numOfFlavors);
		const contentClips = new SourceClipDataArray(0, vodData.getOnlyFlavorUrls()).clips;
		layout.addSequence(vodData.entry.msDuration, contentClips);
		return layout.toJSON();
	}

	/**
	 * Constructs manifest layout according to the given structure
	 */
	_createFullManifestLayout(vodData)
	{
		const layout = new VODManifestLayoutData(vodData.numOfFlavors);
		let lastOffset = 0;
		let contentOffset = 0;
		const filteredCuePoints = this._getFilteredCuePoints(vodData.cuePointList);
		for (let cueIndex = 0; cueIndex < filteredCuePoints.length; cueIndex++)
		{
			const cuePoint = filteredCuePoints[cueIndex];
			// Handle Pre-Roll
			if (cuePoint.startTime === 0)
			{
				// TODO handle pre-roll
			}
			// Handle mid movie cue point
			const contentClipArray = new SourceClipDataArray(contentOffset, vodData.getOnlyFlavorUrls());
			const contentDuration = cuePoint.startTime - lastOffset;
			contentOffset += contentDuration;
			layout.addSequence(contentDuration, contentClipArray.clips);
			const adBreakIds = [];
			for (let i = 0; i < vodData.flavorDataList.length; i++)
			{
				const flavorId = vodData.flavorDataList[i].key;
				const adBreakIdentifier = this._generateIdentifierForAdBreak(vodData.partnerId, cuePoint.id, cuePoint.sourceUrl, flavorId);
				adBreakIds.push(adBreakIdentifier);
			}
			const adBreakClipArray = new DynamicClipDataArray(adBreakIds);
			layout.addSequence(cuePoint.duration, adBreakClipArray.clips);
			lastOffset = lastOffset + cuePoint.duration + contentDuration;
		}
		// Rest of the movie should be content (if such exists)
		if (vodData.entry.msDuration > lastOffset)
		{
			const contentClips = new SourceClipDataArray(contentOffset, vodData.getOnlyFlavorUrls());
			const contentDuration = vodData.entry.msDuration - lastOffset;
			layout.addSequence(contentDuration, contentClips.clips);
		}
		// add the pre-fetch notifications
		for (let cueIndex = 0; cueIndex < filteredCuePoints.length; cueIndex++)
		{
			const cuePoint = filteredCuePoints[cueIndex];
			const url = this._generateFetchUrl(vodData.partnerId, cuePoint.id);
			const notification = new NotificationLayoutData(url, cuePoint.startTime);
			layout.addNotification(notification);
		}
		return layout.toJSON();
	}

	/**
	 * TODO implement this function better - should not be here but in the class that implements fetch
	 * @param cuePointId
	 * @param cuePointURL
	 * @param flavorId
	 */
	_generateIdentifierForAdBreak(partnerId, cuePointId, cuePointURL, flavorId)
	{
		const params = [];
		params.cuePointURL = cuePointURL;
		params.cuePointId = cuePointId;
		params.flavorId = flavorId;
		return this.getPlayServerUrl('layout', 'adBreak', partnerId, params);
	}

	/**
	 * TODO should be implemented where the fetch will be implemented
	 * @param partnerId
	 * @param cuePointId
	 * @returns {*}
	 */
	_generateFetchUrl(partnerId, cuePointId)
	{
		const params = [];
		params.cuepoint = cuePointId;
		return this.getPlayServerUrl('fetch', 'fetch', partnerId, params);
	}

	/**
	 * filters the received cue points from :
	 * - non even offsets (fixes to +1 )
	 * - same time cue points
	 * - overlapping
	 * @param cuePoints
	 * @returns {Array}
	 */
	_getFilteredCuePoints(cuePointsListResponse)
	{
		if (cuePointsListResponse.objectType !== 'KalturaCuePointListResponse')
			throw new Error(`invalid object type supplied - expecting KalturaCuePointListResponse, got ${cuePointsListResponse.objectType}`);
		const cuePoints = cuePointsListResponse.objects;
		let sortedByOffsetCuePoints = [];
		// first get all the cue points offsets and relevant timing info
		for (let cueIndex = 0; cueIndex < cuePoints.length; cueIndex++)
		{
			const cuePoint = cuePoints[cueIndex];
			let offset = cuePoint.startTime;
			if (offset % 1000 !== 0)
				// align to full seconds
				offset += (1000 - (offset % 1000));
			if ((offset / 1000) % 2 !== 0)
				offset += 1000; // times are in gops of two seconds - must make sure
			cuePoint.startTime = offset;
			sortedByOffsetCuePoints.push(cuePoint);
		}
		sortedByOffsetCuePoints = sortedByOffsetCuePoints.sort(
			function (a, b)
			{
				return a.startTime - b.startTime;
			}
		);
		if (sortedByOffsetCuePoints.length >= 1)
		{
			const filteredCuePoints = [];
			filteredCuePoints.push(sortedByOffsetCuePoints[0]);
			for (let i = 1; i < sortedByOffsetCuePoints.length; i++)
			{
				const currentOffset = sortedByOffsetCuePoints[i].startTime;
				const previousOffset = sortedByOffsetCuePoints[i - 1].startTime;
				const previousDuration = sortedByOffsetCuePoints[i - 1].duration;
				if (currentOffset !== previousDuration && // filters duplicate times
					currentOffset > (previousOffset + previousDuration))  // filter overlapping
					filteredCuePoints.push(sortedByOffsetCuePoints[i]);
			}
			return filteredCuePoints;
		}
		return sortedByOffsetCuePoints;
	}

	/**
	 * Calls the API server to get the cue points for the entry, in addition gets all the given flavors URLs
	 * @param partnerId
	 * @param entryId
	 * @param flavorIds
	 * @param callback
	 */
	_getLayoutAPIInformation(partnerId, entryId, flavorIds, callback, errorCallback)
	{
		const This = this;
		this.getClient(KalturaConfig.config.client,
			function ()
			{
				const promises = [];
				promises.push(This._getAPIV3Information(partnerId, entryId));
				for (let i = 0; i < flavorIds.length; i++)
					promises.push(This._getFlavorPath(flavorIds[i]));

				Promise.all(promises).then(
					function (results)
					{
						const entryResponse = results[0][0];
						const cuePointsListResponse = results[0][1];
						const flavorPaths = results.slice(1);
						const vodData = new VodData(partnerId, flavorIds, entryResponse, cuePointsListResponse, flavorPaths);
						if (KalturaLayoutManager._isEntryFlavorsMatch(vodData))
							callback(vodData);
						else
							errorCallback('Entry on result does not match the entry mentioned in the flavors download urls');
						KalturaLogger.log('This is a representation of the vod data as JSON :');
						KalturaLogger.log(JSON.stringify(vodData));
					},
					function (reason)
					{
						errorCallback(reason);
					}
				);
			},
			function (error)
			{
				errorCallback(error);
			}
		);
	}

	/**
	 * Helper function to get the flavor path through serveFlavor as http call
	 * @param flavorId
	 * @param partnerId
	 * @returns {bluebird}
	 * @private
	 */
	_getFlavorPath(flavorId, partnerId)
	{
		return new Promise(
			function (resolve, reject)
			{
				// build the http request
				const url = `${KalturaConfig.config.client.serviceUrl}/p/${partnerId}/serveFlavor/flavorId/${flavorId}?pathOnly=1`;
				KalturaUtils.getHttpUrl(url, null,
					function (response)
					{
						try
						{
							const responseAsObject = JSON.parse(response);
							const clip = responseAsObject.sequences[0].clips[0]
							if (clip.type === 'source')
								resolve(clip.path);
							else
								reject(`Returned serve flavor was not of source type, response: ${response}`);
						}
						catch (e)
						{
							reject(`Failed to extract flavor path from result ${response}`);
						}
					},
					function ()
					{
						reject(`Failed to download content from url ${url}`);
					}
				);
			}
		);
	}

	/**
	 * Uses the kaltura client to get the entry and cueopints on the vod entry
	 * @param partnerId
	 * @param entryId
	 * @returns {bluebird}
	 * @private
	 */
	_getAPIV3Information(partnerId, entryId)
	{
		const This = this;
		return new Promise(
			function (resolve, reject)
			{
				This.impersonate(partnerId);
				This.client.startMultiRequest();
				// Entry Data
				This.client.baseEntry.get(null, entryId);
				// Cue points list
				const cueFilter = new kaltura.client.objects.KalturaAdCuePointFilter();
				cueFilter.entryIdEqual = entryId;
				cueFilter.statusEqual = kaltura.client.enums.KalturaCuePointStatus.READY;
				cueFilter.cuePointTypeEqual = kaltura.client.enums.KalturaCuePointType.AD;
				// define a page - yet the amount of cue-points are not supposed to be even close to 500
				const cuePointsPager = new kaltura.client.objects.KalturaFilterPager();
				cuePointsPager.pageSize = 500;
				This.client.cuePoint.listAction(null, cueFilter, cuePointsPager);
				This.client.doMultiRequest(
					function (results)
					{
						This.unimpersonate(KalturaConfig.config.client);
						//Move validations to VODdata
						const callers = [];
						callers.push('baseEntry.get');
						callers.push('cuepoint.list');
						KalturaLogger.log(`API results : ${JSON.stringify(results)}`);
						//Move the validator into apiManager
						if (This.areValidApiResults(results, callers))
							resolve(results);
						else
							reject('Did not succeed to get all valid response for API information needed');
					}
				);
			}
		);
	}

	static _isEntryFlavorsMatch(vodData)
	{
		const flavorURLs = vodData.getOnlyFlavorUrls();
		for (let i = 0; i < flavorURLs.length; i++)
		{
			const url = flavorURLs[i];
			if (url.indexOf(vodData.entry.id) === -1)
				return false;
		}
		return true;
	}

	/**
	 * Returns the ad break layout for a specific cue point and flavor :
	 *  - paths to ad files
	 *  - path to filler
	 *  - links to beacons
	 *
	 * @action layout.requireAdBreak
	 *
	 * @param cuePointId
	 * @param sessionId
	 * @param flavorId
	 */
	adBreak(request, response, params)
	{
		const This = this;
		response.dir(params);

		if (!this._validateActionArguments(params, ['cuePointId', 'sessionId', 'flavorId', 'fillerId'], response))
			return;
		const cuePointId = params.cuePointId;
		const sessionId = params.sessionId;
		const flavorId = params.flavorId;
		const partnerId = request.partnerId;
		const fillerId = params.fillerId;
		// we want to fetch from the cache the ads that are ready
		const adsReadyKey = this._getAdsReadyKey(cuePointId, sessionId, flavorId);
		KalturaCache.get(adsReadyKey,
			function (adsReadyJSONString)
			{
				const body = This._createReadyAdBreakLayout(adsReadyJSONString, partnerId, cuePointId, flavorId);
				This.okResponse(response, body, 'text/plain');
			},
			function ()
			{
				const body = This._createFillerAdBreakLayout(fillerId);
				This.okResponse(response, body, 'text/plain');
			});
	}

	_createFillerAdBreakLayout(fillerFlavorId)
	{
		const adBreakLayout = new AdBreakLayoutData();
		// todo - filler calculated path should include the following logic
		// todo - 1. the filler flavorId + the transcode command for it hashed (encode 64)
		// todo - 2. The path should be initialized in the layout.manifest command
		// todo - 3. If the path does not exist response with error
		const fillerPath = `filler ${fillerFlavorId}`;
		const adSourceData = new SourceClipData(0, fillerPath);
		adBreakLayout.addClip(adSourceData);
		return adBreakLayout.toJSON();
	}

	/**
	 * Creates an ad break layout including all the ads that are ready to display
	 * @param adReadyJSONString
	 * @param partnerId
	 * @param cuePointId
	 * @param flavorId
	 * @returns string json structure of ad break
	 * @private
	 */
	_createReadyAdBreakLayout(adReadyJSONString, partnerId, cuePointId, flavorId)
	{
		const adReadyList = JSON.parse(adReadyJSONString);
		let currentOffset = 0;
		const adBreakLayout = new AdBreakLayoutData();
		// todo validate value is valid and array
		for (let adIdx = 0; adIdx < adReadyList.length; adIdx++)
		{
			const adCacheDataObject = adReadyList[adIdx];
			const adSourceData = new SourceClipData(currentOffset, adCacheDataObject.path);
			adBreakLayout.addClip(adSourceData);
			if (!adCacheDataObject.isFiller)
			{
				// add all the beacons
				for (let beaconIdx = 0; beaconIdx < adCacheDataObject.beaconList.length; beaconIdx++)
				{
					const beaconData = adCacheDataObject.beaconList[beaconIdx];
					const beaconOffset = this._calculateBeaconOffset(beaconData.type, currentOffset, beaconData.duration);
					const beaconId = this._generateIdentifierForBeacon(partnerId, cuePointId, beaconData.url, flavorId, beaconData.type);
					// todo get the beaocn url from the beacon manager
					const notificationData = new NotificationLayoutData(beaconId, beaconOffset);
					adBreakLayout.addNotification(notificationData);
				}
			}
			currentOffset += adCacheDataObject.duration;
		}
		return adBreakLayout.toJSON();
	}

	/**
	 * todo this should be in the beacon manager as static function
	 * @param cuePointId
	 * @param cuePointURL
	 * @param flavorId
	 * @private
	 * @return string
	 */
	_generateIdentifierForBeacon(partnerId, cuePointId, beaconUrl, flavorId, beaconType)
	{
		const params = [];
		params.beaconUrl = beaconUrl;
		params.beaconType = beaconType;
		params.cuePointId = cuePointId;
		params.flavorId = flavorId;
		return this.getPlayServerUrl('beacon', 'send', partnerId, params);
	}

	/**
	 *
	 * @param cuePointId
	 * @param sessionId
	 * @param flavorId
	 * @returns string
	 * @private
	 */
	_getAdsReadyKey(cuePointId, sessionId, flavorId)
	{
		return KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, sessionId, flavorId]);
	}

	// TODO this function should be static function in the BeaconManager
	/**
	 * Calculates the offset at which this type of beacon should be sent
	 * if the number is not natural we floor it
	 * @param type
	 * @param initialOffsetMsecs
	 * @param durationMsecs
	 * @private
	 * @returns number calculated offset or -1 on failure
	 */
	_calculateBeaconOffset(type, initialOffsetMsecs, durationMsecs)
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
module.exports.KalturaLayoutManager = KalturaLayoutManager;
