/**
 * Data model to hold the Manifest layout structure
 * @constructor
 */
class VODManifestLayoutData
{
	constructor(flavorIds)
	{
		this.durations = [];
		this.sequences = new Array(flavorIds.length);
		for (let i = 0; i < flavorIds.length; i++)
			this.sequences[i] = { id: flavorIds[i], clips: [] }; // clips
		this.notifications = [];
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
		const discontinuityString = '"discontinuity": false';
		const durationsString = `"durations": [${this.durations.toString()}]`;
		let sequencesString = '"sequences": [ ';
		for (let seqI = 0; seqI < this.sequences.length; seqI++)
		{
			sequencesString += '{"id":"' + this.sequences[seqI].id + '", "clips": [';
			for (let clipI = 0; clipI < this.sequences[seqI].clips.length; clipI++)
			{
				sequencesString += this.sequences[seqI].clips[clipI].toJSON();
				if (clipI !== this.sequences[seqI].clips.length - 1)
					sequencesString += ',';
			}
			sequencesString += '] }';
			if (seqI !== this.sequences.length - 1)
				sequencesString += ',';
		}
		sequencesString += ' ]';
		let notificationsString = '"notifications": [';
		for (let notifI = 0; notifI < this.notifications.length; notifI++)
		{
			notificationsString += this.notifications[notifI].toJSON();
			if (notifI !== this.notifications.length - 1)
				notificationsString += ',';
		}
		notificationsString += ']';
		if (this.notifications.length === 0)
			return `{${discontinuityString}, ${durationsString}, ${sequencesString}}`;
		else
			return `{${discontinuityString}, ${durationsString}, ${sequencesString}, ${notificationsString}}`;
	}
}

module.exports = VODManifestLayoutData;
