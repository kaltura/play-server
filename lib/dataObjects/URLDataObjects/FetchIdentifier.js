require('../PlayServerConstants');
const KalturaTinyUrl = require ('../../utils/KalturaTinyUrl');
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

    static createFetchIdentifier(fetchUrl)
    {
        try
        {
            const object = JSON.parse(fatchUrl);
            return new FetchIdentifier(object.cuePointId, object.cuePointUrl, object.flavorIdList, object.cuePointDuration, object.fillerId);
        }
        catch (e)
        {
            KalturaLogger.error(`Failed to parse argument as FetchIdentifier got: ${fetchUrl}`);
        }
    }

    static getFetchId(encodedFetchUrl,callback)
    {
        KalturaTinyUrl.load(encodedFetchUrl,function(decodedFetchUrl)
            {
                const fetchIdentifier = FetchIdentifier.createFetchIdentifier(decodedFetchUrl);
                callback(fetchIdentifier);
            }
        )
    }
}
module.exports = FetchIdentifier;
