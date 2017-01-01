const client = require('../../client/KalturaClient');
const ApiServerClientConnector = require('../../infra/ApiServerClientConnector');

/**
 * This class gives static implementation for the basic API requests as promises
 */
class APIRequestPromiseFactory {

	static getEntryPromise(apiConnector, entryId, partnerId)
	{
		return apiConnector.handleApiRequest('baseEntry', 'get', [entryId], partnerId);
	}

	static getUIConfPromise(apiConnector, uiConfId, partnerId)
	{
		return apiConnector.handleApiRequest('uiConf', 'get', [uiConfId], partnerId);
	}

	static listMetadataPromise(apiConnector, metadataProfileId, entryId, partnerId)
	{
		const filter = new client.objects.KalturaMetadataFilter();
		filter.metadataProfileIdEqual = metadataProfileId;
		filter.objectIdEqual = entryId;
		filter.metadataObjectTypeEqual = client.enums.KalturaMetadataObjectType.ENTRY;
		return apiConnector.handleApiRequest('metadata', 'listAction', [filter], partnerId);
	}

	static listCuePointMetadataPromise(metadataProfileId, cuePointId, partnerId)
	{
		const apiConnector = new ApiServerClientConnector();
		const filter = new client.objects.KalturaMetadataFilter();
		filter.metadataProfileIdEqual = metadataProfileId;
		filter.objectIdEqual = cuePointId;
		filter.metadataObjectTypeEqual = client.enums.KalturaMetadataObjectType.AD_CUE_POINT;
		return apiConnector.handleApiRequest('metadata', 'listAction', [filter], partnerId);
	}

	static listCuePointsPromise(apiConnector, entryId)
	{
		const cueFilter = new client.objects.KalturaAdCuePointFilter();
		cueFilter.entryIdEqual = entryId;
		cueFilter.statusEqual = client.enums.KalturaCuePointStatus.READY;
		cueFilter.cuePointTypeEqual = client.enums.KalturaCuePointType.AD;
		return apiConnector.handleApiRequest('cuePoint', 'listAction', [cueFilter]);
	}

	static listFlavorsPromise(apiConnector, entryId, partnerId)
	{
		const flavorAssetFilter = new client.objects.KalturaFlavorAssetFilter();
		flavorAssetFilter.entryIdEqual = entryId;
		flavorAssetFilter.statusEqual = client.enums.KalturaFlavorAssetStatus.READY;
		return apiConnector.handleApiRequest('flavorAsset', 'listAction', [flavorAssetFilter], partnerId);
	}
}
module.exports = APIRequestPromiseFactory;
