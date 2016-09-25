const BaseURLIdentifier = require('./BaseURLIdentifier');

/**
 * This class is used to pass the beacon identifier on the URL and read it from it
 */
class TrackingIdentifier extends BaseURLIdentifier
{
	constructor(type, url, cuePointId, flavorId)
	{
		super();
		this.type = type;
		this.url = url;
		this.cuePointId = cuePointId;
		this.flavorId = flavorId;
		this.uniqueId = Math.random();
	}

	/**
	 * Decodes the str to meet the TrackingIdentifier fields
	 * @param str
	 * @throws exception if fails to parse
	 * @returns {TrackingIdentifier}
	 */
	static fromBase64(str)
	{
		try
		{
			const decoded = KalturaUtils.decodeString(str);
			const object = JSON.parse(decoded);
			return new TrackingIdentifier(object.type, object.url, object.cuePointId, object.flavorId, object.uniqueId);
		}
		catch (e)
		{
			KalturaLogger.error(`Failed to parse argument as TrackingIdentifier got: ${str}`);
		}
	}
}
module.exports = TrackingIdentifier;
