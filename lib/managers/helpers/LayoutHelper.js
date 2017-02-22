require('../../utils/KalturaConfig');
require('../../utils/KalturaCache');
require('../../utils/KalturaLogger');
require('../../dataObjects/PlayServerConstants');
const PlayerEntryLayoutData = require('../../dataObjects/layoutObjects/PlayerEntryLayoutData');
const PlayerAdBreakData = require('../../dataObjects/layoutObjects/PlayerAdBreakData');
const PlayerBeaconData = require('../../dataObjects/layoutObjects/PlayerBeaconData');
const PlayerAdData = require('../../dataObjects/layoutObjects/PlayerAdData');
const AdBreakKeyHelper = require('./AdBreakKeyHelper');
const KalturaTrackingManager = require('../KalturaTrackingManager');
const AdBreakIdentifier = require('../../dataObjects/URLDataObjects/AdBreakIdentifier');
const TrackingIdentifier = require('../../dataObjects/URLDataObjects/TrackingIdentifier');
const KalturaTinyUrl = require('../../utils/KalturaTinyUrl');
const util = require('util');

/* global AD, DYNAMIC_FLAG, KalturaConfig, KalturaCache, KalturaLogger, KalturaUtils */
/**
 * class that helps KalturaLayoutManager to manage entry version and session version
 */
class LayoutHelper
{

	/***
	 * create a url to call the sendBeacon action when beacon tracking is needed.
	 * given entryId, partnerId, cuePointId, beaconTrackingURL this method will make a one url that triggers trackingManager.sendBeacon method using http
	 */
	static generateBeaconRequest(cuePointId, type, url, flavorId, seqId)
	{
		const trackingId = new TrackingIdentifier(type, url, cuePointId, flavorId, seqId);
		const decodedTrackingId = KalturaTinyUrl.insert(trackingId);
		return `tracking/sendBeacon/trackingId/${decodedTrackingId}`;
	}

	static initEntryVersion(entryId, successCallback, errorCallback)
	{
		const version = {id: LayoutHelper.getBaseVersion()};
		KalturaCache.add(entryId, version ,KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
	}

	static getEntryVersion(entryId, successCallback, errorCallback)
	{
		KalturaCache.get(entryId, successCallback, errorCallback);
	}

	/**
	 * for testing only
	 * @param entryId
	 * @param successCallback
	 * @param errorCallback
	 */
	static deleteEntryVersion(entryId, successCallback, errorCallback)
	{
		KalturaCache.del(entryId, successCallback, errorCallback);
	}

	static updateEntryVersion(entryId, successCallback, errorCallback, versionNum = null)
	{
		if(versionNum)
			KalturaCache.set(entryId, { id: versionNum }, KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
		else
		{
			LayoutHelper.getEntryVersion(entryId,
				function (version)
				{
					if (version)
					{
						const newVersion = { id: LayoutHelper.incrementVersion(version.id) };
						KalturaLogger.log(`Trying to incremente entry ${entryId} version from ${version.id} to ${newVersion.id}`);
						KalturaCache.set(entryId, newVersion, KalturaConfig.config.cache.entryVersionTimeout, successCallback, errorCallback);
					}
					else
					{
						KalturaLogger.debug(`Entry Id ${entryId} did not exist in cache - not updating cache`);
						successCallback();
					}
				},
				function (err)
				{
					KalturaLogger.warn(`Failed to get and update Entry ${entryId} version , due to ${util.inspect(err)}`);
					errorCallback();
				}
			);
		}
	}

	static incrementVersion(version)
	{
		const versionNum = parseInt(version.substring(1));
		return `v${versionNum + 1}`;
	}

	/**
	 * for testing only
	 * @param entryId
	 * @param successCallback
	 * @param errorCallback
	 */
	static resetEntryVersion(entryId, successCallback, errorCallback)
	{
		LayoutHelper.updateEntryVersion(entryId, successCallback, errorCallback, LayoutHelper.getBaseVersion());
	}

	static getBaseVersion()
	{
		return LAYOUT_BASE_VERSION;
	}

	/**
	 * initialize the layout version to be used with specific sessionId
	 * @param sessionId
	 * @param version
	 * @param entryTimeOut
	 * @param successCallback
	 * @param errorCallback
	 */
	static initSessionVersion(sessionIdKey, version, entryTimeOut, successCallback, errorCallback)
	{
		KalturaCache.add(sessionIdKey, version , entryTimeOut, successCallback, errorCallback);
	}

	static getLayoutManifestKey(partnerId, entryId, flavorId, uiConfId, versionId)
	{
		const layoutKey = `partnerId-${partnerId}-entryId-${entryId}-flavorIds-${flavorId}-uiConfId-${uiConfId}`;
		return `${versionId}_${KalturaUtils.getShortHashKey(layoutKey)}`;
	}

	static getSessionVersion(sessionIdKey, successCallback, errorCallback)
	{
		KalturaCache.get(sessionIdKey, successCallback, errorCallback);
	}

	static processAdBreakReadyKeys(adBreakReadyKeys, handleJSONAdsCallback, errorCallback)
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

	static buildPlayerEntryLayout(partnerId, entryId, sessionId, flavorId, uiConfId, callback, errorCallback)
	{
		LayoutHelper.getSessionVersion(`${entryId}_${sessionId}`,
			(version) =>
			{
				if (version)
				{
					const layoutManifestKey = LayoutHelper.getLayoutManifestKey(partnerId, entryId, flavorId, uiConfId, version.id);
					KalturaCache.get(layoutManifestKey,
						function (data)
						{
							const playerLayout = LayoutHelper.manifestToPlayerLayoutTranslator(data);
							callback(playerLayout);
						},
						() => errorCallback(`Failed to get layout from cache - can not build player layout for ${entryId} and ${sessionId}`)
					);
				}
				else
					errorCallback(`Failed to find version in cache - can not build player layout for ${entryId} and ${sessionId} `);
			},
			errorCallback
		);
	}

	/**
	 * @param manifestText String
	 * @return PlayerEntryLayoutData
	 */
	static manifestToPlayerLayoutTranslator(manifestText, preRollPlayerAdDataArray)
	{
		const playerManifestData = new PlayerEntryLayoutData();
		const manifestValue = JSON.parse(manifestText);
		if (manifestValue && manifestValue.sequences && manifestValue.durations && manifestValue.sequences[0].clips)
		{
			const anySequence = manifestValue.sequences[0];
			let offset = 0;
			for (let clipIndex = 0; clipIndex < anySequence.clips.length; clipIndex++)
			{
				const duration = manifestValue.durations[clipIndex];
				const clip = anySequence.clips[clipIndex];
				if (clip.id)
				{
					if (offset === 0 && preRollPlayerAdDataArray)
						playerManifestData.addPreRollSequence(preRollPlayerAdDataArray, duration);
					else
						playerManifestData.addAdSequence(clip.id, offset, duration);
				}
				else
					playerManifestData.addSourceSequence(offset, duration);
				offset += duration;
			}
		}
		return playerManifestData;
	}

	static handlePlayerAdBreakLayoutRequest(adId, sessionId, callback, errorCallback)
	{
		AdBreakIdentifier.getAdBreakId(adId,
			(adIdObject) => LayoutHelper.buildPlayerAdBreakLayout(adIdObject, sessionId, callback, errorCallback),
			errorCallback
		);
	}

	static buildPlayerAdBreakLayout(adIdObject, sessionId, callback, errorCallback, isRetry = false)
	{
		function _constructPlayerAdBreakLayoutFromValidData(adBreakHelper)
		{
			const readyAdCacheIds = adBreakHelper.getAdBreakReadyKeysForFlavor(adIdObject.flavorId);
			return LayoutHelper.processAdBreakReadyKeys(readyAdCacheIds,
				function (data)
				{
					callback(LayoutHelper.transformMultiSJsonAdsToPlayerAdBreak(data, adIdObject.duration, adIdObject.cuePointId, adIdObject.flavorId));
				},
				errorCallback
			);
		}

		function _constructPlayerAdBreakFromCache(adBreakCacheValue)
		{
			const playerAdBreak = new PlayerAdBreakData();
			const adBreakHelper = new AdBreakKeyHelper(adBreakCacheValue);
			if (adBreakHelper.isBlocked())
			{
				if (adBreakHelper.areThereErrors())
					return callback(playerAdBreak);
				return _constructPlayerAdBreakLayoutFromValidData(adBreakHelper);
			}
			if (isRetry)
			{
				// if not blocked means that the ad break did not occur yet (can happen in pre roll)
				return setTimeout(LayoutHelper.buildPlayerAdBreakLayout(adIdObject, sessionId, callback, errorCallback, true),
					KalturaConfig.config.layout.millisAdBreakRetryTimeout);
			}
			return callback(playerAdBreak);
		}

		const cuePointId = adIdObject.cuePointId;
		const adsReadyKey = AdBreakKeyHelper.getReadyAdsCacheKey(cuePointId, sessionId);
		KalturaCache.get(adsReadyKey,
			(value) => _constructPlayerAdBreakFromCache(value),
			errorCallback
		);
	}

	static transformMultiSJsonAdsToPlayerAdBreak(adReadyList, duration, cuePointId, flavorId)
	{
		KalturaLogger.log(`Creating Ad break player layout with the following ready ads: ${util.inspect(adReadyList)}`);
		let currentOffset = 0;
		let leftDuration = duration;
		const playerAdBreakData = new PlayerAdBreakData();
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
				else if (leftDuration === 0)
					break;
				else
				{
					durationForAd = leftDuration;
					leftDuration = 0;
				}

				const playerAdData = new PlayerAdData(keys[keyIdx], currentOffset, durationForAd);

				for (let beaconIdx = 0; beaconIdx < adCacheDataObject.beaconList.length; beaconIdx++)
				{
					const beaconData = adCacheDataObject.beaconList[beaconIdx];
					const innerId = KalturaUtils.getShortHashKey(`${keys[keyIdx]}-${beaconIdx}`);
					// TODO change to real beacon URL via play server
					const beaconId = LayoutHelper.generateBeaconRequest(cuePointId, beaconData.type, beaconData.url, flavorId, innerId);
					const beaconOffset = KalturaTrackingManager.calculateBeaconOffset(beaconData.type, currentOffset, adCacheDataObject.duration);
					if (beaconOffset === -1)
						continue;
					if (beaconOffset <= duration && beaconOffset >= 0)
					{
						const playerBeaconData = new PlayerBeaconData(beaconData.type, beaconData.url);
						playerBeaconData.setOffset(beaconOffset);
						playerAdData.addBeacon(playerBeaconData);
					}
					if (beaconOffset === -2)
					{
						playerAdData.setSkippable();// this is skip beacon
						playerAdData.setSkipUrl(beaconId);
						playerAdData.setSkipOffset(adCacheDataObject.skipOffset);
					}
					if (beaconOffset === -3)
					{
						playerAdData.setClickThrough(beaconData.url);
					}
				}
				playerAdBreakData.addAd(playerAdData);
				currentOffset += durationForAd;

				if (adCacheDataObject.clickThrough)
					playerAdData.setClickThrough(adCacheDataObject.clickThrough);
			}
			else
				foundFiller = adCacheDataObject;
		}

		if (leftDuration > 0 && foundFiller !== null)
		{
			const playerAdData = new PlayerAdData(0, leftDuration);
			playerAdData.setAutoSkip();
			playerAdBreakData.addAd(playerAdData);
		}
		return playerAdBreakData;
	}

}
module.exports = LayoutHelper;
