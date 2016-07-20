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
			throw new Error(`Either id [${id}] or duration [${duration}] were not defined`);
		else
		{
			this.clipIds.push(id);
			this.durations.push(duration);
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
		const clipIdsString = `"clipIds": ["${this.clipIds.join('","')}"]`;
		const durationsString = `"durations": [${this.durations.toString()}]`;
		let notificationsString = '"notifications": ['
		for (let notifI = 0; notifI < this.notifications.length; notifI++)
		{
			notificationsString += this.notifications[notifI].toJSON();
			if (notifI != this.notifications.length - 1)
				notificationsString += ',';
		}
		notificationsString += ']';
		return `{${clipIdsString}, ${durationsString}, ${notificationsString}}`;
	}
}
module.exports = AdBreakLayoutData;
