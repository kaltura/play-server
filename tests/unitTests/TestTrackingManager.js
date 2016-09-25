/**
 * This is a unit test to validate proper functionality of the tracking manager for the different types of layouts
 */
const chai = require('chai');
const util = require('util');
var fs = require('fs');
const expect = chai.expect; // we are using the "expect" style of Chai

const KalturaTrackingManager = require('./../../lib/managers/KalturaTrackingManager');
const KalturaLayoutManager = require('./../../lib/managers/KalturaLayoutManager');
require('../../lib/utils/KalturaConfig');

function removeWhiteSpaces(text){
	return text.replace(/ /g,'');
}
function checkIfExist(path){
	try {
		fs.accessSync(path, fs.F_OK);
		return true;
	} catch (e) {
		return false;
	}
}

describe('testTrackingManager', function() {
	this.timeout(60000);
	//it('check kalturaTrackingManager', function () {
	//
	//	let beaconParams = {
	//		url: 'beaconUrl',
	//		cuePointId: 'cp1',
	//		type: 'TrackType1',
	//		entryId: 'e1'
	//	};
	//
	//	let generatedBeaconRequest = KalturaLayoutManager.generateBeaconRequest('erezHost','p1', beaconParams);
	//
	//	let b64 = KalturaUtils.encodeString(JSON.stringify({type: 'p1', url: beaconParams, cuePointId: 'erezHost'}));
	//	let expectedAns = 'tracking/sendBeacon/trackingId/' + b64;
	//	expect(removeWhiteSpaces(generatedBeaconRequest)).to.equal(expectedAns);
	//});
	//
	//it('check buildTrackingBeaconCacheKey', function () {
	//
	//	let beaconParams = {
	//		url: 'testUrl',
	//		cuePointId: 'cpId1',
	//		type: 'TrackType1',
	//		entryId: 'eId1',
	//		partnerId: 'p1',
	//		headers: 'headers1',
	//		trackingId: '999999'
	//	};
	//	let beaconUrlCacheKey = KalturaTrackingManager.buildTrackingBeaconCacheKey(beaconParams);
	//	expect(removeWhiteSpaces(beaconUrlCacheKey)).to.equal('999999-add28d9b3afc617ff6ca7a570fd416a2');
	//});

	const kalturaTesting = require('./../../lib/managers/KalturaTestingManager');
	it('check trackingBeacons', function (done) {
		this.sync = true;

		filePath = KalturaConfig.config.testing.outputPath + '/beaconTracking.txt';
		if (checkIfExist(filePath))
			fs.unlinkSync(filePath);

		let tester = new kalturaTesting.KalturaTestingManager();
		TrackingBeacon = 'david1';
		tester.writeBeaconToFile(TrackingBeacon);

		setTimeout(function() {
			if (!checkIfExist(filePath))
				throw new Error("fail - no Log file");
			var contents = fs.readFileSync(filePath, 'utf8');
			/*		if you also want to check time
			var time = new Date().getTime() - 5000; //reduce 5 sec of time out
			time = Math.floor(time/100); //reduce 2 last digit
			expect(contents.substring(0, contents.length - 3)).to.equal('Tracked beacon: ' + TrackingBeacon + ' ' + time);
			*/
			expect(contents.substring(0, contents.length - 15)).to.equal('Tracked beacon: ' + TrackingBeacon);
			done();
		}, 5000);

	});


});


