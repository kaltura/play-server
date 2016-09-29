/**
 * This is a unit test to validate proper functionality of the layout manager for the different types of layouts
 */


const chai = require('chai');
const util = require('util');
const expect = chai.expect; // we are using the 'expect' style of Chai
const VODManifestLayoutData = require('../../lib/dataObjects/layoutObjects/VODManifestLayoutData');
const DynamicClipData = require('../../lib/dataObjects/layoutObjects/DynamicClipData');
const SourceClipData = require('../../lib/dataObjects/layoutObjects/SourceClipData');
const SourceClipDataArray = require('../../lib/dataObjects/layoutObjects/SourceClipDataArray');
const NotificationLayoutData = require('../../lib/dataObjects/layoutObjects/NotificationLayoutData');
const AdBreakLayoutData = require('../../lib/dataObjects/layoutObjects/AdBreakLayoutData');
const AdPathLayoutData = require('../../lib/dataObjects/layoutObjects/AdPathLayoutData');

const DURATION_A = 1000;
const DURATION_B = 2000;
const DURATION_C = 4000;
const SOURCE1_PATH_FALVOR1 = '/web/flavor1_1.mp4';
const SOURCE1_PATH_FALVOR2 = '/web/flavor2_1.mp4';
const SOURCE2_PATH_FALVOR1 = '/web/flavor1_2.mp4';
const SOURCE2_PATH_FALVOR2 = '/web/flavor2_2.mp4';
const DYNAMIC_ID_FALVOR1 = 'http://playserver/ad_break/flavor1.request';
const DYNAMIC_ID_FALVOR2 = 'http://playserver/ad_break/flavor2.request';
const FETCH_OFFSET1 = 1500;
const FETCH_OFFSET2 = 2000;
const FETCH_LINK1 = 'http://playserver/fetch1';
const FETCH_LINK2 = 'http://playserver/fetch1';
const NUMBER_OF_FLAVORS = 2;

const MANIFEST_LAYOUT_EXPECTED_RESULT =	'{ "discontinuity": false,' +
	'"durations": [ '+ DURATION_A + ',' + DURATION_B + ',' + DURATION_C +'],' +
	'"sequences": ['+
		'{ "clips": [ '+
			'{"type": "source","path": "' + SOURCE1_PATH_FALVOR1 + '" ,"clipFrom":0 },'+
			'{"type": "dynamic","id": "'+ DYNAMIC_ID_FALVOR1 +'"},' +
			'{"type": "source","path": "' + SOURCE2_PATH_FALVOR1 + '" ,"clipFrom":'+ DURATION_A +' }] },'+
		'{ "clips": [ '+
			'{"type": "source","path": "' + SOURCE1_PATH_FALVOR2 + '" ,"clipFrom":0 },'+
			'{"type": "dynamic","id": "'+ DYNAMIC_ID_FALVOR2 +'"},' +
			'{"type": "source","path": "' + SOURCE2_PATH_FALVOR2 + '" ,"clipFrom":' +DURATION_A +' }] }],'+
	'"notifications":[' +
		'{"id": "' + FETCH_LINK1 + '","offset":' + FETCH_OFFSET1 + '},' +
		'{"id": "'+ FETCH_LINK2 + '","offset":' + FETCH_OFFSET2 + '}]}';

const AD_ID1 = 'adId1';
const AD_ID2 = 'adId2';
const AD_FILLER = 'filler';
const BEACON1_ID = 'beacon1';
const BEACON2_ID = 'beacon2';
const BEACON3_ID = 'beacon3';
const BEACON4_ID = 'beacon4';
const BEACON1_OFFSET = '1000';
const BEACON2_OFFSET = '2000';
const BEACON3_OFFSET = '3000';
const BEACON4_OFFSET = '4000';

const AD_BREAK_EXPECTED_RESULT = '{ "clipIds": ["'+ AD_ID1 +'", "' + AD_ID2 + '" ,"'+ AD_FILLER +'"],' +
	'"durations": [ '+ DURATION_A + ',' + DURATION_B + ',' + DURATION_C +'],' +
	'"notifications": [' +
		'{ "id": "'+ BEACON1_ID +'", "offset": '+BEACON1_OFFSET+' },' +
		'{ "id": "'+ BEACON2_ID +'", "offset": '+BEACON2_OFFSET+' },' +
		'{ "id": "'+ BEACON3_ID +'", "offset": '+BEACON3_OFFSET+' },' +
		'{ "id": "'+ BEACON4_ID +'", "offset": '+BEACON4_OFFSET+' }' +
	']}';

const AD_PATH_EXPECTED_RESULT = `{"path":"${SOURCE1_PATH_FALVOR1}"}`;

function removeWhiteSpaces(text)
{
	return text.replace(/ /g, '');
}

describe('testLayoutObjects', function() {
	it('check ManifestLayoutData', function() {
		const manifestData = new VODManifestLayoutData(NUMBER_OF_FLAVORS);
		const clips1 = [new SourceClipData(0, SOURCE1_PATH_FALVOR1),
			new SourceClipData(0, SOURCE1_PATH_FALVOR2)];
		const clips2 = [new DynamicClipData(DYNAMIC_ID_FALVOR1),
			new DynamicClipData(DYNAMIC_ID_FALVOR2)];
		const paths = new Array();
		paths.push(SOURCE2_PATH_FALVOR1);
		paths.push(SOURCE2_PATH_FALVOR2);
		const clips3 = new SourceClipDataArray(DURATION_A, paths);
		manifestData.addSequence(DURATION_A, clips1);
		manifestData.addSequence(DURATION_B, clips2);
		manifestData.addSequence(DURATION_C, clips3.clips);
		manifestData.addNotification(new NotificationLayoutData(FETCH_LINK1, FETCH_OFFSET1));
		manifestData.addNotification(new NotificationLayoutData(FETCH_LINK2, FETCH_OFFSET2));

		expect(removeWhiteSpaces(manifestData.toJSON())).to.equal(removeWhiteSpaces(MANIFEST_LAYOUT_EXPECTED_RESULT));
	});

	it('check AdBreakLayoutData', function() {
		const adBreakData = new AdBreakLayoutData();
		adBreakData.addClip(AD_ID1, DURATION_A);
		adBreakData.addClip(AD_ID2, DURATION_B);
		adBreakData.addClip(AD_FILLER, DURATION_C);
		adBreakData.addNotification(new NotificationLayoutData(BEACON1_ID, BEACON1_OFFSET));
		adBreakData.addNotification(new NotificationLayoutData(BEACON2_ID, BEACON2_OFFSET));
		adBreakData.addNotification(new NotificationLayoutData(BEACON3_ID, BEACON3_OFFSET));
		adBreakData.addNotification(new NotificationLayoutData(BEACON4_ID, BEACON4_OFFSET));
		expect(removeWhiteSpaces(adBreakData.toJSON())).to.equal(removeWhiteSpaces(AD_BREAK_EXPECTED_RESULT));
	});

	it('check AdPathLayoutData', function() {
		const adPathData = new AdPathLayoutData();
		adPathData.setPath(SOURCE1_PATH_FALVOR1);
		expect(removeWhiteSpaces(adPathData.toJSON())).to.equal(AD_PATH_EXPECTED_RESULT);
	});

	it('check Notification layout object sort', function() {
		const trackingList = [];
		trackingList.push(new NotificationLayoutData(BEACON2_ID, BEACON2_OFFSET));
		trackingList.push(new NotificationLayoutData(BEACON3_ID, BEACON3_OFFSET));
		trackingList.push(new NotificationLayoutData(BEACON1_ID, BEACON1_OFFSET));
		trackingList.push(new NotificationLayoutData(BEACON4_ID, BEACON4_OFFSET));
		trackingList.sort(NotificationLayoutData.compare);
		expect(trackingList[0].offset).to.equal(BEACON1_OFFSET);
		expect(trackingList[1].offset).to.equal(BEACON2_OFFSET);
		expect(trackingList[2].offset).to.equal(BEACON3_OFFSET);
		expect(trackingList[3].offset).to.equal(BEACON4_OFFSET);
	});
});

