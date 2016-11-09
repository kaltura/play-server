const KalturaTinyUrl = require('../../utils/KalturaTinyUrl');
/**
 * This class is used to pass the identifier on the URL and read it from it
 */
class AdPathIdentifier
{
	constructor(path)
	{
		this.path = path;
	}

	static getAdPath(encodedAdPathUrl, callback)
	{
		KalturaTinyUrl.load(encodedAdPathUrl,
			function (decodedAdPathUrl)
			{
				const adPathIdentifier = new AdPathIdentifier(
					decodedAdPathUrl.path
				);
				callback(adPathIdentifier);
			}
		);
	}
}
module.exports = AdPathIdentifier;
