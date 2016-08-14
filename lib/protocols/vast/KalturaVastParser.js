const myVast2 = require('coffee-script/register');
const myVast = require('../../../vendor/vast-client-js');

const vastClient = require('../../../vendor/vast-client-js/client');
const Promise = require('bluebird');

class KalturaVastParser
{
	static parse(vastUrl, headers, timeout, callback)
	{
		const customizedHeaders = KalturaVastParser._custoimizeHeaders(headers);
		vastClient.get(vastUrl, customizedHeaders, timeout, callback);
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
}
module.exports = KalturaVastParser;
