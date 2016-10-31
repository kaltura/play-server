const chai = require('chai');
const expect = chai.expect;
const AdBreakKeyHelper = require('../../lib/managers/helpers/AdBreakKeyHelper');
const VALID_VALUE_PARTIAL_BLOCKED = '#COUNT:1:flavor1,flavor2##AD:flavor1:0:cacheAdKey_0_flavor1##BLACK_FILLER:flavor2:cacheBlackFillerKeyFlavor2##FILLER:flavor1:cacheFillerKeyFlavor1##BLACK_FILLER:flavor1:cacheBlackFillerKeyFlavor1##BLOCKED#';
const VALID_VALUE_PARTIAL_BLOCKED_EXTRA_SEPERATORS = '######COUNT:1:flavor1,flavor2##AD:flavor1:0:cacheAdKey_0_flavor1#######BLACK_FILLER:flavor2:cacheBlackFillerKeyFlavor2##FILLER:flavor1:cacheFillerKeyFlavor1######BLACK_FILLER:flavor1:cacheBlackFillerKeyFlavor1##BLOCKED#';
const VALID_VALUE_FULL_ORDERED_AND_BLOCKED = '#COUNT:1:flavor1,flavor2##AD:flavor1:0:cacheAdKey_0_flavor1##BLACK_FILLER:flavor2:cacheBlackFillerKeyFlavor2##FILLER:flavor1:cacheFillerKeyFlavor1##BLACK_FILLER:flavor1:cacheBlackFillerKeyFlavor1#AD:flavor2:0:cacheAdKey_0_flavor2##FILLER:flavor2:cacheFillerKeyFlavor2#BLOCKED#';
let localUndefined;

describe('Test Ad Break Key Helper', function(){
	it('Test VALID_VALUE_PARTIAL_BLOCKED', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_PARTIAL_BLOCKED);
		expect(adBreakKeyHelper.areAllAdsReady()).to.equal(false);
		expect(adBreakKeyHelper.areAllBlackFillersReady()).to.equal(true);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1').length).to.equal(1);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1')[0]).to.equal('cacheBlackFillerKeyFlavor1');
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2').length).to.equal(1);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2')[0]).to.equal('cacheBlackFillerKeyFlavor2');
	});
	it('Test VALID_VALUE_PARTIAL_BLOCKED_EXTRA_SEPERATORS', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_PARTIAL_BLOCKED_EXTRA_SEPERATORS);
		expect(adBreakKeyHelper.areAllAdsReady()).to.equal(false);
		expect(adBreakKeyHelper.areAllBlackFillersReady()).to.equal(true);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1').length).to.equal(1);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1')[0]).to.equal('cacheBlackFillerKeyFlavor1');
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2').length).to.equal(1);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2')[0]).to.equal('cacheBlackFillerKeyFlavor2');
	});
	it('Test VALID_VALUE_FULL_ORDERED_AND_BLOCKED', function() {
		const adBreakKeyHelper = new AdBreakKeyHelper(VALID_VALUE_FULL_ORDERED_AND_BLOCKED);
		expect(adBreakKeyHelper.areAllAdsReady()).to.equal(true);
		expect(adBreakKeyHelper.areAllBlackFillersReady()).to.equal(true);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1').length).to.equal(2);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1')[0]).to.equal('cacheAdKey_0_flavor1');
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor1')[1]).to.equal('cacheFillerKeyFlavor1');
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2').length).to.equal(2);
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2')[0]).to.equal('cacheAdKey_0_flavor2');
		expect(adBreakKeyHelper.getAdBreakReadyKeysForFlavor('flavor2')[1]).to.equal('cacheFillerKeyFlavor2');
	});
});
