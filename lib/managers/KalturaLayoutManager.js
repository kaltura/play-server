const kaltura = module.exports = require('../KalturaManager');
const util = require('util');
const Promise = require('bluebird');
const KalturaTrackingManager = require('./KalturaTrackingManager');
const VODManifestLayoutData = require('../dataObjects/layoutObjects/VODManifestLayoutData');
const DynamicClipDataArray = require('../dataObjects/layoutObjects/DynamicClipDataArray');
const SourceClipDataArray = require('../dataObjects/layoutObjects/SourceClipDataArray');
const NotificationLayoutData = require('../dataObjects/layoutObjects/NotificationLayoutData');
const AdBreakLayoutData = require('../dataObjects/layoutObjects/AdBreakLayoutData');
const AdPathLayoutData = require('../dataObjects/layoutObjects/AdPathLayoutData');
const VodData = require('../dataObjects/apiResponseObjects/VodData');
const KalturaTinyUrl = require('../utils/KalturaTinyUrl');
const AdBreakIdentifier = require('../dataObjects/URLDataObjects/AdBreakIdentifier');
const AdPathIdentifier = require('../dataObjects/URLDataObjects/AdPathIdentifier');
const FetchIdentifier = require('../dataObjects/URLDataObjects/FetchIdentifier');
const TrackingIdentifier = require('../dataObjects/URLDataObjects/TrackingIdentifier');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
const PathsGenerator = require('./helpers/PathsGenerator');
const AdBreakKeyHelper = require('./helpers/AdBreakKeyHelper');
const H264Verifier = require('../../tests/h264Testing/h264Verifier');
const KalturaFFMpegCmdGenerator = require('../utils/KalturaFFMpegCmdGenerator');
const KalturaFileUtils = require('../utils/KalturaFileUtils');
const LayoutHelper = require('./helpers/LayoutHelper');
const ServerInfra = require('../infra/ServerInfra');
const APIRequestHelper = require('./helpers/APIRequestHelper');
const APIRequestHelper = require('./helpers/APIRequestPromiseFactory');
require('../dataObjects/PlayServerConstants');

/* global KalturaConfig,KalturaLogger,KalturaUtils,KalturaCache,AD,FLAVORS_SIGN_SEPARATOR,BLACK_FILLER */

/**
 * @service layout
 *
 * This service is responsible for returning all different layout (actions)
 * - manifest layout
 * - ad break layout
 * - path layout
 *
 * Manager to handle all layout API requests
 * 1. layout for VOD entry (full length)
 * 2. layout for Ad-break (according to previously fetch command)
 */
class KalturaLayoutManager extends kaltura.KalturaManager {

	constructor()
	{
		super();
		this.apiConnector = new ApiServerClientConnector();
		this.layoutCacheTimeout = KalturaConfig.config.cache.layout;
	}

	_buildLayoutFromVodData(vodData, layoutManifestKey, partnerId, version, successCallback, errorCallback)
	{
		let body;
		const allBlackFillersReady = this._allBlackFillersExistOnDisk(vodData);
		if (vodData.cuePointList.length > 0 && allBlackFillersReady)
			body = this._createFullManifestLayout(vodData, version);
		else
		{
			const flavorIdsString = vodData.getAllFlavorIds().join(FLAVORS_SIGN_SEPARATOR);
			const fetchParams = { flavorIds: flavorIdsString , entryId: vodData.entry.id };
			this.callPlayServerService('fetch', 'initBlackFillers', partnerId, fetchParams);
			KalturaLogger.log(`Returning original video - no ads - all black fillers are not ready ${allBlackFillersReady} , number of cue points ${vodData.cuePointList.length}`);
			body = this._createNoCuePointsManifestLayout(vodData, version);
		}
		KalturaLogger.log(`Layout.manifest returns: ${body}`);
		KalturaCache.set(layoutManifestKey, body, this.layoutCacheTimeout,
			function ()
			{
				successCallback(body);
			},
			function (err)
			{
				errorCallback(err);
			}
		);
	}

	_deleteManifestKey(manifestKey, message)
	{
		KalturaLogger.log(`Deleting manifest layout key ${manifestKey} from cache due to ${message}`);
		KalturaCache.del(manifestKey,
			() => KalturaLogger.debug(`Managed to delete manifest key [${manifestKey}] that was calculated with error or empty response`),
			(err) => KalturaLogger.error(`Failed to delete manifest key [${manifestKey}] that was calculated with error or empty response due to ${util.inspect(err)}`)
		);
	}


	_buildManifestAndResponse(response, partnerId, flavorIds, uiConfId, entryId, layoutManifestKey, headers, uriPrefixFormat, version)
	{
		response.log(`Handling layout manifest request for partner [${partnerId}], uiConfId[${uiConfId}]`);
		const This = this;
		this.isPermissionAllowedForPartner(partnerId, 'FEATURE_PLAY_SERVER',
			function (isAllowed)
			{
				if (isAllowed)
				{
					This._getLayoutAPIInformation(partnerId, entryId, uiConfId, flavorIds, headers, uriPrefixFormat,
						function (vodData)
						{
							This._buildLayoutFromVodData(vodData, layoutManifestKey, partnerId, version,
								function (body)
								{
									This.okResponse(response, body, 'text/plain');
								},
								function (err)
								{
									This._deleteManifestKey(layoutManifestKey, 'Failed to build layout for vodData');
									This.errorResponse(response, 500, `Failed to set layout manifest in cache due to :${util.inspect(err)}`);
								}
							);
						},
						function (err)
						{
							This._deleteManifestKey(layoutManifestKey, 'Failed response from the API server');
							This.errorResponse(response, 424, `Failed response from the API server ${util.inspect(err)}`);
						}
					);
				}
				else
				{
					This._deleteManifestKey(layoutManifestKey, 'not allowed for play server');
					This.errorResponse(response, 428, `Partner ${partnerId} is not allowed for play server - please consult with the support team`);
				}
			}
		);
	}

	_allBlackFillersExistOnDisk(vodData)
	{
		for (const transcodingCommand of vodData.blackFillerTranscodeCommandList)
		{
			const blackFillerPath = PathsGenerator.generateSpecificTranscodedPath(PathsGenerator.getBlackFillerLocalPrefixPath(), transcodingCommand);
			if (!KalturaFileUtils.checkFileExistsSync(blackFillerPath))
				return false;
		}
		return true;
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
		if (!this.validateActionArguments(params, ['entryId', 'flavorId'], response))
			return;

		LayoutHelper.initEntryVersion(params.entryId,
			function ()
			{
				This._handleSessionIdVersion(params, LayoutHelper.getBaseVersion(), request, response);
			},
			function (addEntryErr)
			{
				KalturaLogger.log(`could not add entry ${params.entryId} version to cache , due to ${util.inspect(addEntryErr)}`);
				LayoutHelper.getEntryVersion(params.entryId,
					function (version)
					{
						if (version)
							This._handleSessionIdVersion(params, version.id, request, response);
						else
						{
							KalturaLogger.error(`No version found for entry ${params.entryId} ,Failed to handle layout manifest`);
							response.error('No entry version found ,Failed to handle layout manifest');
						}
					},
					function (getEntryErr)
					{
						KalturaLogger.error(`could not get entry ${params.entryId} version from cache , due to  ${util.inspect(getEntryErr)}`);
						response.error(`No entry version found - Failed to create layout manifest though handled : ${getEntryErr}`);
					}
				);
			}
		);
	}

	_handleSessionIdVersion(params, versionId, request, response)
	{
		const This = this;
		if(ServerInfra.isParamDefined(params, 'sessionId'))
		{
			LayoutHelper.initSessionVersion(`${params.entryId}_${params.sessionId}`, { id: versionId }, KalturaConfig.config.cache.sessionIdVersionTimeout,
				() => {
					const layoutManifestKey = This._getLayoutManifestKey(params, versionId);
					This._handleManifest(layoutManifestKey, request, response, params, versionId);
				},(addSessionErr) => {
					KalturaLogger.log(`could not add version ${versionId} to sessionId ${params.sessionId}, due to ${addSessionErr}`);
					LayoutHelper.getSessionVersion(`${params.entryId}_${params.sessionId}`,
						(version) => {
							if(version)
							{
								const layoutManifestKey = This._getLayoutManifestKey(params, version.id);
								This._handleManifest(layoutManifestKey, request, response, params, version.id);
							}
							else
							{
								KalturaLogger.error(`could not get session [${params.sessionId}] version from cache`);
								response.error(`could not get session version from cache`);
							}
						},(getSessionErr) => {
							KalturaLogger.error(`could not get version from cache to sessionId ${params.sessionId}, due to ${util.inspect(getSessionErr)}`);
							response.error(`could not get version from cache to sessionId`);
						}
					);
				});
		}
		else if(ServerInfra.isParamDefined(params, 'version')) //version must be set
		{
			const layoutManifestKey = This._getLayoutManifestKey(params, params.version);
			This._handleManifest(layoutManifestKey, request, response, params, params.version);
		}
		else
		{
			KalturaLogger.error(`Missing arguments [version, sessionId]`);
			response.error(`Missing arguments version or sessionId`);
		}
	}

	_handleManifest(layoutManifestKey, request, response, params, version)
	{
		const This = this;
		KalturaCache.add(layoutManifestKey, '', This.layoutCacheTimeout,
			function ()
			{
				KalturaLogger.log(`First time handling layout manifest for ${util.inspect(params)}`);
				const uiConfId = params.uiConfId || BLACK_FILLER;
				let flavors;
				if (request.url.indexOf('flavorId') === request.url.lastIndexOf('flavorId'))
					flavors = KalturaLayoutManager._getFlavorIdsFromParam(params.flavorId);
				else
					flavors = KalturaLayoutManager._getFlavorIdsFromUrl(request.url);
				This._buildManifestAndResponse(response, params.partnerId, flavors, uiConfId, params.entryId, layoutManifestKey, request.headers, params.uriPrefixFormat, version);
			},
			function (err)
			{
				KalturaLogger.log(`Could not add layout manifest key to cache ${layoutManifestKey} due to : ${util.inspect(err)}`);
				This._getLayoutFromCache(response, layoutManifestKey);
			}
		);
	}

	_getLayoutManifestKey(params, versionId)
	{
		const layoutKey = `partnerId-${params.partnerId}-entryId-${params.entryId}-flavorIds-${params.flavorId}-uiConfId-${params.uiConfId}`;
		return `${versionId}_${KalturaUtils.getShortHashKey(layoutKey)}`;
	}

	/**
	 * Constructs layout with the given entry content from begin to end
	 * @param vodData VodData
	 * @returns {*}
	 * @private
	 */
	_createNoCuePointsManifestLayout(vodData, version)
	{
		KalturaLogger.log(`Creating no ads manifest for vodData ${JSON.stringify(vodData)}`);
		const layout = new VODManifestLayoutData(vodData.selectedFlavorIdList, version);
		const contentClips = new SourceClipDataArray(0, vodData.getSelectedFlavorPaths()).clips;
		layout.addSequence(vodData.entry.msDuration, contentClips);
		return layout.toJSON();
	}

	_addAdBreakToLayout(layout, vodData, cuePoint, fetchId)
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
		return adBreakIds;
	}

	/**
	 * Constructs manifest layout according to the given structure
	 */
	_createFullManifestLayout(vodData, version)
	{
		KalturaLogger.log(`Creating a full manifest for vodData ${JSON.stringify(vodData)}`);
		const layout = new VODManifestLayoutData(vodData.selectedFlavorIdList, version);
		let timeLineOffset = 0;
		let contentOffset = 0;
		const filteredCuePoints = this._getFilteredCuePoints(vodData.cuePointList);
		const fillerId = this._getFillerId(vodData);
		for (let cueIndex = 0; cueIndex < filteredCuePoints.length; cueIndex++)
		{
			const cuePoint = filteredCuePoints[cueIndex];
			const isPreRoll = cuePoint.startTime <= 2000; // everything under 2 seconds is considered pre-roll
			const encodedFetchId = KalturaLayoutManager._generateFetchId(cuePoint.id, cuePoint.duration, cuePoint.sourceUrl, vodData.getAllFlavorIds(), fillerId, cuePoint.overlay);
			const url = KalturaLayoutManager._generateFetchUrl(encodedFetchId);
			const fetchTime = Math.max(timeLineOffset - KalturaConfig.config.adIntegration.preFetchWindow, 0);
			layout.addNotification(new NotificationLayoutData(url, fetchTime));
			if(cuePoint.overlay)
			{
				if (isPreRoll)
				{
					this._addAdBreakToLayout(layout, vodData, cuePoint, encodedFetchId);
					timeLineOffset = timeLineOffset + cuePoint.duration;
					contentOffset = contentOffset + cuePoint.duration;
					layout.setReferenceClipIndex(2);
				}
				else
				{
					// Handle mid movie cue point
					const contentClipArray = new SourceClipDataArray(contentOffset, vodData.getSelectedFlavorPaths());
					const contentDuration = cuePoint.startTime - contentOffset;
					contentOffset += contentDuration;
					if (contentDuration > 0)
						layout.addSequence(contentDuration, contentClipArray.clips);
					this._addAdBreakToLayout(layout, vodData, cuePoint, encodedFetchId);
					timeLineOffset = timeLineOffset + cuePoint.duration + contentDuration;
					contentOffset = contentOffset + cuePoint.duration;
				}
			}
			else //current handling
			{
				if (isPreRoll)
				{
					this._addAdBreakToLayout(layout, vodData, cuePoint, encodedFetchId);
					timeLineOffset = timeLineOffset + cuePoint.duration;
					layout.setReferenceClipIndex(2);
				}
				else
				{
					// Handle mid movie cue point
					const contentClipArray = new SourceClipDataArray(contentOffset, vodData.getSelectedFlavorPaths());
					const contentDuration = cuePoint.startTime - contentOffset;
					contentOffset += contentDuration;
					if (contentDuration > 0)
						layout.addSequence(contentDuration, contentClipArray.clips);
					this._addAdBreakToLayout(layout, vodData, cuePoint, encodedFetchId);
					timeLineOffset = timeLineOffset + cuePoint.duration + contentDuration;
					if (contentOffset !== vodData.entry.msDuration)
						contentOffset = contentOffset - (KalturaConfig.config.layout.secondsBackwardsAfterAd * 1000); //go two second backwards
				}
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
		const decodedAdIdentifier = KalturaTinyUrl.insert(adIdentifier);
		return decodedAdIdentifier;
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
				if (currentOffset !== previousOffset) // filters duplicate times
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
	 * @param selectedFlavorIds
	 * @param callback
	 */
	_getLayoutAPIInformation(partnerId, entryId, uiConfId, selectedFlavorIds, headers, uriPrefixFormat, callback, errorCallback)
	{
		const This = this;

		function getFlavorsWithoutSource(flavorAssetList)
		{
			const result = [];
			for (let idx = 0; idx < flavorAssetList.length; idx++)
			{
				const tags = flavorAssetList[idx].tags;
				if (tags.indexOf('source') === -1 && !flavorAssetList[idx].isOriginal)
					result.push(flavorAssetList[idx]);
			}
			return result;
		}

		function _parseApiResults(entryResponse, cuePointListResponse, flavorAssetListResponse, uiConfResponse)
		{
			if (cuePointListResponse.objectType !== 'KalturaCuePointListResponse')
				throw new Error(`invalid object type supplied - expecting KalturaCuePointListResponse, got ${cuePointListResponse.objectType}`);
			const cuePointsList = cuePointListResponse.objects;
			if (flavorAssetListResponse.objectType !== 'KalturaFlavorAssetListResponse')
				throw new Error(`invalid object type supplied - expecting KalturaFlavorAssetListResponse, got ${flavorAssetListResponse.objectType}`);
			let flavorAssetList = flavorAssetListResponse.objects;
			flavorAssetList = getFlavorsWithoutSource(flavorAssetList);
			const promises = [];
			for (let i = 0; i < flavorAssetList.length; i++)
			{
				promises.push(APIRequestHelper.getFlavorPath(flavorAssetList[i].id, partnerId, headers, uriPrefixFormat));
				promises.push(KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorAssetList[i].id, null, KalturaConfig.config.layout.fillerDefaultDurationSecs, This.apiConnector, partnerId));
			}
			for (let i=0; i < cuePointsList; i++)
			{
				promises.push(APIRequestPromiseFactory.listCuePointMetadataPromise(connector,KalturaConfig.config.layout.metadataProfileId, cuePointsList[i].id, partnerId));
			}
			Promise.all(promises).then(
				function (promiseResults)
				{
					const blackFillerTranscodingCommandList = [];
					for (let i = 0; i < flavorAssetList.length; i++)
					{
						const promiseIdx = (i * 2);
						if (KalturaConfig.config.h264Verification.enabled === 'true')
							H264Verifier.insertFlavorPathToCache(flavorAssetList[i].id, promiseResults[promiseIdx]);
						flavorAssetList[i].url = promiseResults[promiseIdx];
						blackFillerTranscodingCommandList.push(promiseResults[promiseIdx + 1]);
					}
					for (let i=0; i < cuePointsList.length; i++)
					{
						if(promiseResults[i].objects[0].xml)
						{
							cuePointsList[i].overlay = true;
						}
					}
					const vodData = new VodData(partnerId, flavorAssetList, selectedFlavorIds, entryResponse, uiConfResponse, cuePointsList, blackFillerTranscodingCommandList);
					callback(vodData);
				},
				errorCallback
			);
		}

		function callAPIServer()
		{
			return APIRequestHelper.getLayoutAPIInfo(partnerId, entryId, uiConfId, _parseApiResults, errorCallback);
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
	_getFlavorPath(flavorId, partnerId, headers, uriPrefixFormat)
	{
		return new Promise(
			function (resolve, reject)
			{
				// build the http request
				let headersToSend = null;
				const host = headers['host'];
				const url = PathsGenerator.generateApiServerFlavorURL(partnerId, flavorId, true, uriPrefixFormat);
				KalturaLogger.debug(`Using the following URL to get flavor path : ${url}`);
				KalturaUtils.getHttpUrl(url, headersToSend,
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
	adbreak(request, response, params, didInnerFetchRun = false)
	{
		const This = this;
		response.dir(params);

		if (!this.validateActionArguments(params, ['adId', 'sessionId', 'entryId'], response))
			return;

		function _handleAdBreak(adId)
		{
			KalturaLogger.log(`LayoutManager.adbreak got ${JSON.stringify(adId)} as argument `);
			const cuePointId = adId.cuePointId;
			const flavorId = adId.flavorId;
			const breakDuration = adId.duration;
			const fetchId = adId.fetchId;
			const adsReadyKey = AdBreakKeyHelper.getReadyAdsCacheKey(cuePointId, params.sessionId);
			KalturaLogger.log(`Constructed this key to get the ads: ${adsReadyKey} `);
			This._getReadyAdsFromCacheForFlavor(adsReadyKey, flavorId, didInnerFetchRun, true,
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
				function (err)
				{
					KalturaLogger.log(`Found no ads ready for ad break key ${adsReadyKey}, this probably means that the fetch warmup did not occur will initiate fetch and recall adbreak. error is : ${err}`);
					if (didInnerFetchRun)
					{
						This.errorResponse(response, 500, `Could not create ads for entry id ${params.entryId} validated fetch had run.`);
						return;
					}
					const fetchParams = { fetchId, sessionId: params.sessionId, entryId: params.entryId };
					This.callPlayServerService('fetch', 'innerWarmup', params.partnerId, fetchParams);
					setTimeout(
						function ()
						{   // call ourselves after we allow fetch to occur
							This.adbreak(request, response, params, true);
						}, KalturaConfig.config.layout.millisBetweenInnerFetchAndLayout);
				}
			);
		}

		AdBreakIdentifier.getAdBreakId(params.adId, _handleAdBreak,(err)=>{return;});
	}

	_getReadyAdsFromCacheForFlavor(adsReadyKey, flavorId, shouldBlock, shouldGiveSecondChance, handleJSONAdsCallback, errorCallback)
	{
		const This = this;
		KalturaCache.get(adsReadyKey,
			function(allAdsReadyCacheValue)
			{
				if (!allAdsReadyCacheValue || allAdsReadyCacheValue.length === 0)
					return errorCallback(`Could not find any ready ads for the constructed key : ${adsReadyKey}`);
				const adBreakKeyHelper = new AdBreakKeyHelper(allAdsReadyCacheValue);
				if (adBreakKeyHelper.areThereErrors())
				{
					const fillerKey = adBreakKeyHelper.getFillerForFlavor(flavorId);

					if (!fillerKey)
						return errorCallback('There were errors during calculation of the ad break and the black fillers are not ready ');
					return This._processAdBreakReadyKeys([fillerKey], handleJSONAdsCallback, errorCallback);
				}
				if (!adBreakKeyHelper.areAllBlackFillersReady())
				{
					return setTimeout(
						function ()
						{
							This._getReadyAdsFromCacheForFlavor(adsReadyKey, flavorId, shouldBlock, shouldGiveSecondChance, handleJSONAdsCallback, errorCallback);
						},
						KalturaConfig.config.layout.millisAdBreakRetryTimeout
					);
				}
				// we block the key to analyze at this point in time and not further
				if (shouldBlock)
				{
					return AdBreakKeyHelper.blockKey(adsReadyKey,
						function ()
						{
							This._getReadyAdsFromCacheForFlavor(adsReadyKey, flavorId, false, shouldGiveSecondChance, handleJSONAdsCallback, errorCallback);
						}
					);
				}

				if (shouldGiveSecondChance && !adBreakKeyHelper.areAllAdsReady())
				{
					return setTimeout(
						function ()
						{
							This._getReadyAdsFromCacheForFlavor(adsReadyKey, flavorId, true, !adBreakKeyHelper.areAllBlackFillersReady(), handleJSONAdsCallback, errorCallback);
						},
						KalturaConfig.config.layout.millisAdBreakRetryTimeout
					);
				}
				// we block in any case (double block)
				AdBreakKeyHelper.blockKey(adsReadyKey);
				const adBreakReadyKeys = adBreakKeyHelper.getAdBreakReadyKeysForFlavor(flavorId);
				KalturaLogger.log(`The following ads were found as ready in cache : ${util.inspect(adBreakReadyKeys)}`);
				if (adBreakReadyKeys.length === 0)
					return errorCallback(`Could not find any ready ad (not even filler) for key : ${adsReadyKey}`);
				This._processAdBreakReadyKeys(adBreakReadyKeys, handleJSONAdsCallback, errorCallback);
			},
			function ()
			{
				errorCallback('Failed to get ready ad list from cache');
			}
		);
	}

	_processAdBreakReadyKeys(adBreakReadyKeys, handleJSONAdsCallback, errorCallback)
	{
		KalturaCache.getMulti(adBreakReadyKeys,
			function (value)
			{
				KalturaLogger.log(`Got the following values from ad : ${util.inspect(value)}`);
				handleJSONAdsCallback(value);
			},
			function ()
			{
				errorCallback(`Failed to find ready ads for ads ${adBreakReadyKeys}`);
			},
			false
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
			if (adCacheDataObject.type === AD)
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
				adBreakLayout.addClip(KalturaLayoutManager._generateAdPathId(adCacheDataObject.path), durationForAd);
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
					const innerId = KalturaUtils.getShortHashKey(`${keys[keyIdx]}-${beaconIdx}`);
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
		{
			while (leftDuration > 0)
			{
				const fillerCurrentDuration = Math.min(leftDuration, foundFiller.duration);
				adBreakLayout.addClip(KalturaLayoutManager._generateAdPathId(foundFiller.path), fillerCurrentDuration);
				leftDuration = leftDuration - fillerCurrentDuration;
			}
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
		function _handleAdPath(adPathIdentifier)
		{
			if (!This.validateActionArguments(params, ['clipId'], response))
				return;
			KalturaLogger.log(`Layout adpath called with clipId ${params.clipId}`);
			const adPath = adPathIdentifier.path;
			const adPathLayoutData = new AdPathLayoutData();
			adPathLayoutData.setPath(adPath);
			const jsonResponse = adPathLayoutData.toJSON();
			KalturaLogger.log(`adpath returning ${jsonResponse} for ad path request `);
			This.okResponse(response, jsonResponse, 'text/plain');
		}
		AdPathIdentifier.getAdPath(params.clipId, _handleAdPath);
	}

	static _generateFetchId(cuePointId, cuePointDuration, cuePointUrl, flavorList, fillerId, cuePointOverlay)
	{
		const fetchId = new FetchIdentifier(cuePointId, cuePointUrl, flavorList, cuePointDuration, fillerId, cuePointOverlay);
		const encodedFetchId = KalturaTinyUrl.insert(fetchId);
		return encodedFetchId;
	}

	static _generateAdPathId(path)
	{
		const pathId = new AdPathIdentifier(path);
		const encodedAdPathId = KalturaTinyUrl.insert(pathId);
		return encodedAdPathId;
	}


	static _generateFetchUrl(encodedFetchId)
	{
		return `fetch/warmup/fetchId/${encodedFetchId}`;
	}

	/***
	 * create a url to call the sendBeacon action when beacon tracking is needed.
	 * given entryId, partnerId, cuePointId, beaconTrackingURL this method will make a one url that triggers trackingManager.sendBeacon method using http
	 */
	static generateBeaconRequest(cuePointId, type, url, flavorId, seqId)
	{
		const trackingId = new TrackingIdentifier(type, url, cuePointId, flavorId, seqId);
		const decodedTrackingId =  KalturaTinyUrl.insert(trackingId);
		return `tracking/sendBeacon/trackingId/${decodedTrackingId}`;
	}

	static _getFlavorIdsFromParam(flavorIdsStr)
	{
		let flavors = flavorIdsStr.split(',');
		if (!flavors[0].endsWith('_'))
			return flavors;

		//taking first element as prefix
		let prefix = flavors.shift();
		let outFlavors = [];
		for (let i = 0; i < flavors.length; i++)
		{
			if (flavors[i].trim() != "")
				outFlavors.push(prefix + flavors[i]);
		}
		return outFlavors;
	}

	static _getFlavorIdsFromUrl(origInput)
	{
		const flavorIdsStr = origInput.substr(origInput.indexOf("flavorId/") + 9);

		let inputs = flavorIdsStr.split(/[\/,]/);
		let output = [];
		let i = 0;
		while (i < inputs.length)
		{
			let flavorId = null;
			if (inputs[i] == 'flavorId')
			{
				output.push(inputs[i+1]);
				i = i+2;
			}
			else
				i = i+1;
		}
		KalturaLogger.debug(`Parsed the following flavor ids from request: [${util.inspect(output)}]`);
		return output;
	}
}
module.exports = KalturaLayoutManager;
