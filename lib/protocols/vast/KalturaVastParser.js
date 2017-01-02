const myVast2 = require('coffee-script/register');
const myVast = require('../../../vendor/vast-client-js');
const vastClient = require('../../../vendor/vast-client-js/client');
const Promise = require('bluebird');
const util = require('util');
const c = require('vast-client');
/** Inner ERROR codes */
const VAST_EMPTY_RESPONSE = 'Got empty response from 3rd party vast parser';
const VAST_NO_ADS = 'Vast response was missing ads';
const VAST_MISSING_CREATIVES = 'Vast response was missing creatives';
const VAST_NOT_PLAY_SERVER_SUPPORTED = 'Vast response cannot be used for play server purposes';


class KalturaVastParser
{
	static parse(vastUrl, headers, timeout, callback, errorCallback)
	{
		const customizedHeaders = KalturaVastParser._customizeHeaders(headers);
		KalturaLogger.error("@nadav@in vast parser vast url: " + vastUrl);
		//vastClient.get(vastUrl, customizedHeaders, timeout,
		c.client.get(vastUrl, customizedHeaders,
			function (vastObject)
			{
				//KalturaLogger.error("@nadav@ in vast parser "+ util.inspect(vastObject));
				const ad = vastObject.ads[0].creatives[0];
				KalturaLogger.error("@nadav@ in vast parser "+ util.inspect(ad));
				//vastObject = {"ads":[{"errorURLTemplates":["http://cjtesting.dev.kaltura.com/tracking/error.html"],"impressionURLTemplates":["http://cjtesting.dev.kaltura.com/tracking/impression"],"creatives":[],"sequence":0}],"errorURLTemplates":[]}
				callback(vastObject);
				//KalturaVastParser._validateVastStructure(vastObject, callback, errorCallback);
			}
		);
	}

	static _customizeHeaders(headers)
	{
		const newHeaders = {};
		KalturaVastParser._checkAndSetHeader(newHeaders, headers, 'x-forwarded-for');
		KalturaVastParser._checkAndSetHeader(newHeaders, headers, 'user-agent');
		return newHeaders;
	}

	static _checkAndSetHeader(newHeader, oldHeader, headerType)
	{
		if (oldHeader[headerType])
			newHeader[headerType] = oldHeader[headerType];
	}

	static _validateVastStructure(vastObject, callback, errorCallback)
	{
		if (!vastObject)
			return errorCallback(VAST_EMPTY_RESPONSE);
		if (!vastObject.ads || vastObject.ads.length === 0)
			return errorCallback(VAST_NO_ADS);

		const validatedAds = [];
		for (const ad of vastObject.ads)
		{
			if (!ad.creatives)
				continue;
			const validatedCreatives = [];
			for (const creative of ad.creatives)
			{
				if (!creative.duration || creative.duration <= 0 || !creative.mediaFiles || creative.mediaFiles.length === 0)
					continue;
				const validatedMediaFiles = [];
				for (const mediaFile of creative.mediaFiles)
				{
					if (!mediaFile.fileURL)
						continue;
					else
						validatedMediaFiles.push(mediaFile);
				}
				if (validatedMediaFiles.length > 0)
				{
					creative.mediaFiles = validatedMediaFiles;
					validatedCreatives.push(creative);
				}
			}
			if (validatedCreatives.length > 0)
			{
				ad.creatives = validatedCreatives;
				validatedAds.push(ad);
			}
		}
		if (validatedAds.length > 0)
		{
			vastObject.ads = validatedAds;
			return callback(vastObject);
		}
		errorCallback(VAST_NOT_PLAY_SERVER_SUPPORTED);
	}
}
module.exports = KalturaVastParser;
