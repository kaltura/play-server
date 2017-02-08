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
		const response = {
			clipIds: this.clipIds,
			durations: this.durations,
		};
		if (this.notifications && this.notifications.length !== 0)
			response.notifications = this.notifications;
		return response;
	}
}
module.exports = AdBreakLayoutData;
