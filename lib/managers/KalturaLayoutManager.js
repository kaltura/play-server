/**
 * Manager to handle all layout API requests
 * 1. layout for VOD entry (full length)
 * 2. layout for Ad-break (according to previously fetch command)
 */
const util = require('util');
const kaltura = module.exports = require('../KalturaManager');
const KalturaFetchManager = require('./KalturaFetchManager');
const KalturaTrackingManager = require('./KalturaTrackingManager');
const VODManifestLayoutData = require('../dataObjects/layoutObjects/VODManifestLayoutData');
const DynamicClipDataArray = require('../dataObjects/layoutObjects/DynamicClipDataArray');
const SourceClipData = require('../dataObjects/layoutObjects/SourceClipData');
const SourceClipDataArray = require('../dataObjects/layoutObjects/SourceClipDataArray');
const NotificationLayoutData = require('../dataObjects/layoutObjects/NotificationLayoutData');
const AdBreakLayoutData = require('../dataObjects/layoutObjects/AdBreakLayoutData');
const AdPathLayoutData = require('../dataObjects/layoutObjects/AdPathLayoutData');
const VodData = require('../dataObjects/apiResponseObjects/VodData');
const AdBreakIdentifier = require('../dataObjects/URLDataObjects/AdBreakIdentifier');
const FetchIdentifier = require('../dataObjects/URLDataObjects/FetchIdentifier');
const TrackingIdentifier = require('../dataObjects/URLDataObjects/TrackingIdentifier');
const AdCacheData = require('../dataObjects/CacheDataObjects/AdCacheData');
const BeaconCacheData = require('../dataObjects/CacheDataObjects/BeaconCacheData');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
const KalturaFFMpegCmdGenerator = require('../utils/KalturaFFMpegCmdGenerator');
const TranscodingEngine = require('../infra/TranscodingEngine');
const Promise = require('bluebird');
const fs = require('fs');

const engine = new TranscodingEngine('ffmpeg');

const BLACK_FILLER = 'BLACK_FILLER';

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
		this._initActionCall(params, request);
		const flavors = params.flavorIds.split(',');
		response.log(`Handling layout manifest request for partner [${params.partnerId}] flavor ids [${flavors}]`);
		const uiConfId = params.uiConfId || BLACK_FILLER;

		this.isPermissionAllowedForPartner(params.partnerId, 'FEATURE_PLAY_SERVER',
			function (isAllowed)
			{
				This._getLayoutAPIInformation(params.partnerId, params.entryId, flavors, uiConfId,
					function (vodData)
					{
						let body;
						//This._validateFillerExists(vodData);
						if (isAllowed && vodData.cuePointList.totalCount > 0)
							body = This._createFullManifestLayout(vodData);
						else
							body = This._createNoCuePointsManifestLayout(vodData);
						KalturaLogger.log(`Layout.manifest returns: ${body}`);
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
	 * Returns the local path for a filler that is a flavor asset in the
	 * @param fillerId
	 * @returns {string}
	 * @private
	 */
	static _getOriginFillerLocalPath(fillerId)
	{
		return KalturaConfig.config.cloud.sharedBasePath + '/filler/' + fillerId;
	}

	static _getBlackFillerLocalPath(cmdLine)
	{
		return KalturaConfig.config.cloud.sharedBasePath + '/filler/black_' + cmdLine.md5();
	}


	_validateFillerExists(vodData)
	{
		const This = this;
		this,_validateBlackFiller(vodData);
		if (vodData.uiConf && vodData.uiConf.config)
		{
			try
			{
				const uiConfConfiguration = JSON.parse(vodData.uiConf.config);
				const fillerFlavorId = uiConfConfiguration.plugins.vast.slateContent;
				// check if file exists on disk
				const fillerOriginLocalPath = KalturaLayoutManager._getOriginFillerLocalPath(fillerFlavorId);
				fs.access(fillerOriginLocalPath, fs.constants.F_OK,
					function(err)
					{
						if (err === null)
						{
							// original filler exists
							// check if transcoded filler exists
							MediaInfo.mediaInfoExec(fillerOriginLocalPath).then(
								function (mediaInfoForFiller)
								{
									for (let i = 0; i < vodData.flavorDataList.length; i++)
									{
										const flavorId = vodData.flavorDataList[i].id;
										KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, mediaInfoForFiller, KalturaConfig.config.layout.fillerDefaultDurationSecs, This.apiConnector, vodData.partnerId).then(
											function (cmdLine)
											{
												const transcodedPath = KalturaFetchManager._generateSpecificTranscodedPath(fillerOriginLocalPath, cmdLine);
												fs.access(transcodedPath, fs.constants.F_OK,
													function(err)
													{
														if (err !== null)
														{
															const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(cmdLine, fillerOriginLocalPath, transcodedPath);
															engine.transcodeFile(commandLine).then(
																function (data)
																{
																	KalturaLogger.log(`Managed to transcode and save file ${transcodedPath}`);
																},
																function(err)
																{
																	KalturaLogger.error(`Failed to transcode file to path ${transcodedPath} due to error: ${err}`);
																}
															);
														}
													}
												);
											}
										);
									}
								},
								function (err)
								{
									// black filler
									KalturaLogger.log(`Expect black filler 1 ${err}`);
								}
							);
							// if not transcode otherwise validate as existing

						}
						else
						{
							// if does not exist download - else true
							This.apiConnector.handleApiRequest('flavorAsset', 'getUrl', [fillerFlavorId], vodData.partnerId).then(
								function (url)
								{
									KalturaUtils.downloadHttpUrl(url, { filePath: fillerOriginLocalPath},
										function (filePath)
										{
											KalturaLogger.log(`Downloaded filler origin to path ${filePath})`);
											// transcoded filler does not exist - transcode it
											MediaInfo.mediaInfoExec(filePath).then(
												function (mediaInfoForFiller)
												{
													for (let i = 0; i < vodData.flavorDataList.length; i++)
													{
														const flavorId = vodData.flavorDataList[i].id;
														KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, mediaInfoForFiller, KalturaConfig.config.layout.fillerDefaultDurationSecs, This.apiConnector, vodData.partnerId).then(
															function (cmdLine)
															{
																const transcodedPath = KalturaFetchManager._generateSpecificTranscodedPath(filePath, cmdLine);
																const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(cmdLine, filePath, transcodedPath);
																engine.transcodeFile(commandLine).then(
																	function (data)
																	{
																		KalturaLogger.log(`Managed to transcode and save file ${transcodedPath}`);
																	},
																	function(err)
																	{
																		KalturaLogger.error(`Failed to transcode file to path ${transcodedPath} due to error: ${err}`);
																	}
																);
															}
														);
													}
												},
												function (err)
												{
													// black filler
													KalturaLogger.log(`Expect black filler 1 ${err}`);
												}
											);
										},
										function (err)
										{
											// black filler
											KalturaLogger.log(`Expect black filler 2 ${err}`);
										}
									);
								},
								function (err)
								{
									// should redirect to black filler
									KalturaLogger.log(`Expect black filler 3 ${err}`);
								}

							);
						}
					}
				);
			}
			catch (e)
			{
				// should redirect to black filler
				KalturaLogger.log(`Expect black filler 4 ${e}`);
			}
		}
		else
		{
			// should redirect to black filler
			KalturaLogger.log(`Expect black filler 5 `);
		}
	}

	_validateBlackFiller(vodData)
	{
		const flavorIds = vodData.getOnlyFlavorIds();
		for (let i = 0; i < flavorIds.length; i++)
		{
			const flavorId = flavorIds[i];
			KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, null, KlaturaConfig.config.layout.fillerDefaultDuration, this.apiConnector, vodData.partnerId).then(
				function (command)
				{
					const transcodedPath = KalturaLayoutManager._getBlackFillerLocalPath(command);
					fs.access(transcodedPath, fs.constants.F_OK,
						function (err)
						{
							if (err !== null)
							{
								const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(command, null, transcodedPath);
								engine.transcodeFile(commandLine).then(
									function (data)
									{
										KalturaLogger.log(`Managed to transcode and save file ${transcodedPath}`);
									},
									function(err)
									{
										KalturaLogger.error(`Failed to transcode file to path ${transcodedPath} due to error: ${err}`);
									}
								);
							}
						}
					);
				},
				function (err)
				{
					KalturaLogger.error('Failed to get command line to transcode black filler' + err);
				}
			);
		}
	}



	/**
	 * Constructs layout with the given entry content from begin to end
	 * @param vodData VodData
	 * @returns {*}
	 * @private
	 */
	_createNoCuePointsManifestLayout(vodData)
	{
		KalturaLogger.log(`Creating no ads manifest for vodData ${vodData}`);
		const layout = new VODManifestLayoutData(vodData.numOfFlavors);
		const contentClips = new SourceClipDataArray(0, vodData.getOnlyFlavorPaths()).clips;
		layout.addSequence(vodData.entry.msDuration, contentClips);
		return layout.toJSON();
	}

	/**
	 * Constructs manifest layout according to the given structure
	 */
	_createFullManifestLayout(vodData)
	{
		KalturaLogger.log(`Creating a full manifest for vodData ${JSON.stringify(vodData)}`);
		const layout = new VODManifestLayoutData(vodData.numOfFlavors);
		let lastOffset = 0;
		let contentOffset = 0;
		const filteredCuePoints = this._getFilteredCuePoints(vodData.cuePointList);
		const fillerId = this._getFillerId(vodData);
		for (let cueIndex = 0; cueIndex < filteredCuePoints.length; cueIndex++)
		{
			const cuePoint = filteredCuePoints[cueIndex];
			// Handle Pre-Roll
			if (cuePoint.startTime === 0)
			{
				// TODO handle pre-roll
			}
			// Handle mid movie cue point
			const contentClipArray = new SourceClipDataArray(contentOffset, vodData.getOnlyFlavorPaths());
			const contentDuration = cuePoint.startTime - lastOffset;
			contentOffset += contentDuration;
			layout.addSequence(contentDuration, contentClipArray.clips);
			const adBreakIds = [];
			for (let i = 0; i < vodData.flavorDataList.length; i++)
			{
				const flavorId = vodData.flavorDataList[i].key;
				const adBreakIdentifier = this._generateIdentifierForAdBreak(cuePoint.id, cuePoint.duration, flavorId, fillerId);
				adBreakIds.push(adBreakIdentifier);
			}
			const adBreakClipArray = new DynamicClipDataArray(adBreakIds);
			layout.addSequence(cuePoint.duration, adBreakClipArray.clips);
			lastOffset = lastOffset + cuePoint.duration + contentDuration;
		}
		// Rest of the movie should be content (if such exists)
		if (vodData.entry.msDuration > lastOffset)
		{
			const contentClips = new SourceClipDataArray(contentOffset, vodData.getOnlyFlavorPaths());
			const contentDuration = vodData.entry.msDuration - lastOffset;
			layout.addSequence(contentDuration, contentClips.clips);
		}
		// add the pre-fetch notifications
		for (let cueIndex = 0; cueIndex < filteredCuePoints.length; cueIndex++)
		{
			const cuePoint = filteredCuePoints[cueIndex];
			const url = this._generateFetchUrl(
				cuePoint.id, cuePoint.duration, cuePoint.sourceUrl, vodData.getOnlyFlavorIds(), fillerId);
			const fetchTime = Math.max(cuePoint.startTime - (KalturaConfig.config.adIntegration.preFetchWindow), 0);
			const fetchData = new NotificationLayoutData(url, fetchTime);
			layout.addNotification(fetchData);
		}
		return layout.toJSON();
	}

	_getFillerId(vodData)
	{
		try
		{
			return vodData.uiConf.plugins.vast.slateContent;
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
	 */
	_generateIdentifierForAdBreak(cuePointId, duration, flavorId)
	{
		const adIdentifier = new AdBreakIdentifier(cuePointId, flavorId, duration);
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
	_getFilteredCuePoints(cuePointsListResponse)
	{
		if (cuePointsListResponse.objectType !== 'KalturaCuePointListResponse')
			KalturaLogger.error(`invalid object type supplied - expecting KalturaCuePointListResponse, got ${cuePointsListResponse.objectType}`);
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
	_getLayoutAPIInformation(partnerId, entryId, flavorIds, uiConfId, callback, errorCallback)
	{
		const This = this;
		this.getClient(KalturaConfig.config.client,
			function ()
			{
				const promises = [];
				promises.push(This._getAPIV3Information(partnerId, entryId, uiConfId));
				for (let i = 0; i < flavorIds.length; i++)
					promises.push(This._getFlavorPath(flavorIds[i]));

				Promise.all(promises).then(
					function (results)
					{
						const entryResponse = results[0][0];
						const cuePointsListResponse = results[0][1];
						const uiConfResponse = (uiConfId === BLACK_FILLER) ?  BLACK_FILLER : results[0][2];
						const flavorPaths = results.slice(1);
						const vodData = new VodData(partnerId, flavorIds, entryResponse, uiConfResponse, cuePointsListResponse, flavorPaths);
						callback(vodData);
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
				This.impersonate(partnerId);
				This.client.startMultiRequest();
				// 0. Entry Data
				This.client.baseEntry.get(null, entryId);
				// 1. Cue points list
				const cueFilter = new kaltura.client.objects.KalturaAdCuePointFilter();
				cueFilter.entryIdEqual = entryId;
				cueFilter.statusEqual = kaltura.client.enums.KalturaCuePointStatus.READY;
				cueFilter.cuePointTypeEqual = kaltura.client.enums.KalturaCuePointType.AD;
				// define a page - yet the amount of cue-points are not supposed to be even close to 500
				const cuePointsPager = new kaltura.client.objects.KalturaFilterPager();
				cuePointsPager.pageSize = 500;
				This.client.cuePoint.listAction(null, cueFilter, cuePointsPager);
				// 2. UI conf
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
						if (uiConfId !== BLACK_FILLER)
							callers.push('uiConf.get');
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
	adbreak(request, response, params)
	{
		const This = this;
		response.dir(params);

		if (!this.validateActionArguments(params, ['adId', 'sessionId'], response))
			return;
		const adId = AdBreakIdentifier.fromBase64(params.adId);
		KalturaLogger.log(`LayoutManager.adbreak got ${JSON.stringify(adId)} as argument `);
		const cuePointId = adId.cuePointId;
		const flavorId = adId.flavorId;
		const breakDuration = adId.duration;
	        let adsReadyKey = KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, flavorId, params.sessionId]);
		KalturaLogger.log(`Constructed this key to get the ads: ${adsReadyKey}`);
		this._getReadyAdsFromCache(adsReadyKey,
			function (adReadyList)
			{
				KalturaLogger.log(`Got the following ads (ready) from cache : ${JSON.stringify(adReadyList)}`);
				const body = This._createReadyAdBreakLayout(adReadyList, cuePointId, flavorId, breakDuration);
				KalturaLogger.log(`Response for ad break for adId ${params.adId} is : ${body}`);
				This.okResponse(response, body, 'text/plain');
			},
			function ()
			{
				KalturaLogger.error(`Found no ads ready for ad break key ${adsReadyKey}, this probably means that the fetch warmup did not occur`);
				This._createFillerAdBreakLayout(adId.fillerId, flavorId, breakDuration,
					function (body){
						KalturaLogger.log(`Response for ad break for adId ${params.adId} is : ${body}`);
						This.okResponse(response, body, 'text/plain');
					}
				);

			}
		);
	}

	_getReadyAdsFromCache(adsReadyKey, handleJSONAdsCallback, errorCallback)
	{
		KalturaCache.get(adsReadyKey,
			function(adReadyListCache)
			{
				let adReadyListCacheValue = adReadyListCache.value;
				KalturaLogger.log(`DELETE for the following from the cache ads the ads list : ${adReadyListCacheValue}`);
				if (!adReadyListCacheValue)
				{
					KalturaLogger.error(`Could not find any ready ad (not even filler) for key : ${adsReadyKey}`);
				}
				//const getAdsPromises = [];
				const adKeys = [];
				const adsReadyCacheKeys = adReadyListCacheValue.split('#');
				for (let i = 0; i < adsReadyCacheKeys.length; i++)
				{
					if (adsReadyCacheKeys[i].length > 0)
						adKeys.push(adsReadyCacheKeys[i]);
				}
				KalturaCache.getMulti(adKeys,
					function (value)
					{
						KalturaLogger.log(`DELETE got the following values from ad : ${JSON.stringify(value)}`);
						handleJSONAdsCallback(value);
					},
					function ()
					{
						KalturaLogger.error(`Failed to find ready ad ${adsReadyCacheKeys[i]}`);
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


	_createFillerAdBreakLayout(flavorId, fillerId, partnerId, breakDuration, callback)
	{
		if (fillerId === BLACK_FILLER)
		{
			KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, null, KalturaConfig.config.layout.fillerDefaultDurationSecs, this.apiConnector, partnerId).then(
				function (cmdLine)
				{
					const blackFillerLocalPath = KalturaLayoutManager._getBlackFillerLocalPath(cmdLine);
					// todo - don't trust luck - check that the file exists and if not create it
					const adBreakLayout = new AdBreakLayoutData();
					let leftDuration = breakDuration;
					while (leftDuration !== 0 )
					{
						const fillerCurrentDuration = Math.min(leftDuration, KalturaConfig.config.layout.fillerDefaultDurationSecs);
						adBreakLayout.addClip(KalturaUtils.encodeString(blackFillerLocalPath), fillerCurrentDuration);
						leftDuration = leftDuration - fillerCurrentDuration;
					}
					callback(adBreakLayout.toJSON());
				}
			);
		}
		else
		{
			const originlFillerLocalPath = KalturaLayoutManager._getOriginFillerLocalPath(fillerId);
			MediaInfo.mediaInfoExec(originlFillerLocalPath).then(
				function (mediaInfoForFiller)
				{
					KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, mediaInfoForFiller, KalturaConfig.config.layout.fillerDefaultDurationSecs, this.apiConnector, partnerId).then(
						function (cmdLine)
						{
							const transcodedPath = KalturaFetchManager._generateSpecificTranscodedPath(originlFillerLocalPath, cmdLine);
							// todo - don't trust luck - check that the file exists and if not create it
							const adBreakLayout = new AdBreakLayoutData();
							let leftDuration = breakDuration;
							while (leftDuration !== 0 )
							{
								const fillerCurrentDuration = Math.min(leftDuration, KalturaConfig.config.layout.fillerDefaultDurationSecs);
								adBreakLayout.addClip(KalturaUtils.encodeString(transcodedPath), fillerCurrentDuration);
								leftDuration = leftDuration - fillerCurrentDuration;
							}
							callback(adBreakLayout.toJSON());
						}
					);
				}
			);
		}
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
		KalturaLogger.log(`Creating Ad break layout with the following ready ads: ${JSON.stringify(adReadyList)}`);
		let currentOffset = 0;
		let leftDuration = duration;
		const adBreakLayout = new AdBreakLayoutData();
		let foundFiller = null;
		for (let adId = 0 ; adId < adReadyList.length ; adId++ )
		{
			const adCacheDataObject = adReadyList[adId];
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
			if (!adCacheDataObject.isFiller)
			{
				// add all the beacons
				for (let beaconIdx = 0; beaconIdx < adCacheDataObject.beaconList.length; beaconIdx++)
				{
					const beaconData = adCacheDataObject.beaconList[beaconIdx];
					const beaconOffset = KalturaTrackingManager.calculateBeaconOffset(beaconData.type, currentOffset, adCacheDataObject.duration);
					if (beaconOffset > duration)
						continue;
					const beaconId = KalturaLayoutManager.generateBeaconRequest(cuePointId, beaconData.type, beaconData.url, flavorId);
					const notificationData = new NotificationLayoutData(beaconId, beaconOffset);
					adBreakLayout.addNotification(notificationData);
				}
			}
			else
				foundFiller = adCacheDataObject;
			currentOffset += durationForAd;
		}
		if (leftDuration > 0 && foundFiller !== null)
			while (leftDuration !== 0 )
			{
				const fillerCurrentDuration = Math.min(leftDuration, KalturaConfig.config.layout.fillerDefaultDurationSecs);
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
		this._initActionCall(params, request);
		const adPath = KalturaUtils.decodeString(params.clipId);
		const adPathLayoutData = new AdPathLayoutData();
		adPathLayoutData.setPath(adPath);
		const jsonResponse = adPathLayoutData.toJSON();
		KalturaLogger.log(`adpath returning ${jsonResponse} for ad path request `);
		This.okResponse(response, jsonResponse, 'text/plain');
	}

	_generateFetchUrl(cuePointId, cuePointDuration, cuePointUrl, flavorList, fillerId)
	{
		const fetchId = new FetchIdentifier(cuePointId, cuePointUrl, flavorList, cuePointDuration, fillerId)
		return `fetch/warmup/fetchId/${fetchId.toBase64()}`;
	}

	/***
	 * create a url to call the sendBeacon action when beacon tracking is needed.
	 * given entryId, partnerId, cuePointId, beaconTrackingURL this method will make a one url that triggers trackingManager.sendBeacon method using http
	 */
	static generateBeaconRequest(cuePointId, type, url, flavorId)
	{
		const trackingId = new TrackingIdentifier(type, url, cuePointId, flavorId);
		return `tracking/sendBeacon/trackingId/${trackingId.toBase64()}`;
	}
}
module.exports = KalturaLayoutManager;
