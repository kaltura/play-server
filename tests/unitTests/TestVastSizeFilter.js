const chai = require('chai');
const VastSizeFilter = require('../../lib/protocols/vast/filters/VastSizeFilter');
const expect = chai.expect; // we are using the "expect" style of Chai
const should = chai.should(); // we are using the "expect" style of Chai
const KalturaVastParser = require('../../lib/protocols/vast/KalturaVastParser');
const VideoAttributes = require('../../lib/dataObjects/apiResponseObjects/VideoAttributes');

const AdsAttributesExample = require('../resources/AdsAttributesExample');
require('../../lib/utils/KalturaConfig');
const resourcesPath = KalturaConfig.config.testing.resourcesPath;
const VAST_EXAMPLE_URL = 'file:' + resourcesPath + '/VastExampleForUnitTest.xml';

const VAST_TIMEOUT = 1000;
const DEFAULT_HEADERS = {};

const adsAvailableList = [
	{ fileURL: 'horizontal1', bitrate: 1500, height: 480, width: 640 },
	{ fileURL: 'horizontal2', bitrate: 1000, height: 480, width: 640 },
	{ fileURL: 'horizontal3', bitrate: 500, height: 480, width: 640 },
	{ fileURL: 'horizontal4', bitrate: 100, height: 480, width: 640 },
	{ fileURL: 'horizontal5', bitrate: 50, height: 480, width: 640 },

	{ fileURL: 'vertical6', bitrate: 1500, height: 850, width: 640 },
	{ fileURL: 'vertical7', bitrate: 990, height: 850, width: 640 },
	{ fileURL: 'vertical8', bitrate: 600, height: 850, width: 640 },
	{ fileURL: 'vertical9', bitrate: 200, height: 850, width: 640 },
	{ fileURL: 'vertical10', bitrate: 45, height: 850, width: 640 },

	{ fileURL: 'horizontalLarge11', bitrate: 1500, height: 4800, width: 6400 },
	{ fileURL: 'horizontalLarge12', bitrate: 1000, height: 4800, width: 6400 },
	{ fileURL: 'horizontalLarge13', bitrate: 500, height: 4800, width: 6400 },
	{ fileURL: 'horizontalLarge14', bitrate: 100, height: 4800, width: 6400 },
	{ fileURL: 'horizontalLarge15', bitrate: 50, height: 4800, width: 6400 },

	{ fileURL: 'square16', bitrate: 2400, height: 712, width: 712 },
	{ fileURL: 'square17', bitrate: 1600, height: 712, width: 712 },
	{ fileURL: 'square18', bitrate: 700, height: 712, width: 712 },
	{ fileURL: 'square19', bitrate: 555, height: 712, width: 712 },
	{ fileURL: 'square20', bitrate: 20, height: 712, width: 712 }
];
const FAKE_ADS_VAST = {creatives: [{mediaFiles: adsAvailableList }] };
const PRODUCTION_FAKE_ADS_VAST = {creatives: [{mediaFiles: AdsAttributesExample.exampleAds }] };

let vastResponse = null;

describe('Test Size Filter', function(){
	this.timeout(478000);
	it('exact same attributes', function()
	{
		for (let example of adsAvailableList)
		{
			let flavorAttributes = new VideoAttributes(null, example.width, example.height, example.bitrate);
			let fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
			try
			{
				expect(fileURL).to.equal(example.fileURL);
			} catch (e)
			{
				console.error(e);
			}
		}
	});
	it('exact same attributes', function()
		{
			for (let example of AdsAttributesExample.exampleAds)
			{
				let flavorAttributes = new VideoAttributes(null, example.width, example.height, example.bitrate);
				let fileURL = VastSizeFilter.filter(flavorAttributes, PRODUCTION_FAKE_ADS_VAST);
				if (example.width * example.height * example.bitrate !== 0)
						(fileURL).should.equal(example.fileURL);
			}
		}
	);
	it('keep aspect ratio up', function()
		{
			for (let example of AdsAttributesExample.exampleAds)
			{
				let flavorAttributes = new VideoAttributes(null, example.width * 1.05, example.height * 1.05, example.bitrate);
				let fileURL = VastSizeFilter.filter(flavorAttributes, PRODUCTION_FAKE_ADS_VAST);
				if (example.width * example.height * example.bitrate !== 0)
						(fileURL).should.equal(example.fileURL);
			}
		}
	);
	it('keep aspect ratio down', function()
		{
			for (let example of AdsAttributesExample.exampleAds)
			{
				let flavorAttributes = new VideoAttributes(null, example.width * 0.98, example.height * 0.98, example.bitrate);
				let fileURL = VastSizeFilter.filter(flavorAttributes, PRODUCTION_FAKE_ADS_VAST);
				if (example.width * example.height * example.bitrate !== 0)
						(fileURL).should.equal(example.fileURL);
			}
		}
	);
	it('orientation factor', function()
	{
		let flavorAttributes = new VideoAttributes(null, 640, 360, 719);
		let fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
		expect(fileURL).to.include('horizontal');
		flavorAttributes = new VideoAttributes(null, 641, 640, 719);
		fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
		expect(fileURL).to.include('square');
		flavorAttributes = new VideoAttributes(null, 729, 620, 719);
		fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
		expect(fileURL).to.include('horizontal');
	});
	it('vertical factor', function()
	{
		let flavorAttributes = new VideoAttributes(null, 360, 480, 719);
		let fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
		expect(fileURL).to.include('vertical');
		flavorAttributes = new VideoAttributes(null, 640, 641, 719);
		fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
		expect(fileURL).to.include('square');
		flavorAttributes = new VideoAttributes(null, 620, 729, 719);
		fileURL = VastSizeFilter.filter(flavorAttributes, FAKE_ADS_VAST);
		expect(fileURL).to.include('vertical');
	});
});