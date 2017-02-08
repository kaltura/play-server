/* global KalturaLogger */

/**
 * Data model to hold the Manifest layout structure
 * @constructor
 */
class VODManifestLayoutData
{
	constructor(flavorIds, id)
	{
		this.id = id;
		this.referenceClipIndex = 1;
		this.durations = [];
		this.sequences = new Array(flavorIds.length);
		for (let i = 0; i < flavorIds.length; i++)
			this.sequences[i] = { id: flavorIds[i], clips: [] }; // clips
		this.notifications = [];
	}

	setReferenceClipIndex(index)
	{
		this.referenceClipIndex = index;
	}

	addSequence(duration, clipList)
	{
		if (!clipList || !duration)
			KalturaLogger.error(`Either clipList [${clipList}] or duration [${duration}] were not defined `);
		else if (clipList.length !== this.sequences.length)
			KalturaLogger.error(`ClipList length [${clipList.length}] did not match sequences length [${this.sequences.length}]`);
		else
		{
			this.durations.push(duration);
			for (let i = 0; i < clipList.length; i++)
				this.sequences[i].clips.push(clipList[i]);
		}
	}

	addNotification(notification)
	{
		if (!notification)
			KalturaLogger.error('Argument notification was not defined ');
		this.notifications.push(notification);
	}

	toJSON()
	{
		const response = {
			id: this.id,
			discontinuity: false,
			referenceClipIndex: this.referenceClipIndex,
			durations: this.durations,
			sequences: this.sequences,
		};
		if (this.notifications && this.notifications.length !== 0)
			response.notifications = this.notifications;
		return response;
	}

}

module.exports = VODManifestLayoutData;
