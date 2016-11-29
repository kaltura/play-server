const chai = require('chai');
const VastDurationFilter = require('../../lib/protocols/vast/filters/VastDurationFilter');
const expect = chai.expect; // we are using the "expect" style of Chai
const KalturaVastParser = require('../../lib/protocols/vast/KalturaVastParser');

require('../../lib/utils/KalturaConfig');
const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const VAST_EXAMPLE_URL = 'file:' + resourcesPath + '/VastExampleForUnitTest.xml';

const VAST_TIMEOUT = 1000;
const DEFAULT_HEADERS = {};
const COEFFICIENT = 1;

let vastResponse = null;
/**
 * ads in the vast are of : 15sec, 30sec, 135sec
 */
describe('Test Duration Filter ', function(){

	// Since the call is asynchronous we need to use done to verify completion
	before(function(done){
		KalturaVastParser.parse(VAST_EXAMPLE_URL, DEFAULT_HEADERS, VAST_TIMEOUT,
			function (vastObject)
			{
				vastResponse = vastObject;
				done();
			},
			(err) => done()
		);
	});

	it('validate parse vast succeeded', function()
	{
		expect(vastResponse).not.to.equal(null);
	});

	it('validate duration filter expect single ad', function()
	{
		const duration = 10;// only the first ad is of the ~10 secs
		const filteredAds = VastDurationFilter.filter(vastResponse, duration, COEFFICIENT);
		expect(filteredAds.length).to.equal(1);
	});
	it('validate duration filter expect two ads', function()
	{
		const duration = 30;//only the first two are in the time scope
		const filteredAds = VastDurationFilter.filter(vastResponse, duration, COEFFICIENT);
		expect(filteredAds.length).to.equal(2);
	});
	it('validate duration filter expect all ads (3)', function()
	{
		const duration = 120;// expect all ads to take part
		const filteredAds = VastDurationFilter.filter(vastResponse, duration, COEFFICIENT);
		expect(filteredAds.length).to.equal(3);
	});
});
