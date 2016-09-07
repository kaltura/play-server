const chai = require('chai');
const expect = chai.expect; // we are using the "expect" style of Chai
require('../../lib/utils/KalturaUtils');


describe('Testing KalturaUtils', function(){
	it('test encode 64', function(){
		const str = '{"type":"start","url":"http://projects.kaltura.com/beacons/CatchBeacon.php?id=10&eventType=start2","cuePointId":"0_xfrt","flavorId":"0_gstsgsu"}';
		const encoded = KalturaUtils.encodeString(str);
		const decoded = KalturaUtils.decodeString(encoded);
		expect(decoded).to.equal(str);
	});

});

