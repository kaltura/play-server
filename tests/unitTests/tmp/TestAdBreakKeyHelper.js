const chai = require('chai');
const expect = chai.expect;
const AdBreakKeyHelper = require('../../../lib/managers/helpers/AdBreakKeyHelper');
const VALID_VALUE_PARTIAL_BLOCKED = '#COUNT:3#0:mykey0#2:mykey2#BLOCKED';
const VALID_VALUE_PARTIAL_BLOCKED_EXTRA_SEPERATORS = '##COUNT:3#0:mykey0##2:mykey2#BLOCKED##';
const VALID_VALUE_FULL_NOT_BLOCKED = '#COUNT:3#1:mykey1#0:mykey0#2:mykey2';
const VALID_VALUE_FULL_ORDERED_AND_BLOCKED = '#COUNT:3#0:mykey0#1:mykey1#2:mykey2#BLOCKED';
const VALID_VALUE_DFAULT_AND_BLOCKED = '#COUNT:3#0:mykey01#1:mykey11#1:mykey12#2:mykey21#BLOCKED#2:mykey22#0:mykey02#';
const real = '##COUNT:3##FILLER:v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.7486642359644109##0:v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.868928705023488##1:v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.09445175166897135##2:v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.27524820267948047#';
let localUndefined;

describe('Test Ad Break Key Helper', function(){
	it('Test VALID_VALUE_PARTIAL_BLOCKED', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_PARTIAL_BLOCKED);
		expect(adBreakKeyHelper.isBlocked()).to.equal(true);
		expect(adBreakKeyHelper.getIndexReadyAd(0)).to.equal('mykey0');
		expect(adBreakKeyHelper.getIndexReadyAd(1)).to.equal(localUndefined);
		expect(adBreakKeyHelper.getIndexReadyAd(2)).to.equal('mykey2');
	});
	it('Test VALID_VALUE_PARTIAL_BLOCKED_EXTRA_SEPERATORS', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_PARTIAL_BLOCKED_EXTRA_SEPERATORS);
		expect(adBreakKeyHelper.isBlocked()).to.equal(true);
		expect(adBreakKeyHelper.getIndexReadyAd(0)).to.equal('mykey0');
		expect(adBreakKeyHelper.getIndexReadyAd(1)).to.equal(localUndefined);
		expect(adBreakKeyHelper.getIndexReadyAd(2)).to.equal('mykey2');
	});
	it('Test VALID_VALUE_FULL_NOT_BLOCKED', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_FULL_NOT_BLOCKED);
		expect(adBreakKeyHelper.isBlocked()).to.equal(false);
		expect(adBreakKeyHelper.getIndexReadyAd(0)).to.equal('mykey0');
		expect(adBreakKeyHelper.getIndexReadyAd(1)).to.equal('mykey1');
		expect(adBreakKeyHelper.getIndexReadyAd(2)).to.equal('mykey2');
	});
	it('Test VALID_VALUE_FULL_ORDERED_AND_BLOCKED', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_FULL_ORDERED_AND_BLOCKED);
		expect(adBreakKeyHelper.isBlocked()).to.equal(true);
		expect(adBreakKeyHelper.getIndexReadyAd(0)).to.equal('mykey0');
		expect(adBreakKeyHelper.getIndexReadyAd(1)).to.equal('mykey1');
		expect(adBreakKeyHelper.getIndexReadyAd(2)).to.equal('mykey2');
	});
	it('Test VALID_VALUE_DFAULT_AND_BLOCKED', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_DFAULT_AND_BLOCKED);
		expect(adBreakKeyHelper.isBlocked()).to.equal(true);
		expect(adBreakKeyHelper.getIndexReadyAd(0)).to.equal('mykey01');
		expect(adBreakKeyHelper.getIndexReadyAd(1)).to.equal('mykey12');
		expect(adBreakKeyHelper.getIndexReadyAd(2)).to.equal('mykey21');
	});
	it('Test real', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(real);
		expect(adBreakKeyHelper.isBlocked()).to.equal(false);
		expect(adBreakKeyHelper.getFiller()).to.equal('v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.7486642359644109');
		expect(adBreakKeyHelper.getIndexReadyAd(0)).to.equal('v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.868928705023488');
		expect(adBreakKeyHelper.getIndexReadyAd(1)).to.equal('v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.09445175166897135');
		expect(adBreakKeyHelper.getIndexReadyAd(2)).to.equal('v0-adsReady-0_7plhunmr-0_gnkoxpxo-192.168.162.221_0.796668874005170.27524820267948047');
	});
});
