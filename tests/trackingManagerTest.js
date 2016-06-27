/**
 * This is a unit test to validate proper functionality of the tracking manager for the different types of layouts
 */
var chai = require('chai');
var expect = chai.expect; // we are using the "expect" style of Chai

var kalturaTrackingManager = require('./../lib/managers/KalturaTrackingManager');

function removeWhiteSpaces(text){
	return text.replace(/ /g,'');
}

describe('testTrackingManager', function() {
	it('check kalturaTrackingManager', function () {

		var beaconParams = {
			url: 'beaconUrl',
			cuePointId: 'cp1',
			type: 'TrackType1',
			entryId: 'e1',
		};

		var generatedBeaconRequest = kalturaTrackingManager.KalturaTrackingManager.generateBeaconRequest('erezHost','p1', beaconParams);
		expect(removeWhiteSpaces(generatedBeaconRequest)).to.equal('http://erezHost:80/p/p1/entryId/e1/tracking/sendBeacon?url=beaconUrl&cuePointId=cp1&type=TrackType1&entryId=e1');

	});

	it('check buildTrackingBeaconCacheKey', function () {

		var beaconParams = {
			url: 'testUrl',
			cuePointId: 'cpId1',
			type: 'TrackType1',
			entryId: 'eId1',
			partnerId: 'p1',
			headers: 'headers1',
		};

		var text1 = kalturaTrackingManager.KalturaTrackingManager.buildTrackingBeaconCacheKey(beaconParams);
		expect(removeWhiteSpaces(text1)).to.equal('f5cabf39d0f241b5fd729b1c2d3411da35b1a122');
	});

});


