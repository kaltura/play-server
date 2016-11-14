const util = require('util');
const Promise = require('bluebird');
const kaltura = module.exports = require('../KalturaManager');
const FetchIdentifier = require('../dataObjects/URLDataObjects/FetchIdentifier');
const VideoAttributes = require('../dataObjects/apiResponseObjects/VideoAttributes');
const AdCacheData = require('../dataObjects/CacheDataObjects/AdCacheData');
const BeaconCacheData = require('../dataObjects/CacheDataObjects/BeaconCacheData');
const KalturaVastParser = require('../protocols/vast/KalturaVastParser');
const VastDurationFilter = require('../protocols/vast/filters/VastDurationFilter');
const VastTrackingParser = require('../protocols/vast/filters/VastTrackingParser');
const VastSizeFilter = require('../protocols/vast/filters/VastSizeFilter');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
const KalturaMediaInfo = require('../utils/KalturaMediaInfo');
const KalturaFFMpegCmdGenerator = require('../utils/KalturaFFMpegCmdGenerator');
const TranscodingHelper = require('./helpers/TranscodingHelper');
const PathsGenerator = require('./helpers/PathsGenerator');
const AdBreakKeyHelper = require('./helpers/AdBreakKeyHelper');
const TranscodingEngine = require('../infra/TranscodingEngine');
const continuationLocalStorage = require('continuation-local-storage');
const KalturaTempFileHandler = require('../utils/KalturaTempFileHandler');
require('../utils/KalturaUrlTokenMapper');

require('../dataObjects/PlayServerConstants');
/* global KalturaLogger KalturaCache KalturaUtils KalturaConfig BLACK_FILLER FILLER TEN_RADIX FLAVORS_SIGN_SEPARATOR*/
/**
 * @service fetch
 *
 * This service is responsible for preparing and deciding if the ad is going to play
 */
class KalturaFetchManager extends kaltura.KalturaManager
{
	constructor()
	{
		super();
		this.apiConnector = new ApiServerClientConnector();
		this.transcodingEngine = new TranscodingEngine('ffmpeg');
		this.mediaInfo = new KalturaMediaInfo('ffprobe');
	}

	/**
	 * @action fetch.innerWarmup
	 */
	innerWarmup(request, response, params)
	{
		const paramsDuplicate = this.parsePlayServerParams(response, params, ['fetchId', 'sessionId', 'entryId']);
		if (!paramsDuplicate)
			return;
		this.warmup(request, response, paramsDuplicate);
	}

	/**
	 * When encountered an error while trying to fetch relevant ads to adBreak mark ad break as error to separate errors from retries
	 * @param adsReadyCacheKey
	 * @param error
	 * @private
	 */
	_markAdsReadyAsError(adsReadyCacheKey, error)
	{
		const errorTag = AdBreakKeyHelper.getErrorCacheTag(error);
		KalturaLogger.error(`Marking ads ready ${adsReadyCacheKey} as error :${error}`);
		KalturaCache.append(adsReadyCacheKey, errorTag,
			function ()
			{
				KalturaLogger.error(`Encountered ${errorTag} while calculating ready ads.`);
			},
			function (err)
			{
				KalturaLogger.error(`CRITICAL! Failed to set errors as the ads ready key: ${adsReadyCacheKey} though error occurred , cache error is ${err} , will try top delete the key`);
				KalturaCache.del(adsReadyCacheKey,
					function ()
					{
						KalturaLogger.log(`Managed to delete key ${adsReadyCacheKey}`);
					},
					function (error)
					{
						KalturaLogger.error(`CRITICAL! Failed to delete ads ready cache key ${adsReadyCacheKey} after errors occurred, due to ${error}`);
					}
				);
			}
		);
	}

	/**
	 * @param adsReadyCacheKey
	 * @param transcodedFileInfo
	 * @private
	 */
	_successfullyTranscodedFiller(adsReadyCacheKey, transcodedFileInfo, fillerType, flavorId)
	{
		KalturaLogger.log(`Managed to transcode and save filler file ${transcodedFileInfo.filePath}`);
		this._updateCacheWithTranscodedFillerData(adsReadyCacheKey, flavorId, Math.floor(transcodedFileInfo.durationInSeconds * 1000), transcodedFileInfo.filePath, fillerType);
	}

	_failedToTranscodeFiller(adsReadyCacheKey, err)
	{
		const message = `Failed to transcode filler file to path due to error: ${util.inspect(err)}`;
		this._markAdsReadyAsError(adsReadyCacheKey, message);
		KalturaLogger.error(message);
	}

	/**
	 * Create black filler and set key in cache
	 * @param adsReadyCacheKey
	 * @param flavorId
	 * @param partnerId
	 * @private
	 */
	_createBlackFillerForFlavor(adsReadyCacheKey, flavorId, partnerId)
	{
		const This = this;
		KalturaLogger.log(`Constructing black filler for flavor id ${flavorId}`);
		TranscodingHelper.transcodeBlackFillerToDisk(flavorId, KalturaConfig.config.layout.fillerDefaultDurationSecs, this.apiConnector, partnerId, PathsGenerator.getBlackFillerLocalPrefixPath()).then(
			function (transcodedFileInfo)
			{
				This._successfullyTranscodedFiller(adsReadyCacheKey, transcodedFileInfo, BLACK_FILLER, flavorId);
			},
			function (err)
			{
				if (err.indexOf(ERROR_FILE_IS_TRANSCODING) != 0)
					This._failedToTranscodeFiller(adsReadyCacheKey, err);
			}
		);
	}

	/**
	 * Determine if to create a black filler or resource based
	 * Transcode the filler and place in file system and relevant cache key
	 * @param flavorId
	 * @param partnerId
	 * @param fillerId
	 * @private
	 */
	_createCustomFillerForFlavor(adsReadyCacheKey, flavorId, partnerId, fillerId)
	{
		const This = this;
		const originalFillerLocalPath = PathsGenerator.getOriginFillerLocalPath(fillerId);
		KalturaLogger.log(`Constructing filler for flavor id ${flavorId} with original filler flavor id ${fillerId} targeted to path ${originalFillerLocalPath}`);
		const downloadUrl = PathsGenerator.generateApiServerFlavorURL(partnerId, fillerId, false);
		KalturaUtils.downloadHttpUrl(downloadUrl, { filePath: originalFillerLocalPath },
			function ()
			{
				const size = KalturaUtils.getFileSizeInBytes(originalFillerLocalPath);
				if (!size)
					This._failedToTranscodeFiller(adsReadyCacheKey,	`Fail to download filler from ${downloadUrl} to path ${originalFillerLocalPath} with size of ${size}`);
				TranscodingHelper.transcodeExistingFileToDisk(flavorId, This.apiConnector, partnerId, originalFillerLocalPath, PathsGenerator.getCustomFillerLocalPrefixPath()).then(
					function(transcodedFileInfo)
					{
						This._successfullyTranscodedFiller(adsReadyCacheKey, transcodedFileInfo, FILLER, flavorId);
					},
					function (err)
					{
						if (err.indexOf(ERROR_FILE_IS_TRANSCODING) != 0)
							This._failedToTranscodeFiller(adsReadyCacheKey, err);
					}
				);
			},
			function (err)
			{
				This._failedToTranscodeFiller(adsReadyCacheKey, `Failed to download filler id given ${fillerId} due to ${err}`);
			}
		);
	}

	_insertAdDataToCacheKey(adsReadyCacheKey, ads, flavorIdList, partnerId)
	{
		for (let adIdx = 0; adIdx < ads.length; adIdx++)
		{
			KalturaLogger.log(`Handling ad number ${adIdx} out of ${ads.length}`);
			this._handleAd(adsReadyCacheKey, ads[adIdx], adIdx, flavorIdList, partnerId);
		}
	}

	_handleAd(adsReadyCacheKey, ad, adIdx, flavorIdList, partnerId)
	{
		const This = this;
		const trackingList = this._vastTrackingInfoToCacheTrackingInfo(ad);
		for (let i = 0; i < flavorIdList.length; i++)
		{
			this._handleAdForFlavor(flavorIdList[i], adsReadyCacheKey, ad, adIdx, partnerId, trackingList).
				then(
				function ()
				{
					KalturaLogger.log(`Successfully calculated ads for key ${adsReadyCacheKey}`);
				},
				function (errorAdsReadyCacheKeyObj)
				{
					This._markAdsReadyAsError(errorAdsReadyCacheKeyObj.adsReadyCacheKey, errorAdsReadyCacheKeyObj.err);
				}
			);
		}
	}

	/**
	 * Create all fillers for all relevant flavors
	 * @param flavorList
	 * @param partnerId
	 * @param fillerId
	 * @returns {bluebird}
	 * @private
	 */
	_createFillers(adsReadyCacheKey, flavorList, partnerId, fillerId)
	{
		/**
		 * Pre-logic insert fillers as a start point
		 */
		for (let flavorIdx = 0; flavorIdx < flavorList.length; flavorIdx++)
		{
			const flavorId = flavorList[flavorIdx];
			if (fillerId !== BLACK_FILLER)
				this._createCustomFillerForFlavor(adsReadyCacheKey, flavorId, partnerId, fillerId);
			this._createBlackFillerForFlavor(adsReadyCacheKey, flavorId, partnerId);
		}
	}

	/**
	 * calls the 3rd party vast library and filters only relevant ads according to cue point duration
	 * @param vastUrl
	 * @param headers
	 * @param cuePointDuration
	 * @returns Promise
	 * @private
	 */
	_getDurationFilteredVastAds(vastUrl, headers, cuePointDuration)
	{
		return new Promise(
			function (resolve, reject)
			{
				const vastTimeout = parseInt(KalturaConfig.config.fetch.vastRequestTimeout, TEN_RADIX) * 1000;
				// get the vast
				KalturaVastParser.parse(vastUrl, headers, vastTimeout,
					function (vastResponse)
					{
						if (!vastResponse)
							reject(`Failed to get vast response from url:${vastUrl} with headers: ${JSON.stringify(headers)}, and timeout ${vastTimeout}`);
						else
						{
							KalturaLogger.log(`Got vast response for vast url:${vastUrl}, response:${JSON.stringify(vastResponse)}`);
							const filteredAds = VastDurationFilter.filter(vastResponse, cuePointDuration, KalturaConfig.config.fetch.durationCoefficient);
							resolve(filteredAds);
						}
					}
				);
			}
		);
	}

	/**
	 * Get all relevant information on the flavor configured
	 * Download relevant ad
	 * Transcode it
	 * Insert to ad break cache key
	 * @param flavorId
	 * @param adsReadyCacheKey
	 * @param ad
	 * @param adIdx the index of the ad in the original vast
	 * @param partnerId
	 * @param trackingList
	 * @returns {bluebird}
	 * @private
	 */
	_handleAdForFlavor(flavorId, adsReadyCacheKey, ad, adIdx, partnerId, trackingList)
	{
		const This = this;
		return new Promise(
			function (resolve, reject)
			{
				KalturaLogger.log(`Handling ad for flavor : ${flavorId} , adIdx ${adIdx}`);
				This._getFlavorAttributes(flavorId, partnerId).then(
					function(flavorAttributes)
					{
						KalturaLogger.log(`Got the following flavor attributes ${JSON.stringify(flavorAttributes)} for falvorId ${flavorId}`);
						const adFileUrl = VastSizeFilter.filter(flavorAttributes, ad);
						KalturaLogger.log(`Ad file url : ${adFileUrl}`);
						// todo make all of these promises
						This._getAdFileId(adFileUrl,
							function (adFileId)
							{
								KalturaLogger.log(`Constructed ad file ID : ${adFileId}`);
								const path = KalturaUtils.buildFilePath('ad_download', adFileId);
								KalturaUtils.downloadHttpUrl(adFileUrl, { filePath: path },
									function (filePath)
									{
										KalturaLogger.log(`Downloaded ad to path : ${filePath}`);
										const size = KalturaUtils.getFileSizeInBytes(filePath);
										if (!size)
											reject({ adsReadyCacheKey, err: `Fail to download ad from ${adFileUrl} to path ${filePath} with size of ${size}` });

										TranscodingHelper.transcodeExistingFileToDisk(flavorId, This.apiConnector, partnerId, filePath, filePath, null, true).then(
											function (transcodedFileInfo)
											{
												KalturaLogger.log(`Transcoded Ad to path : ${transcodedFileInfo.filePath}`);
												This._updateCacheWithTranscodedAdData(adsReadyCacheKey, flavorId, adIdx, Math.floor(transcodedFileInfo.durationInSeconds * 1000), transcodedFileInfo.filePath, trackingList);
												resolve();
											},
											function (err)
											{
												if (err.indexOf(ERROR_FILE_IS_TRANSCODING) == 0)
												{
													KalturaLogger.log(`File ${filePath} is currently transcoding on local disk`);
													resolve();
												}
												else
													reject({ adsReadyCacheKey, err: `Failed to transcode ad from path ${filePath} due to ${err}` });
											}
										);
									},
									function (err)
									{
										reject({ adsReadyCacheKey, err: `Failed to download ad from url ${adFileUrl} due to ${err}` });
									}
								);
							},
							function (err)
							{
								reject({ adsReadyCacheKey, err: `Failed to generate id for ad with the following URL: ${adFileUrl} due to ${err}` });
							}
						);
					},
					function (err)
					{
						reject({ adsReadyCacheKey, err: `Failed to get flavor attributed for ${flavorId} , due to ${err}` });
					}
				);
			}
		);
	}

	/**
	 * 1. download the vast
	 * 2. filter for duration
	 * 3. filter for size
	 * 4. download selected source
	 * 5. get the ffmpeg command
	 * 6. generate the local path
	 * 7. if exists set to cache
	 * 8. if does not exist - convert
	 * 9. for each tracking information call the beacon manager to get valid URL
	 * @action fetch.warmup
	 */
	warmup(request, response, params)
	{
		const This = this;
		response.dir(params);

		if (!this.validateActionArguments(params, ['fetchId', 'sessionId', 'entryId'], response))
			return;
		// we return the response so the NGINX will not wait on request
		this.okResponse(response, 'OK', 'text/plain');
		const entryId = params.entryId;
		function _handleFetchId(fetchId)
		{
			KalturaLogger.log(`KalturaFetchManager.warmup got ${JSON.stringify(fetchId)} as fetchId`);
			const cuePointId = fetchId.cuePointId;
			const cuePointDuration = fetchId.cuePointDuration;
			const vastUrl = fetchId.cuePointUrl;
			const flavorList = fetchId.flavorIdList;
			const fillerId = fetchId.fillerId;
			const partnerId = params.partnerId;

			function printErrorLog(err)
			{
				if (err.indexOf(ALREADY_HANDLING_TEXT) !== -1)
					KalturaLogger.log(err);
				else
					KalturaLogger.error(err);
			}

			function createInitialCacheKeyForAdBreak(numberOfAds, resolve, reject)
			{
				const adsReadyCacheKey = AdBreakKeyHelper.getReadyAdsCacheKey(cuePointId, params.sessionId);
				const countValue = AdBreakKeyHelper.createCountTag(numberOfAds, flavorList);
				KalturaCache.add(adsReadyCacheKey, countValue, KalturaConfig.config.cache.adMedia,
					function ()
					{
						resolve(adsReadyCacheKey);
					},
					function ()
					{
						reject(`${ALREADY_HANDLING_TEXT} ${adsReadyCacheKey}`);
					}
				);
			}

			function createBlackFillersAdBreak(err)
			{
				KalturaLogger.log(`Creating fillers only ad break since got error: ${err}`);
				createInitialCacheKeyForAdBreak(0,
					function (adsReadyCacheKey)
					{
						This._createFillers(adsReadyCacheKey, flavorList, partnerId, fillerId);
					},
					printErrorLog);
			}

			function handleDurationFilteredAds(ads)
			{
				KalturaLogger.log(`Got ${ads.length} ads filtered by duration`);
				createInitialCacheKeyForAdBreak(ads.length,
					function (adsReadyCacheKey)
					{
						This._createFillers(adsReadyCacheKey, flavorList, partnerId, fillerId);
						This._insertAdDataToCacheKey(adsReadyCacheKey, ads, flavorList, partnerId);
					},
					printErrorLog);
			}
			// execution
			KalturaUrlTokenMapper.mapTokensVod(request, cuePointId, vastUrl, partnerId, entryId, function(vastUrl){
				This._getDurationFilteredVastAds(vastUrl, request.headers, cuePointDuration).
					then(handleDurationFilteredAds, createBlackFillersAdBreak);
			});
		}
		FetchIdentifier.getFetchId(params.fetchId,
			_handleFetchId,
			(err) => KalturaLogger.info(`Fail to load Fetch ID from cache due to - ${err}`));
	}

	/**
	 * Extracts data from the vast tracking information and returns a list of TrackingCacheData
	 * @param ad
	 * @returns {Array}
	 * @private
	 */
	_vastTrackingInfoToCacheTrackingInfo(ad)
	{
		const trackingInformation = VastTrackingParser.getTrackingInformation(ad);
		const result = [];
		for (let i = 0; i < trackingInformation.length; i++)
		{
			const type = trackingInformation[i].key;
			const url = trackingInformation[i].value;
			result.push(new BeaconCacheData(type, url.trim()));
		}
		return result;
	}

	_updateCacheWithTranscodedAdData(adsReadyCacheKey, flavorId, adIdx, duration, transcodedPath, trackingList)
	{
		KalturaLogger.log(`Updating transcoded ad to key ${adsReadyCacheKey} , adIdx ${adIdx} - transcoded path ${transcodedPath}`);
		const adCacheData = new AdCacheData(duration, transcodedPath, adIdx, AD, flavorId, trackingList);
		this._updateCacheOnAdOrFiller(adsReadyCacheKey, adCacheData);
	}

	_updateCacheWithTranscodedFillerData(adsReadyCacheKey, flavorId, duration, transcodedPath, fillerType)
	{
		KalturaLogger.log(`Updating transcoded filler to key ${adsReadyCacheKey} - transcoded path ${transcodedPath}`);
		const adCacheData = new AdCacheData(duration, transcodedPath, -1, fillerType, flavorId);
		this._updateCacheOnAdOrFiller(adsReadyCacheKey, adCacheData);
	}

	_updateCacheOnAdOrFiller(adBreakCacheKey, adCacheData)
	{
		const adKey = adBreakCacheKey + Math.random();
		KalturaLogger.log(`Adding (type:${adCacheData.type}) adkey:${adKey}`);
		KalturaCache.add(adKey, adCacheData, KalturaConfig.config.cache.adMedia,
			function ()
			{
				KalturaLogger.log(`Adding adkey:${adKey} to adBreakKey:${adBreakCacheKey}`);
				AdBreakKeyHelper.addAdOrFiller(adBreakCacheKey, adCacheData, adKey);
			},
			function (error)
			{
				KalturaLogger.error(`Failed to add key to cache for new ad - ${adKey}, due to ${error}`);
			}
		);
	}

	/**
	 * todo this method is copied from the adIntegrationManager - he we can support the id as well
	 * Ad file id can be generated using two different algorithms.
	 * Once the algorithm is configured on the server it shouldn't be changed
	 *
	 * Default system behavior should be from media
	 */
	_getAdFileId(fileUrl, callback, errorCallback){

		/**
		 * File id is calculated by applying md5 on the first bytes of the ad file
		 */
		var getAdFileIdFromMedia = function(fileUrl, callback, errorCallback){
			var bytes = 10000;
			if(parseInt(KalturaConfig.config.adIntegration.adFileIdLimitBytes)){
				bytes = parseInt(KalturaConfig.config.adIntegration.adFileIdLimitBytes);
			}
			const namespace = continuationLocalStorage.getNamespace('play-server');
			KalturaUtils.md5OnFile(fileUrl, null, bytes, namespace.bind(function(adFileId){
				KalturaLogger.log(`File URL [${fileUrl}] md5 [${adFileId}] calculated from media bytes [${bytes}]`);
				callback(adFileId);
			}), errorCallback);
		};

		var getAdFileIdFromUrl = function(fileUrl, callback, errorCallback){
			requestPckg.head(fileUrl, function (err, res, body) {
				var redirectURL = fileUrl;
				if(res){
					response.log('Redirect media file URL: [' +  res.request.uri.href + '] ');
					redirectURL = res.request.uri.href;
				}
				var adFileId = null;
				var md5OnLog = null;
				if(parseInt(KalturaConfig.config.adIntegration.calcMd5OnRedirect)){
					adFileId = redirectURL.md5();
					md5OnLog = 'redirect';
				}
				else{
					adFileId = fileUrl.md5();
					md5OnLog = 'original';
				}

				response.log('File URL [' + fileUrl + '] redirect url [' + redirectURL+ '] md5 ['+adFileId+'] calculated from '+ md5OnLog);
				callback(adFileId);
			});
		};

		if(KalturaConfig.config.adIntegration.adFileIdCalcMethod == 'URL'){
			getAdFileIdFromUrl(fileUrl.trim(), callback, errorCallback);
		}
		else{
			getAdFileIdFromMedia(fileUrl.trim(), callback, errorCallback);
		}
	}

	/**
	 * Returns an array of Flavor id, height and width objects
	 * @returns {bluebird}
	 * @private
	 */
	_getFlavorAttributes(flavorId, partnerId)
	{
		const This = this;
		return new Promise(
			function (resolve, reject)
			{
				This.apiConnector.handleApiRequest('flavorAsset', 'get', [flavorId], partnerId).then(
					function (data)
					{
						resolve(new VideoAttributes(data.id, data.width, data.height, data.bitrate));
					},
					function (err)
					{
						reject(err);
					}
				);
			}
		);
	}

	/**
	 * @action fetch.initBlackFillers
	 */
	initBlackFillers(request, response, params)
	{
		const paramsDuplicate = this.parsePlayServerParams(response, params, ['flavorIds', 'partnerId']);
		response.dir(paramsDuplicate);
		this.okResponse(response, 'OK', 'text/plain');
		if (!paramsDuplicate)
			return;
		const flavorIds = paramsDuplicate.flavorIds.split(FLAVORS_SIGN_SEPARATOR);
		for (const flavorId of flavorIds)
		{
			TranscodingHelper.transcodeBlackFillerToDisk(
				flavorId, KalturaConfig.config.layout.fillerDefaultDurationSecs, this.apiConnector, params.partnerId, PathsGenerator.getBlackFillerLocalPrefixPath()).then(
				function ()
				{
					KalturaLogger.log(`Transcoded black filler for flavor id ${flavorId}`);
				},
				function (err)
				{
					KalturaLogger.log(`Failed to transcode black filler for flavor id ${flavorId} due to ${err}`);
				}
			);
		}
	}


}
module.exports =  KalturaFetchManager;
