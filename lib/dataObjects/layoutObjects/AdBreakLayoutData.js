/**
 * Data model to hold the Ad break layout structure
 * @constructor
 */
class AdBreakLayoutData {
	constructor()
	{
		this.clipIds = [];
		this.durations = [];
		this.notifications = [];
	}

	addClip(id, duration)
	{
		if (!id || !duration)
			KalturaLogger.error(`Either id [${id}] or duration [${duration}] were not defined`);
		else
		{
			this.clipIds.push(id);
			this.durations.push(duration);
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
		const clipIdsString = `"clipIds": ["${this.clipIds.join('","')}"]`;
		const durationsString = `"durations": [${this.durations.toString()}]`;
		let notificationsString = '"notifications": [';
		for (let notifI = 0; notifI < this.notifications.length; notifI++)
		{
			notificationsString += this.notifications[notifI].toJSON();
			if (notifI !== this.notifications.length - 1)
				notificationsString += ',';
		}
		notificationsString += ']';
		if (this.notifications.length === 0)
			return `{${clipIdsString}, ${durationsString}}`;
		else
			return `{${clipIdsString}, ${durationsString}, ${notificationsString}}`;
	}
}
module.exports = AdBreakLayoutData;
