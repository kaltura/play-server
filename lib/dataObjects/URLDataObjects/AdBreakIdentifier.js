const KalturaTinyUrl = require ('../../utils/KalturaTinyUrl');
/**
 * This class is used to pass the identifier on the URL and read it from it
 */
class AdBreakIdentifier
{
	constructor(cuePointId, flavorId, duration, fetchId)
	{
		this.cuePointId = cuePointId;
		this.flavorId = flavorId;
		this.duration = duration;
		this.fetchId = fetchId;
	}

	static getAdBreakId(encodedAdBreakUrl, callback)
	{
		KalturaTinyUrl.load(encodedAdBreakUrl,
			function (decodedAdBreakUrl)
			{
				const adBreakIdentifier = new AdBreakIdentifier(
					decodedAdBreakUrl.cuePointId,
					decodedAdBreakUrl.flavorId,
					decodedAdBreakUrl.duration,
					decodedAdBreakUrl.fetchId
				);
				callback(adBreakIdentifier);
			}
		);
	}
}
module.exports = AdBreakIdentifier;
