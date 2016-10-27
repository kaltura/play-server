const BaseURLIdentifier = require('./BaseURLIdentifier');

/**
 * This class is used to pass the identifier on the URL and read it from it
 */
class AdBreakIdentifier extends BaseURLIdentifier
{
	constructor(cuePointId, flavorId, duration, fetchId)
	{
		super();
		this.cuePointId = cuePointId;
		this.flavorId = flavorId;
		this.duration = duration;
		this.fetchId = fetchId;
	}

	/**
	 * Decodes the str to meet the AdBreakIdentifier fields
	 * @param str
	 * @throws exception if fails to parse
	 * @returns {AdBreakIdentifier}
	 */
	static createAdBrteakIdentifier(adBreakUrl)
	{
        //MOSHE TODO get value from cache
		try
		{
			const object = JSON.parse(adBreakUrl);
			return new AdBreakIdentifier(object.cuePointId, object.flavorId, object.duration, object.fetchId);
		}
		catch (e)
		{
			KalturaLogger.error(`Failed to parse argument as AdBreakIdentifier got: ${adBreakUrl}`);
		}
	}
    static getAdBreakId(encodedAdBreakUrl,callback)
    {
        const _callback = callback;
        KalturaTinyUrl.load(encodedAdBreakUrl,function(decodedAdBreakUrl)
            {
                const adBreakIdentifier = FetchIdentifier.createAdBrteakIdentifier(decodedAdBreakUrl);
                _callback(adBreakIdentifier);
            }
        )
    }


}
module.exports = AdBreakIdentifier;
