const BaseURLIdentifier = require('./BaseURLIdentifier');
require('../PlayServerConstants');
/**
 * This class is used to pass the identifier on the URL and read it from it
 */
class FetchIdentifier extends BaseURLIdentifier
{
	constructor(cuePointId, cuePointUrl, flavorIdList, duration, fillerId = BLACK_FILLER)
	{
		super();
		this.cuePointId = cuePointId;
		this.cuePointUrl = cuePointUrl;
		this.flavorIdList = flavorIdList;
		this.fillerId = fillerId;
		this.cuePointDuration = duration;
	}

	/**
	 * Decodes the str to meet the FetchIdentifier fields
	 * @param str
	 * @throws exception if fails to parse
	 * @returns {FetchIdentifier}
	 */
	static fromBase64(str)
	{
		try
		{
			const decoded = KalturaUtils.decodeString(str);
			const object = JSON.parse(decoded);
			return new FetchIdentifier(object.cuePointId, object.cuePointUrl, object.flavorIdList, object.cuePointDuration, object.fillerId);
		}
		catch (e)
		{
			KalturaLogger.error(`Failed to parse argument as FetchIdentifier got: ${str}`);
		}
	}
}
module.exports = FetchIdentifier;
