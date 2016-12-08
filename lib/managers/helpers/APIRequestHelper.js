const parseString = require('xml2js').parseString;
const Promise = require('bluebird');
const ApiServerClientConnector = require('../../infra/ApiServerClientConnector');
const APIRequestPromiseFactory = require('./APIRequestPromiseFactory');
require('../../dataObjects/PlayServerConstants');
/* global BLACK_FILLER */

class APIRequestHelper {


	static getLayoutAPIInfo(partnerId, entryId, uiConfId, callback, errorCallback, apiConnector=null)
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
			promises.push(metadataPromise.then((data) => metadataXml = data.objects[0].xml));
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
}
module.exports = APIRequestHelper;
