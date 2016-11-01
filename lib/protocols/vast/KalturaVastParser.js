const myVast2 = require('coffee-script/register');
const myVast = require('../../../vendor/vast-client-js');

const vastClient = require('../../../vendor/vast-client-js/client');
const Promise = require('bluebird');

class KalturaVastParser
{
	static parse(vastUrl, headers, timeout, callback)
	{
		const customizedHeaders = KalturaVastParser._custoimizeHeaders(headers);
		vastClient.get(vastUrl, customizedHeaders, timeout,
			function (vastObject)
			{
				if (KalturaVastParser._validate(vastObject))
					callback(vastObject);
				else
					callback({ads:[], errorURLTemplates:[]});
			});
	}

	/**
	 *
	 * @param vastUrl
	 * @param headers
	 * @param timeout
	 * @returns {bluebird}
	 */
	static promiseParse(vastUrl, headers, timeout)
	{
		return new Promise(
			function (resolve, reject)
			{
				const customizedHeaders = KalturaVastParser._custoimizeHeaders(headers);
				vastClient.get(vastUrl, customizedHeaders, timeout,
					function (response)
					{
						if (response === null)
							reject('Failed to parse vast url');
						else
							resolve(response);
					}
				);
			}
		);
	}

	static _custoimizeHeaders(headers)
	{
		const newHeaders = {};
		KalturaVastParser._checkAndSetHeader(newHeaders, headers, 'x-forwarded-for');
		KalturaVastParser._checkAndSetHeader(newHeaders, headers, 'user-agent');
	}

	static _checkAndSetHeader(newHeader, oldHeader, headerType)
	{
		if(oldHeader[headerType])
			newHeader[headerType] = oldHeader[headerType];
	}

	static _validate(vastObject)
	{
		if (!vastObject || vastObject.ads.length == 0)
			return true; //will pass through the vastObject

		for (let ad of vastObject.ads) {
			for (let creative of ad.creatives) {
				if (creative.duration <= 0 || !creative.mediaFiles || creative.mediaFiles.length == 0)
					return false;
				for (let mediaFile of creative.mediaFiles)
					if (!mediaFile.fileURL)
						return false;
			}
		}
		return true;
	}
}
module.exports = KalturaVastParser;
