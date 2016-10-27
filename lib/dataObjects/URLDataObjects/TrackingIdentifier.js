const BaseURLIdentifier = require('./BaseURLIdentifier');

/**
 * This class is used to pass the beacon identifier on the URL and read it from it
 */
class TrackingIdentifier extends BaseURLIdentifier
{
	constructor(type, url, cuePointId, flavorId, seqId)
	{
		super();
		this.type = type;
		this.url = url;
		this.cuePointId = cuePointId;
		this.flavorId = flavorId;
		this.seqId = seqId;
	}

	/**
	 * Decodes the str to meet the TrackingIdentifier fields
	 * @param str
	 * @throws exception if fails to parse
	 * @returns {TrackingIdentifier}
	 */
	static createTrackingIdentifier(trackingUrl)
	{
		try
		{
			const object = JSON.parse(trackingUrl);
			return new TrackingIdentifier(object.type, object.url, object.cuePointId, object.flavorId, object.seqId);
		}
		catch (e)
		{
			KalturaLogger.error(`Failed to parse argument as TrackingIdentifier got: ${trackingUrl}`);
		}
	}
    static getTrackingId(encodedTrackingUrl,callback)
    {
        KalturaTinyUrl.load(encodedTrackingUrl,function(decodedTrackingUrl)
            {
                const trackingIdentifier = TrackingIdentifier.createTrackingIdentifier(decodedTrackingUrl);
                callback(trackingIdentifier);
            }
        )
    }
}
module.exports = TrackingIdentifier;
