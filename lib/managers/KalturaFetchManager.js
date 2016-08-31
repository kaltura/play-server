const fs = require('fs');
const kaltura = module.exports = require('../KalturaManager');
const KalturaLayoutManager = require('./KalturaLayoutManager');
const FetchIdentifier = require('../dataObjects/URLDataObjects/FetchIdentifier');
const VideoAttributes = require('../dataObjects/apiResponseObjects/VideoAttributes');
const AdCacheData = require('../dataObjects/CacheDataObjects/AdCacheData');
const BeaconCacheData = require('../dataObjects/CacheDataObjects/BeaconCacheData');
const KalturaVastParser = require('../protocols/vast/KalturaVastParser');
const VastDurationFilter = require('../protocols/vast/filters/VastDurationFilter');
const VastTrackingParser = require('../protocols/vast/filters/VastTrackingParser');
const VastSizeFilter = require('../protocols/vast/filters/VastSizeFilter');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
//const KalturaLayoutManager = require('./KalturaLayoutManager');
const Promise = require('bluebird');
const KalturaMediaInfo = require('../utils/KalturaMediaInfo');
const KalturaFFMpegCmdGenerator = require('../utils/KalturaFFMpegCmdGenerator');
const TranscodingEngine = require('../infra/TranscodingEngine');
const engine = new TranscodingEngine('ffmpeg');
const MediaInfo = new KalturaMediaInfo('ffprobe');

const BLACK_FILLER =  'BLACK_FILLER';
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
		const fetchId = FetchIdentifier.fromBase64(params.fetchId);
		KalturaLogger.log(`KalturaFetchManager.warmup got ${JSON.stringify(fetchId)} as fetchId`);
		const cuePointId = fetchId.cuePointId;
		const cuePointDuration = fetchId.cuePointDuration;
		const vastUrl = fetchId.cuePointUrl;
		const flavorList = fetchId.flavorIdList;
		const fillerId = fetchId.fillerId;
		const entryId = params.entryId;
		const partnerId = params.partnerId;

		/**
		 * Pre-logic insert fillers as a start point
		 */
		/*for (let flavorIdx = 0; flavorIdx < flavorList.length; flavorIdx++)
		{
			const flavorId = flavorList[flavorIdx];
			const adsReadyCacheKey = KalturaFetchManager.generateAdsReadyCacheKey(cuePointId, flavorId, params.sessionId);
			KalturaCache.add(adsReadyCacheKey, '#', KalturaConfig.config.cache.adMedia,
				function ()
				{
					if (fillerId === BLACK_FILLER)
					{

						KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, null, KalturaConfig.config.layout.fillerDefaultDurationSecs, This.apiConnector, partnerId).then(
							function (cmdLine)
							{
								const blackFillerLocalPath = KalturaLayoutManager._getBlackFillerLocalPath(cmdLine);
								KalturaFetchManager._updateCacheWithTranscodedAdData(adsReadyCacheKey, KalturaConfig.config.layout.fillerDefaultDurationSecs, blackFillerLocalPath, null);
							}
						);
					}
					else
					{
						const originlFillerLocalPath = KalturaLayoutManager._getOriginFillerLocalPath(fillerId);
						MediaInfo.mediaInfoExec(originlFillerLocalPath).then(
							function (mediaInfoForFiller)
							{
								KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, mediaInfoForFiller, KalturaConfig.config.layout.fillerDefaultDurationSecs, This.apiConnector, partnerId).then(
									function (cmdLine)
									{
										const transcodedPath = KalturaFetchManager._generateSpecificTranscodedPath(originlFillerLocalPath, cmdLine);
										KalturaFetchManager._updateCacheWithTranscodedAdData(adsReadyCacheKey, KalturaConfig.config.layout.fillerDefaultDurationSecs, transcodedPath, null);
									}
								);
							}
						);
					}
				},
				function ()
				{
					KalturaLogger.log(`Already handling adsReadyCacheKey ${adsReadyCacheKey}`);
				}
			);
		}*/

		/**
		 * Logic -
		 * 1. download the vast
		 * 2. filter for duration
		 * 3. filter for size
		 * 4. download selected source
		 * 5. get the ffmpeg command
		 * 6. generate the local path
		 * 7. if exists set to cache
		 * 8. if does not exist - convert
		 * 9. for each tracking information call the beacon manager to get valid URL
		 */

		const vastTimeout = parseInt(KalturaConfig.config.fetch.vastRequestTimeout);
		// get the vast
		KalturaVastParser.parse(vastUrl, request.headers, vastTimeout,
			function (vastResponse)
			{
				if (!vastResponse)
					KalturaLogger.error(`Failed to get vast response from url:${vastUrl} with headers: ${JSON.stringify(request.headers)}, and timeout ${vastTimeout}`);
				KalturaLogger.log(`Got vast response for vast url:${vastUrl}, response:${JSON.stringify(vastResponse)}`);
				const filteredAds = VastDurationFilter.filter(vastResponse, cuePointDuration, KalturaConfig.config.fetch.durationCoefficient);
				KalturaLogger.log(`After filtering through duration left with ${filteredAds.length} ads`);
				for (let adIdx = 0; adIdx < filteredAds.length; adIdx++)
				{
					const ad = filteredAds[adIdx];
					const trackingList = KalturaFetchManager._vastTrackingInfoToCacheTrackingInfo(ad, params.partnerId, entryId, cuePointId);
					// todo change print to have specific identifier this is too general
					KalturaLogger.log(`Found ${trackingList.length} tracking indications for vast url : ${vastUrl}`);
					// get the file that we want to play
					for (let flavorIdx = 0; flavorIdx < flavorList.length; flavorIdx++)
					{
						const flavorId = flavorList[flavorIdx];
						const adsReadyCacheKey = KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, flavorId, params.sessionId]);
						// todo think about this solution - if the ad break is calculated wrongly you have to remove this key from the cache in order to make things work again
						KalturaCache.add(adsReadyCacheKey, '#', KalturaConfig.config.cache.adMedia,
							function ()
							{
								This._getFlavorAttributes(flavorId, params.partnerId).then(
									function(flavorAttributes)
									{
										KalturaLogger.log(`Got the following flavor attributes ${JSON.stringify(flavorAttributes)} for falvorId ${flavorId}`);
										const adFileUrl = VastSizeFilter.filter(flavorAttributes, ad);
										KalturaLogger.log(` ad file url : ${adFileUrl}`);
										// todo make all of these promises
										This._getAdFileId(adFileUrl,
											function (adFileId)
											{
												KalturaLogger.log(`Constructed ad file ID : ${adFileId}`);
												const path = KalturaUtils.buildFilePath('ad_download', adFileId)
												KalturaUtils.downloadHttpUrl(adFileUrl, { filePath: path },
													function (filePath)
													{
														KalturaLogger.log(`Downloaded ad to path : ${filePath}`);
														This._transcodeAdAndSaveToDisk(filePath, flavorId, partnerId,
															function (outPath)
															{
																KalturaLogger.log(`Transcoded Ad to path : ${outPath}`);
																KalturaFetchManager._updateCacheWithTranscodedAdData(adsReadyCacheKey, ad.creatives[0].duration * 1000, outPath, trackingList);
															}
														);
													},
													function(err)
													{
														KalturaLogger.error(`Failed to download ad from url ${adFileUrl} due to ${err}`);
													}
												);
											},
											function (err)
											{
												KalturaLogger.error(`Failed to generate id for ad with the following URL: ${adFileUrl} due to ${err}`);
											}
										);
									},
									function(err)
									{
										KalturaLogger.error(`Failed to get flavor attributed for ${flavorId} , due to ${err}`);
									}
								);
							},
							function ()
							{
								KalturaLogger.log(`Already handling adsReadyCacheKey ${adsReadyCacheKey}`);
							}
						);
					}
				}
			}
		);
	}

	/**
	 * Extracts data from the vast tracking information and returns a list of TrackingCacheData
	 * @param ad
	 * @returns {Array}
	 * @private
	 */
	static _vastTrackingInfoToCacheTrackingInfo(ad)
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

	_getTranscodingCommand(path, flavorId, partnerId, callback)
	{
		const This = this;
		MediaInfo.mediaInfoExec(path).then(
			function (mediaInfoForAd)
			{
				KalturaLogger.log(`Media info for ${path} is ${JSON.stringify(mediaInfoForAd)}`);
				KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, mediaInfoForAd, null, This.apiConnector, partnerId).then(
					function (data)
					{
						KalturaLogger.log(`Generated command line for transcoding is ${data}`);
						const outPath = KalturaFetchManager._generateSpecificTranscodedPath(path, data);
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
		this._getTranscodingCommand(path, flavorId, partnerId,
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
							engine.transcodeFile(commandLine).then(
								function (data){
									KalturaLogger.log(`Managed to transcode and save file ${outPath}`);
									callback(outPath);
								}, function(err)
								{
									KalturaLogger.error(`Failed to transcode file to path ${outPath} due to error: ${err}`);
								}
							);
						}
					}
				);
			}
		);
	}

	static _generateSpecificTranscodedPath(path, commandLine)
	{
		const identifier = commandLine.md5();
		return `${path}_${identifier}`;
	}

	static _updateCacheWithTranscodedAdData(adsReadyCacheKey, duration, transcodedPath, trackingList)
	{
		KalturaLogger.log(`Updating transcoded ad to key ${adsReadyCacheKey} - transcoded path ${transcodedPath}`);
		const adCacheData = new AdCacheData(duration, transcodedPath, trackingList);
		KalturaFetchManager._updateCacheOnAd(adsReadyCacheKey, adCacheData);
	}

	static _updateCacheOnAd(adBreakCacheKey, adCacheData)
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
