/**
 * Manager to handle all layout API requests
 * 1. layout for VOD entry (full length)
 * 2. layout for Ad-break (according to previously fetch command)
 */
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
require('../dataObjects/LayoutDataObjects');
require('../dataObjects/ApiResponseObjects');


/**
 * @service layout
 *
 * This service is responsible for returning all different layout
 * - vod layout
 * - ad break layout
 * - path layout
 */
var KalturaLayoutManager = function() {
};

util.inherits(KalturaLayoutManager, kaltura.KalturaManager);

/**
 * Returns the main layout for vod entry, includes :
 *  - mp4 file path
 *  - durations
 *  - ad break layout links
 *  - fetch links
 *
 * @action layout.manifest
 *
 * @param entryId
 * @param flavorIds
 */
KalturaLayoutManager.prototype.manifest = function(request, response, params){
	var This = this;
	response.dir(params);
	var sessionId = null;
	var playerConfig = null;

	var validateArguments = function(){
		var missingParams = This.getMissingParams(params, ['entryId', 'flavorIds']);
		if(missingParams.length){
			response.error('Missing arguments [' + missingParams.join(', ') + ']');
			This.errorMissingParameter(response);
			return false;
		}
		return true;
	}

	var init = function(){
		if(!params.playerConfig){
			params.playerConfig = null;
			KalturaLogger.debug("No player config was provided.");
		}
		else{
			playerConfig = JSON.parse(decodeURI(params.playerConfig));
		}
		// todo - why is the seesion id part of the player config  - what does Eran have to say about that
		if(playerConfig && playerConfig['sessionId']){
			sessionId = playerConfig['sessionId'];
		}
		else if ( params.sessionId ) {
			sessionId = params.sessionId;
		} else {
			sessionId = This.generateSessionID(request);
		}
	}

	if (!validateArguments())
		return;
	init();
	var ids = params.flavorIds;
	try {
		var decoded = decodeURI(ids);
		var flavors = JSON.parse(decoded);
	} catch (e) {
		response.error('Failed to parse flavor ids from url given');
		return false;
	}

	response.log('Handling layout manifest request for partner [' + params.partnerId + '] flavor ids [' + flavors + '] session [' + sessionId + ']');
	// TODO what is the impact if the ui conf is not supplied (expecting black filler)
	var This = this;

	this.isPermissionAllowedForPartner(params.partnerId, 'FEATURE_PLAY_SERVER', function(isAllowed) {
		This.getLayoutAPIInformation(params.partnerId, params.entryId, flavors, function(vodData) {
				var body ;
				if (isAllowed && vodData.cuePointList.totalCount > 0) {
					body = This.createFullManifestLayout(vodData);
				} else {
					// return an empty layout of all flavors
					body = This.createNoCuePointsManifestLayout(vodData);
				}
				This.okResponse(response, body, 'text/plain');
			}, function(errorMessage){
				response.error(errorMessage);
			}
		);

	});
}

/**
 * Constructs layout with the given entry content from begin to end
 */
KalturaLayoutManager.prototype.createNoCuePointsManifestLayout = function(vodData){
	var layout = new ManifestLayoutData(vodData.numOfFlavors);
	var contentClips = new SourceClipDataArray(0, vodData.getOnlyFlavorUrls()).clips;
	layout.addSequence(vodData.entry.msDuration, contentClips);
	return layout.toJSON();

}

/**
 * Constructs manifest layout according to the given structure
 */
KalturaLayoutManager.prototype.createFullManifestLayout = function(vodData){
	var layout = new ManifestLayoutData(vodData.numOfFlavors);
	var lastOffset = 0;
	var contentOffset = 0;
	var filteredCuePoints = this.getFilteredCuePoints(vodData.cuePointList);
	for (var cueIndex = 0 ; cueIndex < filteredCuePoints.length ; cueIndex++){
		var cuePoint = filteredCuePoints[cueIndex];
		// Handle Pre-Roll
		if (cuePoint.startTime == 0 ){
			// TODO handle pre-roll
		}
		// Handle mid movie cue point

		var contentClipArray = new SourceClipDataArray(contentOffset, vodData.getOnlyFlavorUrls());
		var contentDuration = cuePoint.startTime - lastOffset;
		contentOffset += contentDuration;
		layout.addSequence(contentDuration, contentClipArray.clips);
		var adBreakIds = new Array();
		for (var i=0; i< vodData.flavorDataList.length; i++){
			var flavorId = vodData.flavorDataList[i].id;
			var adBreakIdentifier = this.generateIdentifierForAdBreak(vodData.partnerId, cuePoint.id, cuePoint.sourceUrl, flavorId);
			adBreakIds.push(adBreakIdentifier);
		}
		var adBreakClipArray = new DynamicClipDataArray(adBreakIds);

		if (cuePoint.duration && (cuePoint.duration > 0 || cuePoint.duration.length > 0)){

		} else {

		}

		layout.addSequence(cuePoint.duration, adBreakClipArray.clips);
		lastOffset = lastOffset + cuePoint.duration + contentDuration;
	}
	// Rest of the movie should be content (if such exists)
	if (vodData.entry.msDuration > lastOffset){
		var contentClips = new SourceClipDataArray(contentOffset, vodData.getOnlyFlavorUrls());
		var contentDuration = vodData.entry.msDuration - lastOffset;
		layout.addSequence(contentDuration, contentClips.clips);
	}
	// add the pre-fetch notifications
	for (var cueIndex = 0 ; cueIndex < filteredCuePoints.length ; cueIndex++){
		var cuePoint = filteredCuePoints[cueIndex];
		var url = this.generateFetchUrl(vodData.partnerId, cuePoint.id);
		var notification = new NotificationData(url, cuePoint.startTime);
		layout.addNotification(notification);
	}
	return layout.toJSON();

}
/**
 * TODO implement this function better - should not be here but in the class that implements fetch
 * @param cuePointId
 * @param cuePointURL
 * @param flavorId
 */
KalturaLayoutManager.prototype.generateIdentifierForAdBreak = function(partnerId, cuePointId, cuePointURL, flavorId) {
	var params = new Array();
	params['cuePointURL'] = cuePointURL;
	params['cuePointId'] = cuePointId;
	params['flavorId'] = flavorId;
	return this.getPlayServerUrl('layout','adBreak', partnerId, params)
}
/**
 * TODO should be implemented where the fetch will be implemented
 * @param partnerId
 * @param cuePointId
 * @returns {*}
 */
KalturaLayoutManager.prototype.generateFetchUrl = function(partnerId, cuePointId){
	var params = new Array();
	params['cuepoint'] = cuePointId;
	return this.getPlayServerUrl('fetch','fetch', partnerId, params)
}

/**
 * filters the received cue points from :
 * - non even offsets (fixes to +1 )
 * - same time cue points
 * - overlapping
 * @param cuePoints
 * @returns {Array}
 */
KalturaLayoutManager.prototype.getFilteredCuePoints = function(cuePointsListResponse) {
	if ( cuePointsListResponse.objectType  != 'KalturaCuePointListResponse'){
		throw new Error('invalid object type supplied - expecting KalturaCuePointListResponse, got ' + cuePointsListResponse.objectType);
	}
	var cuePoints = cuePointsListResponse.objects ;
	var sortedByOffsetCuePoints = new Array();
	// first get all the cue points offsets and relevant timing info
	for (var cueIndex = 0; cueIndex < cuePoints.length; cueIndex++) {
		var cuePoint = cuePoints[cueIndex];
		var offset = cuePoint.startTime;
		if (offset % 1000 != 0){
			// align to full seconds
			offset  += (1000 - (offset % 1000));
		}
		if ( (offset/1000) % 2 != 0 ){
			offset += 1000; // times are in gops of two seconds - must make sure
		}
		cuePoint.startTime = offset;
		sortedByOffsetCuePoints.push(cuePoint);
	}
	sortedByOffsetCuePoints = sortedByOffsetCuePoints.sort(function (a, b) {
		return a.startTime - b.startTime;
	});
	if (sortedByOffsetCuePoints.length >= 1){
		var filteredCuePoints = new Array();
		filteredCuePoints.push(sortedByOffsetCuePoints[0]);
		for (var i = 1; i < sortedByOffsetCuePoints.length; i++) {
			var currentOffset = sortedByOffsetCuePoints[i].startTime;
			var previousOffset = sortedByOffsetCuePoints[i-1].startTime;
			var previousDuration = sortedByOffsetCuePoints[i-1].duration;
			if (currentOffset != previousDuration && // filters duplicate times
				currentOffset > ( previousOffset + previousDuration) ) { // filter overlapping
				filteredCuePoints.push(sortedByOffsetCuePoints[i]);
			}
		}
		return filteredCuePoints;
	}
	return sortedByOffsetCuePoints;
}


/**
 * Calls the API server to get the cue points for the entry, in addition gets all the given flavors URLs
 * @param partnerId
 * @param entryId
 * @param flavorIds
 * @param callback
 */
KalturaLayoutManager.prototype.getLayoutAPIInformation = function(partnerId, entryId,  flavorIds, callback, errorCallback){
	var This = this;
	var getApiVODInfo = function(){
		This.impersonate(partnerId);
		This.client.startMultiRequest();

		// Entry Data
		This.client.baseEntry.get(null, entryId);
		// Cue points list
		var cueFilter = new kaltura.client.objects.KalturaAdCuePointFilter();
		cueFilter.entryIdEqual = entryId;
		cueFilter.statusEqual = kaltura.client.enums.KalturaCuePointStatus.READY;
		cueFilter.cuePointTypeEqual = kaltura.client.enums.KalturaCuePointType.AD;
		// define a page - yet the amount of cue-points are not supposed to be even close to 500
		var cuePointsPager = new kaltura.client.objects.KalturaFilterPager();
		cuePointsPager.pageSize = 500;
		This.client.cuePoint.listAction(null, cueFilter, cuePointsPager);

		// Flavors
		for (var i = 0 ; i < flavorIds.length ; i++ ){
			This.client.flavorAsset.getUrl(null, flavorIds[i]);
		}

		This.client.doMultiRequest(function(results){
			This.unimpersonate(KalturaConfig.config.client);

			//Move validations to VODdata
			var callers = new Array();
			callers.push('baseEntry.get');
			callers.push('cuepoint.list');
			for (var i = 0; i < flavorIds.length; i++) {
				callers.push('flavorAsset.getUrl');
			}
			KalturaLogger.log("API results : " + JSON.stringify(results));
			//Move the validator into apiManager
			if( This.areValidApiResults(results, callers)) {
				var entryResponse = results[0];
				var cuePointsListResponse = results[1];
				var flavorUrls = results.slice(2);
				var vodData = new VodData(partnerId, flavorIds, entryResponse, cuePointsListResponse, flavorUrls);
				KalturaLogger.log("This is a representation of the vod data as JSON :\n");
				KalturaLogger.log(JSON.stringify(vodData));
				if (This.isEntryFlavorsMatch(vodData)){
					callback(vodData);
				} else {
					errorCallback('Entry on result does not match the entry mentioned in the flavors download urls');
				}
			} else {
				errorCallback('Did not succeed to get all valid response for API information needed');
			}
		});

	};

	this.getClient(KalturaConfig.config.client, function(){
		getApiVODInfo();
	});
}

KalturaLayoutManager.prototype.isEntryFlavorsMatch = function(vodData){
	var flavorURLs = vodData.getOnlyFlavorUrls();
	for (var i = 0 ; i <  flavorURLs.length ; i++){
		var url = flavorURLs[i];
		if (url.indexOf(vodData.entry.id) == -1 )
			return false;
	}
	return true;
}


/**
 * Returns the ad break layout for a specific cue point and flavor :
 *  - paths to ad files
 *  - path to filler
 *  - links to beacons
 *
 * @action layout.adBreak
 *
 * @param cuePointId
 * @param sessionId
 * @param flavorId
 */
KalturaLayoutManager.prototype.adBreak = function(request, response, params) {
	var This = this;
	response.dir(params);

	var validateArguments = function () {
		var missingParams = This.getMissingParams(params, ['cuePointId', 'sessionId' ,'flavorId']);
		if (missingParams.length) {
			response.error('Missing arguments [' + missingParams.join(', ') + ']');
			This.errorMissingParameter(response);
			return false;
		}
		return true;
	}

	var createReadyAdBreakLayout = function(adReadyJSONString){
		var adReadyList = JSON.parse(adReadyJSONString);
		var fillerCacheDataObject = null;
		var currentOffset = 0;
		var adBreakLayout = new AdBreakLayoutData();
		// todo validate value is valid and array
		for (var adIdx = 0; adIdx < adReadyJSONString.length ; adIdx++){
			var adCacheDataObject = adReadyList[adIdx];
			if (adCacheDataObject.isFiller){
				fillerCacheDataObject = adCacheDataObject;
			} else {
				// add the actual ad
				var adSourceData = new SourceClipData(currentOffset, adCacheDataObject.path);
				adBreakLayout.addClip(adSourceData);
				// add all the beacons
				for (var beaconIdx = 0 ; beaconIdx < adCacheDataObject.beaconList.length ; beaconIdx++){
					var beaconData = adCacheDataObject.beaconList[beaconIdx];
					var beaconOffset = This.calculateBeaconOffset(beaconData.type, currentOffset, beaconData.duration);
					var beaconId = This.generateIdentifierForBeacon(params.partnerId, params.cuePointId, beaconData.url, params.flavorId, beaconData.type);
					// todo get the beaocn url from the beacon manager
					var notificationData = new NotificationData(beaconId, beaconOffset);
					adBreakLayout.addNotification(notificationData);
				}
			}
		}
		var body = adBreakLayout.toJSON();
		This.okResponse(response, body, 'text/plain');
	};

	var createFillerAdBreakLayout = function(fillerFlavorId) {
		var adBreakLayout = new AdBreakLayoutData();
		// todo - filler calculated path should include the following logic
		// todo - 1. the filler flavorId + the transcode command for it hashed (encode 64)
		// todo - 2. The path should be initialized in the layout.manifest command
		// todo - 3. If the path does not exist response with error
		var fillerPath = 'filler' + fillerFlavorId;
		var adSourceData = new SourceClipData(0, fillerPath);
		adBreakLayout.addClip(adSourceData);
		var body = adBreakLayout.toJSON();
		This.okResponse(response, body, 'text/plain');
	};

	if (!validateArguments())
		return;
	var cuePointId = params.cuePointId;
	var sessionId = params.sessionId;
	var flavorId = params.flavorId;
	// we want to fetch from the cache the ads that are ready
	var adsReadyKey = this.getAdsReadyKey(cuePointId, sessionId, flavorId);
	KalturaCache.get(adsReadyKey, createReadyAdBreakLayout, createFillerAdBreakLayout());
}

/**
 * todo this should be in the beacon manager as static function
* @param cuePointId
* @param cuePointURL
* @param flavorId
*/
KalturaLayoutManager.prototype.generateIdentifierForBeacon = function(partnerId, cuePointId, beaconUrl, flavorId, beaconType) {
	var params = new Array();
	params['beaconUrl'] = beaconUrl;
	params['beaconType'] = beaconType;
	params['cuePointId'] = cuePointId;
	params['flavorId'] = flavorId;
	return this.getPlayServerUrl('beacon','send', partnerId, params)
}

KalturaLayoutManager.prototype.getAdsReadyKey = function(cuePointId, sessionId, flavorId) {
	return KalturaCache.getKey(KalturaCache.VOD_SESSION_ADS_READY_KEY_PREFIX, [cuePointId, sessionId, flavorId]);
}

// TODO this function should be static function in the BeaconManager
/**
 * Calculates the offset at which this type of beacon should be sent
 * if the number is not natural we floor it
 * @param type
 * @param initialOffsetMsecs
 * @param durationMsecs
 * @returns calculated offset or -1 on failure
 */
KalturaLayoutManager.prototype.calculateBeaconOffset = function(type , initialOffsetMsecs , durationMsecs){
	switch (type) {
		case 'impression':
		case 'start':
			return initialOffsetMsecs;
		case 'firstQuartile':
			return Math.floor(initialOffsetMsecs + (durationMsecs/4));
		case 'midpoint':
			return Math.floor(initialOffsetMsecs + (durationMsecs/2));
		case 'thirdQuartile':
			return Math.floor(initialOffsetMsecs + (durationMsecs*3/4));
		case 'complete':
			return initialOffsetMsecs + durationMsecs;
		default :
			return -1; // not relevant
	}

}

module.exports.KalturaLayoutManager =  KalturaLayoutManager;

