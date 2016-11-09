require('../PlayServerConstants');
const KalturaTinyUrl = require('../../utils/KalturaTinyUrl');
/* global BLACK_FILLER*/
/**
 * This class is used to pass the identifier on the URL and read it from it
 */
class FetchIdentifier
{
	constructor(cuePointId, cuePointUrl, flavorIdList, duration, fillerId = BLACK_FILLER)
	{
		this.cuePointId = cuePointId;
		this.cuePointUrl = cuePointUrl;
		this.flavorIdList = flavorIdList;
		this.fillerId = fillerId;
		this.cuePointDuration = duration;
	}

	static getFetchId(encodedFetchUrl, callback, errorCallback)
	{
		KalturaTinyUrl.load(encodedFetchUrl,
			function (decodedFetchUrl)
			{
				const fetchIdentifier = new FetchIdentifier(
					decodedFetchUrl.cuePointId,
					decodedFetchUrl.cuePointUrl,
					decodedFetchUrl.flavorIdList,
					decodedFetchUrl.cuePointDuration,
					decodedFetchUrl.fillerId
				);
				callback(fetchIdentifier);
			},
			(err) => errorCallback(err)
		);
	}
}
module.exports = FetchIdentifier;
