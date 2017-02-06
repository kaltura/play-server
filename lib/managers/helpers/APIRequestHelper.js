const parseString = require('xml2js').parseString;
const Promise = require('bluebird');
const ApiServerClientConnector = require('../../infra/ApiServerClientConnector');
const APIRequestPromiseFactory = require('./APIRequestPromiseFactory');
const PathsGenerator = require('./PathsGenerator');
require('../../dataObjects/PlayServerConstants');
require('../../utils/KalturaLogger');
require('../../utils/KalturaUtils');

/* global BLACK_FILLER, KalturaLogger, KalturaUtils */

class APIRequestHelper {


	static getLayoutAPIInfo(partnerId, entryId, uiConfId, callback, errorCallback, apiConnector = null)
	{
		const connector = apiConnector || new ApiServerClientConnector();
		let entry = null;
		let cuePointList = null;
		let flavorsList = null;
		let uiConf = BLACK_FILLER;
		const promises = [];

		const getEntryPromise = APIRequestPromiseFactory.getEntryPromise(connector, entryId, partnerId);
		promises.push(getEntryPromise.then((data) => entry = data), errorCallback);
		const cuePointListPromise = APIRequestPromiseFactory.listCuePointsPromise(connector, entryId);
		promises.push(cuePointListPromise.then((data) => cuePointList = data));
		const flavorsListPromise = APIRequestPromiseFactory.listFlavorsPromise(connector, entryId, partnerId);
		promises.push(flavorsListPromise.then((data) => flavorsList = data));
		if (uiConfId !== BLACK_FILLER)
		{
			const getUiConfPromise = APIRequestPromiseFactory.getUIConfPromise(connector, uiConfId, partnerId);
			promises.push(getUiConfPromise.then((data) => uiConf = data), errorCallback);
		}
		Promise.all(promises).then(
			function ()
			{
				callback(entry, cuePointList, flavorsList, uiConf);
			},
			errorCallback);
	}


	static getEntryAndMetadata(partnerId, entryId, metadataProfileId, callback, errorCallBack = null, apiConnector = null)
	{
		const connector = apiConnector || new ApiServerClientConnector();
		let metadataXml = null;
		let entry = null;
		const promises = [];
		const getEntryPromise = APIRequestPromiseFactory.getEntryPromise(connector, entryId, partnerId);
		promises.push(getEntryPromise.then((data) => entry = data));

		if (metadataProfileId)
		{
			const metadataPromise = APIRequestPromiseFactory.listMetadataPromise(connector, metadataProfileId, entryId, partnerId);
			promises.push(metadataPromise.then(
				function (data)
				{
					if (data.objects && data.objects.length > 0)
						metadataXml = data.objects[0].xml;
				}
			));
		}

		Promise.all(promises).then(
			function ()
			{
				if (!entry)
					return errorCallBack('Got no entry');
				if (metadataXml)
					return APIRequestHelper._parseXml(entry, metadataXml, callback, errorCallBack);
				callback(entry, null);
			},
			errorCallBack);
	}


	static _parseXml(entry, metadataXml, callback, errorCallBack)
	{
		parseString(metadataXml,
			function (err, metadata)
			{
				if (err)
				{
					KalturaLogger.error(`Can't Parsed metadata because ${err}`);
					if (errorCallBack) return errorCallBack(err);
					return callback();
				}
				KalturaLogger.debug('Parsed metadata :' + JSON.stringify(metadata));
				callback(entry, metadata);
			}
		);
	}

	/**
	 * Helper function to get the flavor path through serveFlavor as http call
	 * @param flavorId
	 * @param partnerId
	 * @param headers
	 * @param uriPrefixFormat
	 * @returns
	 * @private
	 */
	static getFlavorPath(flavorId, partnerId, headers, uriPrefixFormat)
	{
		return new Promise(
			function (resolve, reject)
			{
				let headersToSend = null;
				if (headers !== null)
					headersToSend = { host: headers.host };
				const url = PathsGenerator.generateApiServerFlavorURL(partnerId, flavorId, true, uriPrefixFormat);
				KalturaLogger.debug(`Using the following URL to get flavor path : ${url}`);
				KalturaUtils.getHttpUrl(url, headersToSend,
					function (response)
					{
						try
						{
							const responseAsObject = JSON.parse(response);
							const clip = responseAsObject.sequences[0].clips[0];
							if (clip.type === 'source')
								resolve(clip.path);
							else
								reject(`Returned serve flavor was not of source type, response: ${response}`);
						}
						catch (e)
						{
							reject(`Failed to extract flavor path from result ${response}`);
						}
					},
					function ()
					{
						reject(`Failed to download content from url ${url}`);
					}
				);
			}
		);
	}
}
module.exports = APIRequestHelper;
