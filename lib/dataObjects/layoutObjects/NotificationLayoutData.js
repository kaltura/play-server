/**
 * Notification is used to call the play server's API ,
 * scheduled by the offset given according to requested videos
 * @param id
 * @param offset
 * @constructor
 */
class NotificationLayoutData {
	constructor(id, offset)
	{
		this.id = id;
		this.offset = offset;
	}

	toJSON()
	{
		return { id: this.id, offset: this.offset };
	}

	static compare(a, b)
	{
		if (a.offset > b.offset)
			return 1;
		if (a.offset < b.offset)
			return -1;
		return 0;
	}
}
module.exports = NotificationLayoutData;
