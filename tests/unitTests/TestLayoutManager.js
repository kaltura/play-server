/**
 * What do we want to test -
 *
 * except an already existing entry which is of duration longer than 4 minutes
 *  create multiple cue points
 *  query about the manifet layout is valid
 *
 */

const chai = require('chai');
const expect = chai.expect; // we are using the "expect" style of Chai
const KalturaLayoutManager = require('../../lib/managers/KalturaLayoutManager');
const VodData = require('../../lib/dataObjects/apiResponseObjects/VodData');


// this is a simulated result got from the server
const MATCHING_ENTRY = '{"mediaType":1,"conversionQuality":8,"sourceType":"1","dataUrl":"http://centos.kaltura:80/p/101/sp/10100/playManifest/entryId/0_ba9href0/format/url/protocol/http","flavorParamsIds":"0,2,3,4,5","plays":0,"views":0,"width":852,"height":480,"duration":226,"msDuration":226000,"id":"0_ba9href0","name":"budget_20141014T131145_000000","partnerId":101,"userId":"someone@kaltura.com","creatorId":"someone@kaltura.com","status":2,"moderationStatus":6,"moderationCount":0,"type":1,"createdAt":1467621408,"updatedAt":1467621884,"rank":0,"totalRank":0,"votes":0,"downloadUrl":"http://centos.kaltura/p/101/sp/10100/raw/entry_id/0_ba9href0/version/0","searchText":"_PAR_ONLY_ _101_ _MEDIA_TYPE_1|  budget_20141014T131145_000000 ","licenseType":-1,"version":0,"thumbnailUrl":"http://centos.kaltura/p/101/sp/10100/thumbnail/entry_id/0_ba9href0/version/100002/acv/122","accessControlId":2,"replacementStatus":0,"partnerSortValue":0,"conversionProfileId":8,"rootEntryId":"0_ba9href0","operationAttributes":[],"entitledUsersEdit":"","entitledUsersPublish":"","capabilities":"","objectType":"KalturaMediaEntry"}';
const NON_MATCHING_ENTRY = '{"mediaType":1,"conversionQuality":8,"sourceType":"1","dataUrl":"http://centos.kaltura:80/p/101/sp/10100/playManifest/entryId/0_ba9href0/format/url/protocol/http","flavorParamsIds":"0,2,3,4,5","plays":0,"views":0,"width":852,"height":480,"duration":227,"msDuration":227000,"id":"0_xxxxxxx","name":"budget_20141014T131145_000000","partnerId":101,"userId":"someone@kaltura.com","creatorId":"someone@kaltura.com","status":2,"moderationStatus":6,"moderationCount":0,"type":1,"createdAt":1467621408,"updatedAt":1467621884,"rank":0,"totalRank":0,"votes":0,"downloadUrl":"http://centos.kaltura/p/101/sp/10100/raw/entry_id/0_ba9href0/version/0","searchText":"_PAR_ONLY_ _101_ _MEDIA_TYPE_1|  budget_20141014T131145_000000 ","licenseType":-1,"version":0,"thumbnailUrl":"http://centos.kaltura/p/101/sp/10100/thumbnail/entry_id/0_ba9href0/version/100002/acv/122","accessControlId":2,"replacementStatus":0,"partnerSortValue":0,"conversionProfileId":8,"rootEntryId":"0_ba9href0","operationAttributes":[],"entitledUsersEdit":"","entitledUsersPublish":"","capabilities":"","objectType":"KalturaMediaEntry"}';
const MIDDLE_CUE_POINTS = '{"objects":[{"protocolType":0,"sourceUrl":"www.1.com","adType":2,"title":"","endTime":135000,"duration":5000,"id":"0_1ioqwjwh","cuePointType":"adCuePoint.Ad","status":1,"entryId":"0_ba9href0","partnerId":101,"createdAt":1467621711,"updatedAt":1467621711,"tags":"","startTime":130000,"userId":"someone@kaltura.com","objectType":"KalturaAdCuePoint"},{"protocolType":1,"sourceUrl":"www.2.com","adType":2,"title":"","endTime":190000,"duration":10000,"id":"0_5fdy2hz4","cuePointType":"adCuePoint.Ad","status":1,"entryId":"0_ba9href0","partnerId":101,"createdAt":1467621711,"updatedAt":1467628803,"tags":"","startTime":180000,"userId":"someone@kaltura.com","objectType":"KalturaAdCuePoint"}],"totalCount":2,"objectType":"KalturaCuePointListResponse"}';
const END_WITH_POINTS = '{"objects":[{"protocolType":0,"sourceUrl":"www.1.com","adType":2,"title":"","endTime":135000,"duration":5000,"id":"0_1ioqwjwh","cuePointType":"adCuePoint.Ad","status":1,"entryId":"0_ba9href0","partnerId":101,"createdAt":1467621711,"updatedAt":1467621711,"tags":"","startTime":130000,"userId":"someone@kaltura.com","objectType":"KalturaAdCuePoint"},{"protocolType":1,"sourceUrl":"www.2.com","adType":2,"title":"","endTime":237000,"duration":10000,"id":"0_5fdy2hz4","cuePointType":"adCuePoint.Ad","status":1,"entryId":"0_ba9href0","partnerId":101,"createdAt":1467621711,"updatedAt":1467628803,"tags":"","startTime":226000,"userId":"someone@kaltura.com","objectType":"KalturaAdCuePoint"}],"totalCount":2,"objectType":"KalturaCuePointListResponse"}';
const PRE_ROLL_POINTS = '{"objects":[{"protocolType":0,"sourceUrl":"www.1.com","adType":2,"title":"","endTime":6000,"duration":5000,"id":"0_1ioqwjwh","cuePointType":"adCuePoint.Ad","status":1,"entryId":"0_ba9href0","partnerId":101,"createdAt":1467621711,"updatedAt":1467621711,"tags":"","startTime":1000,"userId":"someone@kaltura.com","objectType":"KalturaAdCuePoint"},{"protocolType":1,"sourceUrl":"www.2.com","adType":2,"title":"","endTime":90000,"duration":10000,"id":"0_5fdy2hz4","cuePointType":"adCuePoint.Ad","status":1,"entryId":"0_ba9href0","partnerId":101,"createdAt":1467621711,"updatedAt":1467628803,"tags":"","startTime":80000,"userId":"someone@kaltura.com","objectType":"KalturaAdCuePoint"}],"totalCount":2,"objectType":"KalturaCuePointListResponse"}';
const UI_CONF = '{update}';
const FLAVOR_URLS = '["http://centos.kaltura/p/101/sp/10100/serveFlavor/entryId/0_ba9href0/v/2/flavorId/0_0xtcdynb/fileName/budget_20141014T131145_000000_(Basic_Small_-_WEB_MBL_(H264_400)).mp4/forceproxy/true/name/a.mp4","http://centos.kaltura/p/101/sp/10100/serveFlavor/entryId/0_ba9href0/v/2/flavorId/0_1r79zkh0/fileName/budget_20141014T131145_000000_(Basic_Small_-_WEB_MBL_(H264_600)).mp4/forceproxy/true/name/a.mp4"]';
const CUE_POINT_CASES = '{ "objects": [{ "protocolType": 0, "sourceUrl": "www.1.com", "adType": 2, "title": "non rounded odd start ad", "endTime": 2111, "duration": 1000, "id": "0_1ioqwjwh", "cuePointType": "adCuePoint.Ad", "status": 1, "entryId": "0_ba9href0", "partnerId": 101, "createdAt": 1467621711, "updatedAt": 1467621711, "tags": "", "startTime": 1111, "userId": "someone@kaltura.com", "objectType": "KalturaAdCuePoint" }, { "protocolType": 0, "sourceUrl": "www.1.com", "adType": 2, "title": "non rounded even start ad", "endTime": 5111, "duration": 1000, "id": "0_1ioqwjwh", "cuePointType": "adCuePoint.Ad", "status": 1, "entryId": "0_ba9href0", "partnerId": 101, "createdAt": 1467621711, "updatedAt": 1467621711, "tags": "", "startTime": 4111, "userId": "someone@kaltura.com", "objectType": "KalturaAdCuePoint" }, { "protocolType": 1, "sourceUrl": "www.2.com", "adType": 2, "title": "rounded odd ad", "endTime": 8000, "duration": 1000, "id": "0_5fdy2hz4", "cuePointType": "adCuePoint.Ad", "status": 1, "entryId": "0_ba9href0", "partnerId": 101, "createdAt": 1467621711, "updatedAt": 1467628803, "tags": "", "startTime": 7000, "userId": "someone@kaltura.com", "objectType": "KalturaAdCuePoint" }, { "protocolType": 1, "sourceUrl": "www.2.com", "adType": 2, "title": "rounded even ad", "endTime": 11000, "duration": 1000, "id": "0_5fdy2hz4", "cuePointType": "adCuePoint.Ad", "status": 1, "entryId": "0_ba9href0", "partnerId": 101, "createdAt": 1467621711, "updatedAt": 1467628803, "tags": "", "startTime": 10000, "userId": "someone@kaltura.com", "objectType": "KalturaAdCuePoint" }, { "protocolType": 1, "sourceUrl": "www.2.com", "adType": 2, "title": "rounded even not interlacing", "endTime": 30000, "duration": 10000, "id": "0_5fdy2hz4", "cuePointType": "adCuePoint.Ad", "status": 1, "entryId": "0_ba9href0", "partnerId": 101, "createdAt": 1467621711, "updatedAt": 1467628803, "tags": "", "startTime": 20000, "userId": "someone@kaltura.com", "objectType": "KalturaAdCuePoint" }, { "protocolType": 1, "sourceUrl": "www.2.com", "adType": 2, "title": "rounded even interlacing", "endTime": 35000, "duration": 10000, "id": "0_5fdy2hz4", "cuePointType": "adCuePoint.Ad", "status": 1, "entryId": "0_ba9href0", "partnerId": 101, "createdAt": 1467621711, "updatedAt": 1467628803, "tags": "", "startTime": 25000, "userId": "someone@kaltura.com", "objectType": "KalturaAdCuePoint" } ], "totalCount": 6, "objectType": "KalturaCuePointListResponse" }';
const PARTNER_ID = 101;
const FLAVOR_DATA_LIST = '{ "objects": [{ "flavorParamsId": 0, "width": 640, "height": 360, "bitrate": 738, "frameRate": 29.97, "isOriginal": true, "isWeb": true, "containerFormat": "mp42", "videoCodecId": "avc1", "status": 2, "language": "Undefined", "id": "0_0xtcdynb", "entryId": "0_ba9href0", "partnerId": 105, "version": "12", "size": 16793, "tags": "source,web", "fileExt": "mp4", "createdAt": 1475405555, "updatedAt": 1475405648, "description": "", "objectType": "KalturaFlavorAsset" }, { "flavorParamsId": 2, "width": 640, "height": 360, "bitrate": 465, "frameRate": 29.97, "isOriginal": false, "isWeb": true, "containerFormat": "isom", "videoCodecId": "avc1", "status": 2, "language": "Undefined", "id": "0_1r79zkh0", "entryId": "0_ba9href0", "partnerId": 105, "version": "2", "size": 10547, "tags": "mobile,web,mbr,iphone,iphonenew", "fileExt": "mp4", "createdAt": 1475405648, "updatedAt": 1475405696, "description": "", "objectType": "KalturaFlavorAsset" }], "totalCount": 2, "objectType": "KalturaFlavorAssetListResponse" }';

const kalturaLayoutManager = new KalturaLayoutManager();
const matchingEntry = JSON.parse(MATCHING_ENTRY);
const nonMatchingEntry = JSON.parse(NON_MATCHING_ENTRY);
const middleCuePoints = JSON.parse(MIDDLE_CUE_POINTS).objects;
const endingCuePoints = JSON.parse(END_WITH_POINTS).objects;
const preRollPoints = JSON.parse(PRE_ROLL_POINTS).objects;
const flavorUrls = JSON.parse(FLAVOR_URLS);
const flavorDataList = JSON.parse(FLAVOR_DATA_LIST).objects;
for (let x = 0 ; x < flavorDataList.length; x++)
{
	flavorDataList[x].url = flavorUrls[x];
}

describe('test ManifestLayout middle cue points and no cuepoints ', function() {
	//var apiResults = JSON.parse(TWO_MIDDLE_CUE_POINTS_API_RESULTS);
	const vodData = new VodData(PARTNER_ID, flavorDataList, matchingEntry, UI_CONF, middleCuePoints);

	it('create No Cue Points Manifest Layout', function () {
		const noAdsLayoutResult = kalturaLayoutManager._createNoCuePointsManifestLayout(vodData);
		const noCuePointsLayout = JSON.parse(noAdsLayoutResult);
		expect(noCuePointsLayout.notifications).to.equal(undefined, 'should be no notifications');
		expect(noCuePointsLayout.sequences.length).to.equal(2, 'sequence length');
		expect(noCuePointsLayout.sequences[0].clips.length).to.equal(1, 'clips 0 length');
		expect(noCuePointsLayout.sequences[1].clips.length).to.equal(1, 'clips 1 length');
	});

	it('create Full Manifest Layout', function () {
		const fullLayoutResult = kalturaLayoutManager._createFullManifestLayout(vodData);
		const fullLayout = JSON.parse(fullLayoutResult);
		expect(fullLayout.notifications.length).to.equal(2, 'notifications');
		expect(fullLayout.sequences.length).to.equal(2, 'sequence length');
		expect(fullLayout.sequences[0].clips.length).to.equal(5, 'clips 0 length');
		expect(fullLayout.sequences[1].clips.length).to.equal(5, 'clips 1 length');
	});

});

describe('test ManifestLayout ending cue points', function() {
	const vodData = new VodData(PARTNER_ID, flavorDataList, matchingEntry, UI_CONF, endingCuePoints);

	it('test _createFullManifestLayout', function () {
		const fullLayoutResult = kalturaLayoutManager._createFullManifestLayout(vodData);
		const fullLayout = JSON.parse(fullLayoutResult);
		expect(fullLayout.notifications.length).to.equal(2, 'notifications');
		expect(fullLayout.sequences.length).to.equal(2, 'sequence length');
		expect(fullLayout.sequences[0].clips.length).to.equal(4, 'clips 0 length');
		expect(fullLayout.sequences[1].clips.length).to.equal(4, 'clips 1 length');
	});
});

describe('test ManifestLayout pre roll', function() {
	const vodData = new VodData(PARTNER_ID, flavorDataList, matchingEntry, UI_CONF, preRollPoints);

	it('test _createFullManifestLayout pre roll', function () {
		const fullLayoutResult = kalturaLayoutManager._createFullManifestLayout(vodData);
		const fullLayout = JSON.parse(fullLayoutResult);
		expect(fullLayout.notifications.length).to.equal(2, 'notifications');
		expect(fullLayout.sequences.length).to.equal(2, 'sequence length');
		expect(fullLayout.sequences[0].clips.length).to.equal(4, 'clips 0 length');
		expect(fullLayout.sequences[1].clips.length).to.equal(4, 'clips 1 length');
	});
});

describe('test generateBeaconRequest', function() {
	it('test generation with no special chars', function(){
		const url = 'http://projects.kaltura.com/beacons/CatchBeacon.php?id=10&eventType=start2';
		const beaconRequest = KalturaLayoutManager.generateBeaconRequest('0_xfrt', 'start', url, '0_gstsgsu', 1);

	})
});







