const fs = require('fs');
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
const TranscodingEngine = require('../infra/TranscodingEngine');

const BLACK_FILLER = 'BLACK_FILLER';
const READY_ADS_SIGN_SEPARATOR = '#';
const ALREADY_HANDLING_TEXT = 'Already handling adsReadyCacheKey';
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
		this.fillerPath = KalturaConfig.config.cloud.sharedBasePath + '/filler/filler';
		this.blackFillerPath = KalturaConfig.config.cloud.sharedBasePath + '/filler/black';
	}

	/**
	 * @action fetch.innerWarmup
	 */
	innerWarmup(request, response, params)
	{
		params = this.parsePlayServerParams(response, params, ['fetchId', 'sessionId', 'entryId']);
		if(!params)
			return;
		this.warmup(request, response, params);
	}

	/**
	 * When encountered an error while trying to fetch relevant ads to adBreak mark ad break as error to separate errors from retries
	 * @param adsReadyCacheKey
	 * @param error
	 * @private
	 */
	_markAdsReadyAsError(adsReadyCacheKey, error)
	{
		const value = `ERROR: ${error}`;
		KalturaLogger.error(`Marking ads ready ${adsReadyCacheKey} as error :${error}`);
		KalturaCache.set(adsReadyCacheKey, value, KalturaConfig.config.cache.errorAdBreakTTL,
			function ()
			{
				KalturaLogger.error(`Encountered ${value} while calculating ready ads.`);
			},
			function (err)
			{
				KalturaLogger.error(`CRITICAL! Failed to set errors as the ads ready key: ${adsReadyCacheKey} though error occured , cache error is ${err} , will try top delete the key`);
				KalturaCache.del(adsReadyCacheKey,
					function ()
					{
						KalturaLogger.log(`Managed to delete key ${adsReadyCacheKey}`);
					},
					function (err)
					{
						KalturaLogger.error(`CRITICAL! Failed to delete ads ready cache key ${adsReadyCacheKey} after errors occured, due to ${err}`);
					}
				);
			}
		);
	}

	/**
	 * Determine if to create a black filler or resource based
	 * Transcode the filler and place in file system and relevant cache key
	 * @param flavorId
	 * @param sessionId
	 * @param partnerId
	 * @param cuePointId
	 * @param fillerId
	 * @returns {bluebird}
	 * @private
	 */
	_createFillerForFlavor(flavorId, sessionId, partnerId, cuePointId, fillerId)
	{
		const This = this;

		function createFiller(adsReadyCacheKey, resolveCallback, rejectCallback)
		{
			function successfullyTranscodedFiller(fillerLocalPath)
			{
				KalturaLogger.log(`Managed to transcode and save filler file ${fillerLocalPath}`);
				This._updateCacheWithTranscodedFillerData(adsReadyCacheKey, KalturaConfig.config.layout.fillerDefaultDurationSecs * 1000, fillerLocalPath);
				resolveCallback({ adsReadyCacheKey, flavorId });
			}

			function failedToTranscodeFiller(err)
			{
				const message = `Failed to transcode filler file to path due to error: ${err}`;
				This._markAdsReadyAsError(adsReadyCacheKey, message);
				rejectCallback(message);
			}

			if (fillerId === BLACK_FILLER)
			{
				KalturaLogger.log(`Constructing black filler for flavor if ${flavorId}`);
				TranscodingHelper.transcodeBlackFillerToDisk(flavorId, KalturaConfig.config.layout.fillerDefaultDurationSecs, This.apiConnector, partnerId, This.blackFillerPath).then(
					successfullyTranscodedFiller, failedToTranscodeFiller);
			}
			else
			{
				const originalFillerLocalPath = PathsGenerator.getOriginFillerLocalPath(fillerId);
				KalturaLogger.log(`Constructing filler for flavor if ${flavorId} with original filler flavor id ${fillerId} targeted to path ${originalFillerLocalPath}`);
				const downloadUrl = PathsGenerator.generateApiServerFlavorURL(partnerId, fillerId, false);
				KalturaUtils.downloadHttpUrl(downloadUrl, { filePath: originalFillerLocalPath },
					function ()
					{
						TranscodingHelper.transcodeExistingFileToDisk(flavorId, This.apiConnector, partnerId, originalFillerLocalPath, This.fillerPath).then(
							successfullyTranscodedFiller, failedToTranscodeFiller);
					},
					function (err)
					{
						rejectCallback(`Failed to download filler id given ${fillerId} due to ${err}`);
					}
				);
			}
		}

		return new Promise(
			function (resolve, reject)
			{
				const adsReadyCacheKey = KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, flavorId, sessionId]);
				KalturaCache.add(adsReadyCacheKey, READY_ADS_SIGN_SEPARATOR, KalturaConfig.config.cache.adMedia,
					function ()
					{
						createFiller(adsReadyCacheKey, resolve, reject);
					},
					function ()
					{
						reject(`${ALREADY_HANDLING_TEXT} ${adsReadyCacheKey}`);
					}
				);
			}
		);
	}

	/**
	 * Create all fillers for all relevant flavors
	 * @param flavorList
	 * @param sessionId
	 * @param partnerId
	 * @param cuePointId
	 * @param fillerId
	 * @returns {bluebird}
	 * @private
	 */
	_createFillers(flavorList, sessionId, partnerId, cuePointId, fillerId)
	{
		const This = this;

		return new Promise(
			function (resolve, reject)
			{
				const promises = [];
				/**
				 * Pre-logic insert fillers as a start point
				 */
				for (let flavorIdx = 0; flavorIdx < flavorList.length; flavorIdx++)
				{
					const flavorId = flavorList[flavorIdx];
					promises.push(This._createFillerForFlavor(flavorId, sessionId, partnerId, cuePointId, fillerId));
				}
				Promise.all(promises).then(
					function (adsReadyCacheKeyList)
					{
						resolve(adsReadyCacheKeyList);
					},
					function (err)
					{
						reject(`Failed to create fillers , due to ${err}`);
					}
				);
			}
		);
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
				const vastTimeout = parseInt(KalturaConfig.config.fetch.vastRequestTimeout * 1000);
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
	 * @param partnerId
	 * @param trackingList
	 * @returns {bluebird}
	 * @private
	 */
	_handleAdForFlavor(flavorId, adsReadyCacheKey, ad, partnerId, trackingList)
	{
		const This = this;
		return new Promise(
			function (resolve, reject)
			{
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
										This._transcodeAdAndSaveToDisk(filePath, flavorId, partnerId,
											function (outPath)
											{
												KalturaLogger.log(`Transcoded Ad to path : ${outPath}`);
												This._updateCacheWithTranscodedAdData(adsReadyCacheKey, ad.creatives[0].duration * 1000, outPath, trackingList);
												resolve();
											}
										);
									},
									function (err)
									{
										reject(adsReadyCacheKey, `Failed to download ad from url ${adFileUrl} due to ${err}`);
									}
								);
							},
							function (err)
							{
								reject(adsReadyCacheKey, `Failed to generate id for ad with the following URL: ${adFileUrl} due to ${err}`);
							}
						);
					},
					function (err)
					{
						reject(adsReadyCacheKey, `Failed to get flavor attributed for ${flavorId} , due to ${err}`);
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

		if (!this.validateActionArguments(params, ['fetchId', 'sessionId'], response))
			return;
		// we return the response so the NGINX will not wait on request
		this.okResponse(response, 'OK', 'text/plain');
		const fetchId = FetchIdentifier.fromBase64(params.fetchId);
		KalturaLogger.log(`KalturaFetchManager.warmup got ${JSON.stringify(fetchId)} as fetchId`);
		const cuePointId = fetchId.cuePointId;
		const cuePointDuration = fetchId.cuePointDuration;
		const vastUrl = fetchId.cuePointUrl;
		const flavorList = fetchId.flavorIdList;
		const fillerId = fetchId.fillerId;
		const partnerId = params.partnerId;

		function printErrorLog(err)
		{
			if (err.includes(ALREADY_HANDLING_TEXT))
				KalturaLogger.log(err);
			else
				KalturaLogger.error(err);
		}

		function handleAd(adsReadyCacheKeyList, ad)
		{
			const trackingList = This._vastTrackingInfoToCacheTrackingInfo(ad);
			for (let adReadyCacheIdx = 0; adReadyCacheIdx < adsReadyCacheKeyList.length; adReadyCacheIdx++)
			{
				const adReadyPair = adsReadyCacheKeyList[adReadyCacheIdx];
				This._handleAdForFlavor(adReadyPair.flavorId, adReadyPair.adsReadyCacheKey, ad, partnerId, trackingList).
					then(
					function ()
					{
						KalturaLogger.log(`Successfully cacluated ads for key ${adReadyPair.adsReadyCacheKey}`);
					},
					function (adsReadyCacheKey, message)
					{
						This._markAdsReadyAsError(adsReadyCacheKey, message);
					}
				);
			}
		}
		function insertAdDataToCacheKey(adsReadyCacheKeyList, ads)
		{
			for (let adIdx = 0; adIdx < ads.length; adIdx++)
			{
				KalturaLogger.log(`Handling ad number ${adIdx} out of ${ads.length}`);
				handleAd(adsReadyCacheKeyList, ads[adIdx]);
			}
		}
		function handleDurationFilteredAds(ads)
		{
			KalturaLogger.log(`Got ${ads.length} ads filtered by duration`);
			This._createFillers(flavorList, params.sessionId, partnerId, cuePointId, fillerId).then(
				function (adsReadyCacheKeyList)
				{
					insertAdDataToCacheKey(adsReadyCacheKeyList, ads);
				}
				, printErrorLog);
		}
		// execution
		this._getDurationFilteredVastAds(vastUrl, request.headers, cuePointDuration).
			then(handleDurationFilteredAds, printErrorLog);
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

	_getAdTranscodingCommand(path, flavorId, partnerId, callback)
	{
		const This = this;
		this.mediaInfo.mediaInfoExec(path).then(
			function (mediaInfoForAd)
			{
				KalturaLogger.log(`Media info for ${path} is ${mediaInfoForAd.jsonInfo}`);
				KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, mediaInfoForAd.jsonInfo, null, This.apiConnector, partnerId).then(
					function (data)
					{
						KalturaLogger.log(`Generated command line for transcoding is ${data}`);
						const adFileId = path.substr(path.lastIndexOf('/') + 1);
						const transcodePath = KalturaUtils.buildFilePath('ad_transcode', adFileId);
						const outPath = PathsGenerator.generateSpecificTranscodedPath(transcodePath, data);
						KalturaLogger.log(`Calculated ad path is  ${outPath}`);
						const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, path, outPath);
						KalturaLogger.log(`Command that will be used for converting the ad is ${commandLine}`);
						callback(commandLine, outPath);
					},
					function (err)
					{
						KalturaLogger.error(`Failed to generate transcoding commmand for path: ${path} , due to : ${err}`);
					}
				);
			},
			function (err)
			{
				KalturaLogger.error(`Failed to get the media info for path: ${path} due to ${err}`);
			}
		);
	}

	_transcodeAdAndSaveToDisk(path, flavorId, partnerId, callback)
	{
		const This = this;
		this._getAdTranscodingCommand(path, flavorId, partnerId,
			function(commandLine, outPath)
			{
				fs.access(outPath, fs.constants.F_OK,
					function(err)
					{
						if (err === null)
						{
							KalturaLogger.log(`File existed on local disk ${outPath}`);
							callback(outPath);
						}
						else
						{
							KalturaUtils.createFilePath(outPath,
								function(){
									This.transcodingEngine.transcodeFile(commandLine, flavorId, outPath).then(
										function (data){
											KalturaLogger.log(`Managed to transcode and save file ${outPath}`);
											callback(outPath);
										}, function(err)
										{
											KalturaLogger.error(`Failed to transcode file to path ${outPath} due to error: ${err}`);
										}
									);
								},
								function (err)
								{
									KalturaLogger.error(`Failed to transcode file to path ${outPath} since could not create output path ,due to error: ${err}`);
								}
							);
						}
					}
				);
			}
		);
	}

	_updateCacheWithTranscodedAdData(adsReadyCacheKey, duration, transcodedPath, trackingList)
	{
		KalturaLogger.log(`Updating transcoded ad to key ${adsReadyCacheKey} - transcoded path ${transcodedPath}`);
		const adCacheData = new AdCacheData(duration, transcodedPath, trackingList);
		this._updateCacheOnAd(adsReadyCacheKey, adCacheData);
	}

	_updateCacheWithTranscodedFillerData(adsReadyCacheKey, duration, transcodedPath)
	{
		KalturaLogger.log(`Updating transcoded filler to key ${adsReadyCacheKey} - transcoded path ${transcodedPath}`);
		const adCacheData = new AdCacheData(duration, transcodedPath, null, true);
		this._updateCacheOnAd(adsReadyCacheKey, adCacheData);
	}

	_updateCacheOnAd(adBreakCacheKey, adCacheData)
	{
		const adKey = adBreakCacheKey + Math.random();
		KalturaLogger.log(`Adding adkey:${adKey}`);
		KalturaCache.add(adKey, adCacheData, KalturaConfig.config.cache.adMedia,
			function ()
			{
				KalturaLogger.log(`Adding adkey:${adKey} to adBreakKey:${adBreakCacheKey}`);
				KalturaCache.append(adBreakCacheKey, `#${adKey}`,
					function ()
					{
						KalturaLogger.log(`Added adkey:${adKey} to adBreakKey:${adBreakCacheKey}`);
					},
					function (err)
					{
						KalturaLogger.error(`Failed to append adKey due to cache failure to append: ${adKey} to key: ${adBreakCacheKey} with error: ${err}`);				
					}
				);
			},
			function (error)
			{
				KalturaLogger.error(`Failed to add key to cache for new ad - ${adKey}, due to ${error}`);
			},
			false
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
			KalturaUtils.md5OnFile(fileUrl, null, bytes, function(adFileId){
				KalturaLogger.log(`File URL [${fileUrl}] md5 [${adFileId}] calculated from media bytes [${bytes}]`);
				callback(adFileId);
			}, errorCallback);
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

}
module.exports =  KalturaFetchManager;
