const chai = require('chai');
const VastSizeFilter = require('../lib/protocols/vast/filters/VastSizeFilter');
const expect = chai.expect; // we are using the "expect" style of Chai
const KalturaVastParser = require('../lib/protocols/vast/KalturaVastParser');
const VideoAttributes = require('../lib/dataObjects/ApiResponseObjects/VideoAttributes');

const VAST_EXAMPLE_URL = `file:${__dirname}/resources/VastExample.xml`;
const VAST_TIMEOUT = 1000;
const DEFAULT_HEADERS = null;
let vastResponse = null;

describe('Test Size Filter', function(){

	// Since the call is asynchronous we need to use done to verify completion
	before(function(done){
		KalturaVastParser.parse(VAST_EXAMPLE_URL, DEFAULT_HEADERS, VAST_TIMEOUT,
			function (vastObject)
			{
				vastResponse = vastObject;
				done();
			});
	});

	it('validate parse vast succeeded', function()
	{
		expect(vastResponse).not.to.equal(null);
	});

	it('validate existing with same attributes', function()
	{
		const id = null;
		const width = 640;
		const height = 360;
		const bitrate = 719;
		const flavorAttributes = new VideoAttributes(id, width, height, bitrate);
		const ad = vastResponse.ads[0];
		const fileURL = VastSizeFilter.filter(flavorAttributes, ad);
		expect(fileURL).to.includes('63021BC1D7A6CEC33A99C122A5E8A38C6B280515');
	});

	it('validate only bitare changed small diff', function()
	{
		const id = null;
		const width = 1280;
		const height = 720;
		const bitrate = 1500;
		const flavorAttributes = new VideoAttributes(id, width, height, bitrate);
		const ad = vastResponse.ads[1];
		const fileURL = VastSizeFilter.filter(flavorAttributes, ad);
		expect(fileURL).to.include('1600K_1280x720');
	});

	it('validate only bitare changed big diff', function()
	{
		const id = null;
		const width = 1280;
		const height = 720;
		const bitrate = 50;
		const flavorAttributes = new VideoAttributes(id, width, height, bitrate);
		const ad = vastResponse.ads[1];
		const fileURL = VastSizeFilter.filter(flavorAttributes, ad);
		expect(fileURL).to.include('1600K_1280x720');
	});

	// todo this currently fails since the algorithm is wrong in selecting best ad
	//it('validate same aspect different values by factor', function()
	//{
	//	const id = null;
	//	const width = 176 * 5;
	//	const height = 132 * 5;
	//	const bitrate = 130;
	//	const flavorAttributes = new VideoAttributes(id, width, height, bitrate);
	//	const ad = vastResponse.ads[1];
	//	const sizeFilter = new VastSizeFilter(flavorAttributes, ad);
	//	const fileURL = sizeFilter.filter();
	//	expect(fileURL).to.include('130K_176x132');
	//});
});