require('../../utils/KalturaConfig');
require('../../utils/KalturaCache');
require('../../utils/KalturaLogger');
require('../../dataObjects/PlayServerConstants');
const PlayerEntryLayoutData = require('../../dataObjects/layoutObjects/PlayerEntryLayoutData');
const PlayerAdBreakData = require('../../dataObjects/layoutObjects/PlayerAdBreakData');
const AdBreakKeyHelper = require('./AdBreakKeyHelper');
const util = require('util');

/* global DYNAMIC_FLAG, KalturaConfig, KalturaCache, KalturaLogger, KalturaUtils */
/**
 * class that helps KalturaLayoutManager to manage entry version and session version
 */
class LayoutHelper
{
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

	static buildPlayerAdBreakLayout(adIdObject, sessionId, callback, errorCallback, isRetry = false)
	{
		function _constructPlayerAdBreakLayoutFromValidData(adBreakHelper)
		{
			const readyAdCacheIds = adBreakHelper.getAdBreakReadyKeysForFlavor(adIdObject.flavorId);
			return LayoutHelper.processAdBreakReadyKeys(readyAdCacheIds, LayoutHelper.transformMultiSJsonAdsToPlayerAdBreak, errorCallback);
		}

		function _constructPlayerAdBreakFromCache(adBreakCacheValue, callback)
		{
			const playerAdBreak = new PlayerAdBreakData();
			const adBreakHelper = new AdBreakKeyHelper(adBreakCacheValue);
			if (adBreakHelper.isBlocked())
			{
				if (adBreakHelper.areThereErrors())
					return callback(playerAdBreak);
				return callback(_constructPlayerAdBreakLayoutFromValidData(adBreakHelper));
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
			(value) => _constructPlayerAdBreakFromCache(value, callback),
			errorCallback
		);
	}

	static transformMultiSJsonAdsToPlayerAdBreak(readyAdsJsonArray)
	{

	}

}
module.exports = LayoutHelper;
