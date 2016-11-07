const KalturaTinyUrl = require ('../../utils/KalturaTinyUrl');
/**
 * This class is used to pass the beacon identifier on the URL and read it from it
 */
class TrackingIdentifier
{
	constructor(type, url, cuePointId, flavorId, seqId)
	{
		this.type = type;
		this.url = url;
		this.cuePointId = cuePointId;
		this.flavorId = flavorId;
		this.seqId = seqId;
	}

    static getTrackingId(encodedTrackingUrl,callback,errCallback)
    {
        KalturaTinyUrl.load(encodedTrackingUrl,
							(decodedTrackingUrl)=>
								callback(new TrackingIdentifier(decodedTrackingUrl.type, decodedTrackingUrl.url, decodedTrackingUrl.cuePointId, decodedTrackingUrl.flavorId, decodedTrackingUrl.seqId)),
							(err)=>errCallback(err));
    }
}
module.exports = TrackingIdentifier;
