/**
 * Created by David.Winder on 11/10/2016.
 */
const parseString = require('xml2js').parseString;
const Promise = require('bluebird');
const ApiServerClientConnector = require('../../infra/ApiServerClientConnector');
const kaltura = module.exports = require('../../KalturaManager');

class APIRequestHelper {
	constructor() {}

	static getEntryAndMetadata(partnerId, entryId, metadataProfileId, callback, errorCallBack = null)
	{
		const apiConnector = new ApiServerClientConnector();
		let metadataXml = null;
		let entry = null;
		let promises = [];
		promises.push(apiConnector.handleApiRequest('baseEntry', 'get', [entryId], partnerId).then((data) => entry = data));

		if (metadataProfileId)
		{
			let filter = new kaltura.client.objects.KalturaMetadataFilter();
			filter.metadataProfileIdEqual = metadataProfileId;
			filter.objectIdEqual = entryId;
			filter.metadataObjectTypeEqual = kaltura.client.enums.KalturaMetadataObjectType.ENTRY;
			promises.push(apiConnector.handleApiRequest('metadata', 'listAction', [filter], partnerId).
			then((data) => metadataXml = data.objects[0].xml));
		}

		Promise.all(promises).then(
			function ()
			{
				if (!entry)
					return errorCallBack('Got no entry');
				if (metadataXml)
					return APIRequestHelper._parseXml(entry, metadataXml, callback, errorCallBack);
				callback(entry,null);
			},errorCallBack);
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