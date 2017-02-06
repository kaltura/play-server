require('../../utils/KalturaConfig');
require('../../utils/KalturaCache');
require('../../utils/KalturaLogger');
require('../../dataObjects/PlayServerConstants');
const PlayerEntryLayoutData = require('../../dataObjects/layoutObjects/PlayerEntryLayoutData');
const util = require('util');
const CacheLock = require('../../infra/CacheLock');

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
			}
		);
	}

	/**
	 * 
	 * @param manifestValue VODManifestLayoutData
	 * @return PlayerEntryLayoutData
	 */
	static manifestToPlayerLayoutTranslator(manifestValue, preRollPlayerAdDataArray)
	{
		const playerManifestData = new PlayerEntryLayoutData();
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
}
module.exports = LayoutHelper;
