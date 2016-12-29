const chai = require('chai');
const expect = chai.expect; // we are using the "expect" style of Chai
const KalturaVastParser = require('../../lib/protocols/vast/KalturaVastParser');

require('../../lib/utils/KalturaConfig');
const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const VAST_FILE_EXAMPLE_URL = 'file:' + resourcesPath + '/VastExampleForUnitTest.xml';
const INVALID_VAST_FILE = 'file:' + resourcesPath + '/inValidVastExampleForUnitTest.xml';

const VAST_ONLINE_EXAMPLE_URL = `http://projects.kaltura.com/vast/vast12.xml`;
const DEFAULT_HEADERS = {};
const VAST_TIMEOUT = 10000;

describe('Testing Offline Kaltura Vast Parser', function()
{
	let vastResponse = null;
	// Since the call is asynchronous we need to use done to verify completion
	before(function(done){
		KalturaVastParser.parse(VAST_FILE_EXAMPLE_URL, DEFAULT_HEADERS, VAST_TIMEOUT,
			function (vastObject)
			{
				vastResponse = vastObject;
				done();
			},
			(err) => { done(); }
		);
	});

	it('Testing vast structure', function ()
	{
		expect(vastResponse.ads.length).to.equal(3);
		expect(vastResponse.ads[0].sequence).to.equal(1);
		expect(vastResponse.ads[1].creatives[0].mediaFiles.length).to.equal(9);
	});
});

describe('Testing Online Kaltura Vast Parser', function()
{
	let vastResponse = null;
	// Since the call is asynchronous we need to use done to verify completion
	before(function (done)
	{
		KalturaVastParser.parse(VAST_ONLINE_EXAMPLE_URL, DEFAULT_HEADERS, VAST_TIMEOUT,
			function (vastObject)
			{
				vastResponse = vastObject;
				done();
			},
			(err) => { done(); }
		);
	});

	it('Testing vast structure', function ()
	{
		expect(vastResponse.ads.length).to.equal(1);
		expect(vastResponse.ads[0].creatives[0].mediaFiles.length).to.equal(1);
	});
	
});

describe('Testing Offline Kaltura Vast Parser with invalid vast', function()
{
	let vastResponse = null;
	before(function(done){
		KalturaVastParser.parse(INVALID_VAST_FILE, DEFAULT_HEADERS, VAST_TIMEOUT,
			function (vastObject)
			{
				vastResponse = vastObject;
				done();
			},
			function(err)
			{
				done();
			}
		);
	});

	it('Testing vast structure', function ()
	{
		expect(vastResponse).to.equal(null);
	});
});


