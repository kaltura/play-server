/**
 * Manager to handle all layout API requests
 * 1. layout for VOD entry (full length)
 * 2. layout for Ad-break (according to previously fetch command)
 */
const kaltura = module.exports = require('../KalturaManager');
const util = require('util');
const crypto = require('crypto');
const Promise = require('bluebird');
const KalturaTrackingManager = require('./KalturaTrackingManager');
const VODManifestLayoutData = require('../dataObjects/layoutObjects/VODManifestLayoutData');
const DynamicClipDataArray = require('../dataObjects/layoutObjects/DynamicClipDataArray');
const SourceClipDataArray = require('../dataObjects/layoutObjects/SourceClipDataArray');
const NotificationLayoutData = require('../dataObjects/layoutObjects/NotificationLayoutData');
const AdBreakLayoutData = require('../dataObjects/layoutObjects/AdBreakLayoutData');
const AdPathLayoutData = require('../dataObjects/layoutObjects/AdPathLayoutData');
const VodData = require('../dataObjects/apiResponseObjects/VodData');
const AdBreakIdentifier = require('../dataObjects/URLDataObjects/AdBreakIdentifier');
const FetchIdentifier = require('../dataObjects/URLDataObjects/FetchIdentifier');
const TrackingIdentifier = require('../dataObjects/URLDataObjects/TrackingIdentifier');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
const PathsGenerator = require('./helpers/PathsGenerator');
const AdBreakKeyHelper = require('./helpers/AdBreakKeyHelper');
const H264Verifier = require('../../tests/h264Testing/h264Verifier');
require('../dataObjects/PlayServerConstants');

/**
 * @service layout
 *
 * This service is responsible for returning all different layout (actions)
 * - manifest layout
 * - ad break layout
 * - path layout
 */
class KalturaLayoutManager extends kaltura.KalturaManager {

	constructor()
	{
		super();
		this.apiConnector = new ApiServerClientConnector();
		this.layoutCacheTimeout = KalturaConfig.config.cache.layout;
	}

	_buildManifestAndResponse(response, partnerId, flavorIds, uiConfId, entryId, layoutManifestKey)
	{
		response.log(`Handling layout manifest request for partner [${partnerId}], uiConfId[${uiConfId}]`);
		const This = this;
		this.isPermissionAllowedForPartner(partnerId, 'FEATURE_PLAY_SERVER',
			function (isAllowed)
			{
				if (isAllowed)
				{
					This._getLayoutAPIInformation(partnerId, entryId, uiConfId, flavorIds,
						function (vodData)
						{
							let body;
							if (vodData.cuePointList.length > 0)
								body = This._createFullManifestLayout(vodData);
							else
								body = This._createNoCuePointsManifestLayout(vodData);
							KalturaLogger.log(`Layout.manifest returns: ${body}`);
							KalturaCache.set(layoutManifestKey, body, This.layoutCacheTimeout,
								function ()
								{
									This.okResponse(response, body, 'text/plain');
								},
								function (err)
								{
									This.errorResponse(response, 500, `Failed to set layout manifest in cache due to :${err}`);
								}
							);
						},
						function (err)
						{
							This.errorResponse(response, 424, `Failed response from the API server ${err}`);
						}
					);
				}
				else
					This.errorResponse(response, 428, `Partner ${partnerId} is not allowed for play server - please consult with the support team`);
			}
		);
	}

	_getLayoutFromCache(response, layoutManifestKey, firstTry = true)
	{
		const This = this;
		KalturaCache.get(layoutManifestKey,
			function (data)
			{
				if (data && data.length > 0)
				{
					KalturaLogger.log('Returning layout from cache');
					This.okResponse(response, data, 'text/plain');
				}
				else if (firstTry)
				{
					setTimeout(
						function ()
						{
							This._getLayoutFromCache(response, layoutManifestKey, false);
						},
						KalturaConfig.config.cache.calcLayoutMili
					);
				}
				else
					This.errorResponse(response, 500, 'Failed to calculate layout on time');
			},
			function (err)
			{
				response.error(`Failed to get layout manifest from cache though handled : ${err}`);
			}
		);
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

		if (!this.validateActionArguments(params, ['entryId', 'flavorIds'], response))
			return;
		const layoutManifestKey = this._getLayoutManifestKey(params);
		KalturaCache.add(layoutManifestKey, '', This.layoutCacheTimeout,
			function ()
			{
				KalturaLogger.log(`First time handling layout manifest for ${util.inspect(params)}`);
				const uiConfId = params.uiConfId || BLACK_FILLER;
				const flavors = params.flavorIds.split(',');
				This._buildManifestAndResponse(response, params.partnerId, flavors, uiConfId, params.entryId, layoutManifestKey);
			},
			function (error)
			{
				KalturaLogger.log(`Could not add layout manifest key to cache ${layoutManifestKey} due to : ${error}`);
				This._getLayoutFromCache(response, layoutManifestKey);
			}
		);
	}

	_getLayoutManifestKey(params)
	{
		const layoutKey = `partnerId-${params.partnerId}-entryId-${params.entryId}-flavorIds-${params.flavorIds}-uiConfId-${params.uiConfId}`;
		return crypto.createHash('md5').update(`${JSON.stringify(layoutKey)}`).digest('hex');
	}

	/**
	 * Constructs layout with the given entry content from begin to end
	 * @param vodData VodData
	 * @returns {*}
	 * @private
	 */
	_createNoCuePointsManifestLayout(vodData)
	{
		KalturaLogger.log(`Creating no ads manifest for vodData ${JSON.stringify(vodData)}`);
		const layout = new VODManifestLayoutData(vodData.selectedFlavorIdList.length);
		const contentClips = new SourceClipDataArray(0, vodData.getSelectedFlavorPaths()).clips;
		layout.addSequence(vodData.entry.msDuration, contentClips);
		return layout.toJSON();
	}

	_addAdbreakToLayout(layout, vodData, cuePoint, fetchId)
	{
		const adBreakIds = [];
		for (let i = 0; i < vodData.selectedFlavorIdList.length; i++)
		{
			const flavorId = vodData.selectedFlavorIdList[i];
			const adBreakIdentifier = this._generateIdentifierForAdBreak(cuePoint.id, cuePoint.duration, flavorId, fetchId);
			adBreakIds.push(adBreakIdentifier);
		}
		const adBreakClipArray = new DynamicClipDataArray(adBreakIds);
		layout.addSequence(cuePoint.duration, adBreakClipArray.clips);
	}

	/**
	 * Constructs manifest layout according to the given structure
	 */
	_createFullManifestLayout(vodData)
	{
		KalturaLogger.log(`Creating a full manifest for vodData ${JSON.stringify(vodData)}`);
		const layout = new VODManifestLayoutData(vodData.selectedFlavorIdList.length);
		let timeLineOffset = 0;
		let contentOffset = 0;
		const filteredCuePoints = this._getFilteredCuePoints(vodData.cuePointList);
		const fillerId = this._getFillerId(vodData);
		for (let cueIndex = 0; cueIndex < filteredCuePoints.length; cueIndex++)
		{
			const cuePoint = filteredCuePoints[cueIndex];
			const isPreRoll = cuePoint.startTime <= 2000; // everything under 2 seconds is considered pre-roll
			const fetchId = this._generateFetchId(cuePoint.id, cuePoint.duration, cuePoint.sourceUrl, vodData.getAllFlavorIds(), fillerId);
			const url = this._generateFetchUrl(fetchId);
			const fetchTime = Math.max(timeLineOffset - KalturaConfig.config.adIntegration.preFetchWindow, 0);
			layout.addNotification(new NotificationLayoutData(url, fetchTime));
			if (isPreRoll)
			{
				this._addAdbreakToLayout(layout, vodData, cuePoint, fetchId);
				timeLineOffset = timeLineOffset + cuePoint.duration;
			}
			else
			{
				// Handle mid movie cue point
				const contentClipArray = new SourceClipDataArray(contentOffset, vodData.getSelectedFlavorPaths());
				const contentDuration = cuePoint.startTime - contentOffset;
				contentOffset += contentDuration;
				if (contentDuration > 0)
					layout.addSequence(contentDuration, contentClipArray.clips);
				this._addAdbreakToLayout(layout, vodData, cuePoint, fetchId);
				timeLineOffset = timeLineOffset + cuePoint.duration + contentDuration;
				if (contentOffset !== vodData.entry.msDuration)
					contentOffset = contentOffset - (KalturaConfig.config.layout.secondsBackwardsAfterAd * 1000); //go two second backwards
			}
		}
		// Rest of the movie should be content (if such exists)
		if (vodData.entry.msDuration > contentOffset)
		{
			const contentClips = new SourceClipDataArray(contentOffset, vodData.getSelectedFlavorPaths());
			const contentDuration = vodData.entry.msDuration - contentOffset;
			layout.addSequence(contentDuration, contentClips.clips);
		}

		return layout.toJSON();
	}

	_getFillerId(vodData)
	{
		try
		{
			return JSON.parse(vodData.uiConf.config).plugins.vast.slateContent;
		}
		catch (e)
		{
			return BLACK_FILLER;
		}
	}

	/**
	 * @param cuePointId
	 * @param duration
	 * @param flavorId
	 * @param fetchId
	 */
	_generateIdentifierForAdBreak(cuePointId, duration, flavorId, fetchId)
	{
		const adIdentifier = new AdBreakIdentifier(cuePointId, flavorId, duration, fetchId);
		return adIdentifier.toBase64();
	}

	/**
	 * filters the received cue points from :
	 * - non even offsets (fixes to +1 )
	 * - same time cue points
	 * - overlapping
	 * @param cuePoints
	 * @returns {Array}
	 */
	_getFilteredCuePoints(cuePointList)
	{
		let sortedByOffsetCuePoints = [];
		// first get all the cue points offsets and relevant timing info
		for (let cueIndex = 0; cueIndex < cuePointList.length; cueIndex++)
		{
			const cuePoint = cuePointList[cueIndex];
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
	 * @param selectedflavorIds
	 * @param callback
	 */
	_getLayoutAPIInformation(partnerId, entryId, uiConfId, selectedflavorIds, callback, errorCallback)
	{
		const This = this;

		function callAPIServer()
		{
			return This._getAPIV3Information(partnerId, entryId, uiConfId).
				then(parseApiResults, errorCallback);
		}

		function getFlavorIds(flavorAssetList)
		{
			const flavorIds = [];
			for (let idx = 0; idx < flavorAssetList.length; idx++)
			{
				flavorIds.push(flavorAssetList[idx].id);
			}
			return flavorIds;
		}

		function getFlavorsWithoutSource(flavorAssetList)
		{
			const result = [];
			for (let idx = 0; idx < flavorAssetList.length; idx++)
			{
				const tags = flavorAssetList[idx].tags;
				if (tags.indexOf('source') === -1)
					result.push(flavorAssetList[idx]);
			}
			return result;
		}

		function parseApiResults(results)
		{
			const entryResponse = results[0];
			const cuePointListResponse = results[1];
			if (cuePointListResponse.objectType !== 'KalturaCuePointListResponse')
				throw new Error(`invalid object type supplied - expecting KalturaCuePointListResponse, got ${cuePointListResponse.objectType}`);
			const cuePointsList = cuePointListResponse.objects;
			const flavorAssetListResponse = results[2];
			if (flavorAssetListResponse.objectType !== 'KalturaFlavorAssetListResponse')
				throw new Error(`invalid object type supplied - expecting KalturaFlavorAssetListResponse, got ${flavorAssetListResponse.objectType}`);
			let flavorAssetList = flavorAssetListResponse.objects;
			flavorAssetList = getFlavorsWithoutSource(flavorAssetList);
			const uiConfResponse = (uiConfId === BLACK_FILLER) ? BLACK_FILLER : results[3];
			const getFlavorPathPromises = [];
			for (let i = 0; i < flavorAssetList.length; i++)
				getFlavorPathPromises.push(This._getFlavorPath(flavorAssetList[i].id, partnerId));
			Promise.all(getFlavorPathPromises).then(
				function (flavorPaths)
				{
					if (KalturaConfig.config.h264Verification.enabled === 'true')
						H264Verifier.insertFlavorsPathToCache(getFlavorIds(flavorAssetList), flavorPaths);
					for (let i = 0; i < flavorAssetList.length; i++)
						flavorAssetList[i].url = flavorPaths[i];
					const vodData = new VodData(partnerId, flavorAssetList, selectedflavorIds, entryResponse, uiConfResponse, cuePointsList);
					callback(vodData);
				},
				errorCallback
			);
		}
		this.getClient(KalturaConfig.config.client, callAPIServer);
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
				const url = PathsGenerator.generateApiServerFlavorURL(partnerId, flavorId, true);
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
	 * @param uiConfId
	 * @returns {bluebird}
	 * @private
	 */
	_getAPIV3Information(partnerId, entryId, uiConfId)
	{
		const This = this;
		return new Promise(
			function (resolve, reject)
			{
				// define a pager - so that the API calls don't fail - yet initiated with a large number 500
				const kalturaPager = new kaltura.client.objects.KalturaFilterPager();
				kalturaPager.pageSize = 500;
				This.impersonate(partnerId);
				This.client.startMultiRequest();
				// 0. Entry Data
				This.client.baseEntry.get(null, entryId);
				// 1. Cue points list
				const cueFilter = new kaltura.client.objects.KalturaAdCuePointFilter();
				cueFilter.entryIdEqual = entryId;
				cueFilter.statusEqual = kaltura.client.enums.KalturaCuePointStatus.READY;
				cueFilter.cuePointTypeEqual = kaltura.client.enums.KalturaCuePointType.AD;
				This.client.cuePoint.listAction(null, cueFilter, kalturaPager);
				// 2. get all flavors ids
				const flavorAssetFilter = new kaltura.client.objects.KalturaFlavorAssetFilter();
				flavorAssetFilter.entryIdEqual = entryId;
				flavorAssetFilter.statusEqual = kaltura.client.enums.KalturaFlavorAssetStatus.READY;
				This.client.flavorAsset.listAction(null, flavorAssetFilter, kalturaPager);
				// 3. UI conf
				if (uiConfId !== BLACK_FILLER)
					This.client.uiConf.get(null, uiConfId);
				This.client.doMultiRequest(
					function (results)
					{
						This.unimpersonate(KalturaConfig.config.client);
						//Move validations to VODdata
						const callers = [];
						callers.push('baseEntry.get');
						callers.push('cuepoint.list');
						callers.push('flavorAsset.list');
						if (uiConfId !== BLACK_FILLER)
							callers.push('uiConf.get');
						KalturaLogger.debug(`API results : ${JSON.stringify(results)}`);
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

	/**
	 * Returns the ad break layout for a specific cue point and flavor :
	 *  - paths to ad files
	 *  - path to filler
	 *  - links to beacons
	 *
	 * @action layout.adbreak
	 *
	 * @param cuePointId
	 * @param sessionId
	 * @param flavorId
	 */
	adbreak(request, response, params, iteration = 1)
	{
		const This = this;
		response.dir(params);

		if (!this.validateActionArguments(params, ['adId', 'sessionId', 'entryId'], response))
			return;
		const adId = AdBreakIdentifier.fromBase64(params.adId);
		KalturaLogger.log(`LayoutManager.adbreak got ${JSON.stringify(adId)} as argument `);
		const cuePointId = adId.cuePointId;
		const flavorId = adId.flavorId;
		const breakDuration = adId.duration;
		const fetchId = adId.fetchId;
		const adsReadyKey = KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, flavorId, params.sessionId]);
		const adsDefaultReadyKey = KalturaCache.getKey(KalturaCache.VOD_SESSION_DEFAULT_ADS_READY_KEY_PREFIX, [cuePointId, params.sessionId]);
		KalturaLogger.log(`Constructed this key to get the ads: ${adsReadyKey} and default key: ${adsDefaultReadyKey}`);
		this._getReadyAdsFromCache(adsReadyKey, adsDefaultReadyKey,
			function (adReadyList)
			{
				if (adReadyList && typeof(adReadyList) === 'string' && adReadyList.startsWith('ERROR'))
				{
					This.errorResponse(response, 500, `Failed to find ads for adId: [${params.adId}] Due to ${adReadyList.ERROR}`);
					return;
				}
				KalturaLogger.log(`Got the following ads (ready) from cache : ${util.inspect(adReadyList)}`);
				const body = This._createReadyAdBreakLayout(adReadyList, cuePointId, flavorId, breakDuration);
				KalturaLogger.log(`Response for ad break for adId ${params.adId} is : ${body}`);
				This.okResponse(response, body, 'text/plain');
			},
			function ()
			{
				KalturaLogger.log(`Found no ads ready for ad break key ${adsReadyKey}, this probably means that the fetch warmup did not occur will initiate fetch and recall adbreak, iteration ${iteration}`);
                if(iteration > KalturaConfig.config.layout.maxNumberOfAdBreakRetries)
                {
                    This.errorResponse(response, 500, `Could not create ads for entry id ${params.entryId} already retried ${iteration} times.`);
                    return;
                }
				const fetchParams = { fetchId:fetchId, sessionId:params.sessionId, entryId: params.entryId };
				This.callPlayServerService('fetch', 'innerWarmup', params.partnerId, fetchParams);
				setTimeout(
					function ()
					{   // call ourself after we allow fetch to occur
						This.adbreak(request, response, params, iteration + 1);
					}, KalturaConfig.config.layout.milisBetweenInnerFetchAndLayout);
			}
		);
	}

	_getReadyAdsFromCache(adsReadyKey, adsDefaultReadyKey, handleJSONAdsCallback, errorCallback)
	{
		KalturaCache.getMulti([adsReadyKey, adsDefaultReadyKey],
			function(allAdsReadyList)
			{
				if (!allAdsReadyList || !allAdsReadyList[adsDefaultReadyKey] || !allAdsReadyList[adsReadyKey])
				{
					KalturaLogger.error(`Missing values for keys : ${adsReadyKey}, ${adsDefaultReadyKey}`);
					return errorCallback();
				}
				const flavorReadyAdsData = new AdBreakKeyHelper(allAdsReadyList[adsReadyKey]).readyAdsBreakData;
				const defaultReadyAdsData = new AdBreakKeyHelper(allAdsReadyList[adsDefaultReadyKey]).readyAdsBreakData;
				const adReadyListCacheValue = flavorReadyAdsData.merge(defaultReadyAdsData);
				KalturaLogger.log(`The following ads were found as ready in cache : ${util.inspect(adReadyListCacheValue)}`);
				if (adReadyListCacheValue.isEmpty())
				{
					KalturaLogger.log(`Could not find any ready ad (not even filler) for key : ${adsReadyKey}`);
					return errorCallback();
				}
				// we only block the default to prevent races
				AdBreakKeyHelper.blockKey(adsDefaultReadyKey);
				// add the filler as an ad
				adReadyListCacheValue.ads.push(adReadyListCacheValue.filler);
				KalturaCache.getMulti(adReadyListCacheValue.ads,
					function (value)
					{
						KalturaLogger.log(`Got the following values from ad : ${util.inspect(value)}`);
						handleJSONAdsCallback(value);
					},
					function ()
					{
						KalturaLogger.error(`Failed to find ready ads for ads ${adKeys}`);
						errorCallback();
					},
					false
				);
			},
			function ()
			{
				KalturaLogger.error('Failed to get ready ad list from cache');
				errorCallback();
			}
		);
	}

	/**
	 * Creates an ad break layout including all the ads that are ready to display
	 * @param adReadyList
	 * @param cuePointId
	 * @param flavorId
	 * @param duration
	 * @returns string json structure of ad break
	 * @private
	 */
	_createReadyAdBreakLayout(adReadyList, cuePointId, flavorId, duration)
	{
		KalturaLogger.log(`Creating Ad break layout with the following ready ads: ${util.inspect(adReadyList)}`);
		let currentOffset = 0;
		let leftDuration = duration;
		const adBreakLayout = new AdBreakLayoutData();
		let foundFiller = null;
		const keys = Object.keys(adReadyList);
		for (let keyIdx = 0; keyIdx < keys.length; keyIdx++)
		{
			const adCacheDataObject = adReadyList[keys[keyIdx]];
			if (!adCacheDataObject.isFiller)
			{
				let durationForAd = adCacheDataObject.duration;
				if (adCacheDataObject.duration <= leftDuration)
					leftDuration = leftDuration - adCacheDataObject.duration;
				else
					if (leftDuration === 0)
						break;
					else
					{
						durationForAd = leftDuration;
						leftDuration = 0;
					}
				adBreakLayout.addClip(KalturaUtils.encodeString(adCacheDataObject.path), durationForAd);
				const trackingList = [];
				// add all the beacons
				for (let beaconIdx = 0; beaconIdx < adCacheDataObject.beaconList.length; beaconIdx++)
				{
					const beaconData = adCacheDataObject.beaconList[beaconIdx];
					const beaconOffset = KalturaTrackingManager.calculateBeaconOffset(beaconData.type, currentOffset, adCacheDataObject.duration);
					if (beaconOffset > duration)
					{
						KalturaLogger.log(`NOTICE: Beacon offset [${beaconOffset}] was defined larger than duration [${duration}] for ${util.inspect(beaconData)}`);
						continue;
					}
					if (beaconOffset === -1)
					{
						KalturaLogger.log(`NOTICE: Beacon of type  ${beaconData.type} is not supported skipping`);
						continue;
					}
					const innerId = crypto.createHash('md5').update(`${keys[keyIdx]}-${beaconIdx}`).digest('hex'); // to make it shorter we md5 it
					const beaconId = KalturaLayoutManager.generateBeaconRequest(cuePointId, beaconData.type, beaconData.url, flavorId, innerId);
					const notificationData = new NotificationLayoutData(beaconId, beaconOffset);
					trackingList.push(notificationData);
				}
				// NGINX expects the notification to be sorted
				trackingList.sort(NotificationLayoutData.compare);
				for (let trackIdx = 0; trackIdx < trackingList.length; trackIdx++)
					adBreakLayout.addNotification(trackingList[trackIdx]);
				currentOffset += durationForAd;
			}
			else
				foundFiller = adCacheDataObject;
		}

		if (leftDuration > 0 && foundFiller !== null)
			while (leftDuration > 0)
			{
				const fillerCurrentDuration = Math.min(leftDuration, foundFiller.duration);
				adBreakLayout.addClip(KalturaUtils.encodeString(foundFiller.path), fillerCurrentDuration);
				leftDuration = leftDuration - fillerCurrentDuration;
			}
		return adBreakLayout.toJSON();
	}

	/**
	 * @action adpath
	 * @param request
	 * @param response
	 * @param params
	 */
	adpath(request, response, params)
	{
		const This = this;
		response.dir(params);

		if (!this.validateActionArguments(params, ['clipId'], response))
			return;
		KalturaLogger.log(`Layout adpath called with clipId ${params.clipId}`);
		const adPath = KalturaUtils.decodeString(params.clipId);
		const adPathLayoutData = new AdPathLayoutData();
		adPathLayoutData.setPath(adPath);
		const jsonResponse = adPathLayoutData.toJSON();
		KalturaLogger.log(`adpath returning ${jsonResponse} for ad path request `);
		This.okResponse(response, jsonResponse, 'text/plain');
	}

	_generateFetchId(cuePointId, cuePointDuration, cuePointUrl, flavorList, fillerId)
	{
		const fetchId = new FetchIdentifier(cuePointId, cuePointUrl, flavorList, cuePointDuration, fillerId);
		return fetchId.toBase64();
	}


	_generateFetchUrl(fetchId)
	{
		return `fetch/warmup/fetchId/${fetchId}`;
	}

	/***
	 * create a url to call the sendBeacon action when beacon tracking is needed.
	 * given entryId, partnerId, cuePointId, beaconTrackingURL this method will make a one url that triggers trackingManager.sendBeacon method using http
	 */
	static generateBeaconRequest(cuePointId, type, url, flavorId, seqId)
	{
		const trackingId = new TrackingIdentifier(type, url, cuePointId, flavorId, seqId);
		return `tracking/sendBeacon/trackingId/${trackingId.toBase64()}`;
	}
}
module.exports = KalturaLayoutManager;
