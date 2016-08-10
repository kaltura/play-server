/**
 * This is a unit test to validate proper functionality of the tracking manager for the different types of layouts
 */
const chai = require('chai');
const expect = chai.expect; // we are using the "expect" style of Chai

const KalturaTrackingManager = require('./../lib/managers/KalturaTrackingManager');
const KalturaLayoutManager = require('./../lib/managers/KalturaLayoutManager');

function removeWhiteSpaces(text){
	return text.replace(/ /g,'');
}

describe('testTrackingManager', function() {
	it('check kalturaTrackingManager', function () {

		let beaconParams = {
			url: 'beaconUrl',
			cuePointId: 'cp1',
			type: 'TrackType1',
			entryId: 'e1',
		};

		let generatedBeaconRequest = KalturaLayoutManager.generateBeaconRequest('erezHost','p1', beaconParams);
		expect(removeWhiteSpaces(generatedBeaconRequest)).to.equal('http://erezHost:80/p/p1/entryId/e1/tracking/sendBeacon?url=beaconUrl&cuePointId=cp1&type=TrackType1&entryId=e1');

	});

	it('check buildTrackingBeaconCacheKey', function () {

		let beaconParams = {
			url: 'testUrl',
			cuePointId: 'cpId1',
			type: 'TrackType1',
			entryId: 'eId1',
			partnerId: 'p1',
			headers: 'headers1',
		};

		let beaconUrlCacheKey = KalturaTrackingManager.buildTrackingBeaconCacheKey(beaconParams);
		expect(removeWhiteSpaces(beaconUrlCacheKey)).to.equal('add28d9b3afc617ff6ca7a570fd416a2');
	});

});


