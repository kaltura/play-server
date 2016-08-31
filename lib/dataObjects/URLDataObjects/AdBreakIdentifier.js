const BaseURLIdentifier = require('./BaseURLIdentifier');

/**
 * This class is used to pass the identifier on the URL and read it from it
 */
class AdBreakIdentifier extends BaseURLIdentifier
{
	constructor(cuePointId, flavorId, duration, fetchId, fillerId = 'black')
	{
		super();
		this.cuePointId = cuePointId;
		this.flavorId = flavorId;
		this.duration = duration;
		this.fillerId = fillerId;
		this.fetchId = fetchId;
	}

	/**
	 * Decodes the str to meet the AdBreakIdentifier fields
	 * @param str
	 * @throws exception if fails to parse
	 * @returns {AdBreakIdentifier}
	 */
	static fromBase64(str)
	{
		try
		{
			const decoded = KalturaUtils.decodeString(str);
			const object = JSON.parse(decoded);
			return new AdBreakIdentifier(object.cuePointId, object.flavorId, object.duration, object.fetchId, object.fillerId);
		}
		catch (e)
		{
			KalturaLogger.error(`Failed to parse argument as AdBreakIdentifier got: ${str}`);
		}
	}
}
module.exports = AdBreakIdentifier;
