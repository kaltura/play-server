/**
 * Data model to hold the Manifest layout structure
 * @constructor
 */
class VODManifestLayoutData
{
	constructor(numberOfFlavors)
	{
		this.durations = [];
		this.sequences = new Array(numberOfFlavors);
		for (let i = 0; i < numberOfFlavors; i++)
			this.sequences[i] = []; // clips
		this.notifications = [];
	}

	addSequence(duration, clipList)
	{
		if (!clipList || !duration)
			throw new Error(`Either clipList [${clipList}] or duration [${duration}] were not defined `);
		else if (clipList.length !== this.sequences.length)
			throw new Error(`ClipList length [${clipList.length}] did not match sequences length [${this.sequences.length}]`);
		else
		{
			this.durations.push(duration);
			for (let i = 0; i < clipList.length; i++)
				this.sequences[i].push(clipList[i]);
		}
	}

	addNotification(notification)
	{
		if (!notification)
			throw new Error('Argument notification was not defined ');
		this.notifications.push(notification);
	}

	toJSON()
	{
		const discontinuityString = '"discontinuity": false';
		const durationsString = `"durations": [${this.durations.toString()}]`;
		let sequencesString = '"sequences": [ ';
		for (let seqI = 0; seqI < this.sequences.length; seqI++)
		{
			sequencesString += '{"clips": [';
			for (let clipI = 0; clipI < this.sequences[seqI].length; clipI++)
			{
				sequencesString += this.sequences[seqI][clipI].toJSON();
				if (clipI !== this.sequences[seqI].length - 1)
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

		return `{${discontinuityString}, ${durationsString}, ${sequencesString}, ${notificationsString}}`;
	}
}

module.exports = VODManifestLayoutData;
