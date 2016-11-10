/**
 * Created by David.Winder on 11/10/2016.
 */

const parseString = require('xml2js').parseString;
const Promise = require('bluebird');
const ApiServerClientConnector = require('../infra/ApiServerClientConnector');
const kaltura = module.exports = require('../KalturaManager');


class APIRequestHelper {
	constructor() {}

	static getEntryAndMetadata(partnerId, entryId, metadataProfileId, callback)
	{
		const apiConnector = new ApiServerClientConnector();
		KalturaLogger.debug('asdf   in My new');
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
			function () {
				if (metadataXml)
					parseString(metadataXml, function (err, metadata){
						if (err) {
							KalturaLogger.error(`Can't Parsed metadata because ${err}`);
							return callback();
						}
						KalturaLogger.debug('Parsed metadata :' + JSON.stringify(metadata));
						callback(entry, metadata);
					});
				else
					callback(entry,null)
			},callback);
	}
}
module.exports = APIRequestHelper;