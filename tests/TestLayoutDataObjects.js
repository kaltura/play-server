/**
 * This is a unit test to validate proper functionality of the layout manager for the different types of layouts
 */


var chai = require('chai');
var expect = chai.expect; // we are using the "expect" style of Chai
require('./../lib/dataObjects/LayoutDataObjects');

var DURATION_A = 1000;
var DURATION_B = 2000;
var DURATION_C = 4000;
var SOURCE1_PATH_FALVOR1 = "/web/flavor1_1.mp4";
var SOURCE1_PATH_FALVOR2 = "/web/flavor2_1.mp4";
var SOURCE2_PATH_FALVOR1 = "/web/flavor1_2.mp4";
var SOURCE2_PATH_FALVOR2 = "/web/flavor2_2.mp4";
var DYNAMIC_ID_FALVOR1 = "http://playserver/ad_break/flavor1.request";
var DYNAMIC_ID_FALVOR2 = "http://playserver/ad_break/flavor2.request";
var FETCH_OFFSET1 = 1500;
var FETCH_OFFSET2 = 2000;
var FETCH_LINK1 = "http://playserver/fetch1";
var FETCH_LINK2 = "http://playserver/fetch1";
var NUMBER_OF_FLAVORS  = 2;

var MANIFEST_LAYOUT_EXPECTED_RESULT =	'{ "discontinuity": false,' +
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

var AD_ID1 = "adId1";
var AD_ID2 = "adId2";
var AD_FILLER = "filler";
var BEACON1_ID = "beacon1";
var BEACON2_ID = "beacon2";
var BEACON3_ID = "beacon3";
var BEACON4_ID = "beacon4";
var BEACON1_OFFSET = "1000";
var BEACON2_OFFSET = "2000";
var BEACON3_OFFSET = "3000";
var BEACON4_OFFSET = "4000";

var AD_BREAK_EXPECTED_RESULT = '{ "clipIds": ["'+ AD_ID1 +'", "' + AD_ID2 + '" ,"'+ AD_FILLER +'"],' +
	'"durations": [ '+ DURATION_A + ',' + DURATION_B + ',' + DURATION_C +'],' +
	'"notifications": [' +
		'{ "id": "'+ BEACON1_ID +'", "offset": '+BEACON1_OFFSET+' },' +
		'{ "id": "'+ BEACON2_ID +'", "offset": '+BEACON2_OFFSET+' },' +
		'{ "id": "'+ BEACON3_ID +'", "offset": '+BEACON3_OFFSET+' },' +
		'{ "id": "'+ BEACON4_ID +'", "offset": '+BEACON4_OFFSET+' }' +
	']}';

var AD_PATH_EXPECTED_RESULT = '{"path":"' +SOURCE1_PATH_FALVOR1  + '"}';

function removeWhiteSpaces(text){
	return text.replace(/ /g,'');
}

describe('testLayoutObjects', function() {
	it('check ManifestLayoutData', function() {
		var manifestData = new ManifestLayoutData(NUMBER_OF_FLAVORS);
		var clips1 = [ new SourceClipData(0, SOURCE1_PATH_FALVOR1),
		    new SourceClipData(0, SOURCE1_PATH_FALVOR2)
			];
		var clips2 = [ new DynamicClipData(DYNAMIC_ID_FALVOR1),
			 new DynamicClipData(DYNAMIC_ID_FALVOR2)
			];
		var paths = new Array();
		paths.push(SOURCE2_PATH_FALVOR1);
		paths.push(SOURCE2_PATH_FALVOR2);
		var clips3 = new SourceClipDataArray(DURATION_A, paths);
		manifestData.addSequence(DURATION_A, clips1);
		manifestData.addSequence(DURATION_B, clips2);
		manifestData.addSequence(DURATION_C, clips3.clips);
		manifestData.addNotification(new NotificationData(FETCH_LINK1, FETCH_OFFSET1));
		manifestData.addNotification(new NotificationData(FETCH_LINK2, FETCH_OFFSET2));

		expect(removeWhiteSpaces(manifestData.toJSON())).to.equal(removeWhiteSpaces(MANIFEST_LAYOUT_EXPECTED_RESULT));
	});

	it('check AdBreakLayoutData', function() {
		var adBreakData = new AdBreakLayoutData();
		adBreakData.addClip(AD_ID1, DURATION_A);
		adBreakData.addClip(AD_ID2, DURATION_B);
		adBreakData.addClip(AD_FILLER, DURATION_C);
		adBreakData.addNotification(new NotificationData(BEACON1_ID, BEACON1_OFFSET));
		adBreakData.addNotification(new NotificationData(BEACON2_ID, BEACON2_OFFSET));
		adBreakData.addNotification(new NotificationData(BEACON3_ID, BEACON3_OFFSET));
		adBreakData.addNotification(new NotificationData(BEACON4_ID, BEACON4_OFFSET));
		expect(removeWhiteSpaces(adBreakData.toJSON())).to.equal(removeWhiteSpaces(AD_BREAK_EXPECTED_RESULT));
	});

	it('check AdPathLayoutData', function() {
		var adPathData = new AdPathLayoutData();
		adPathData.setPath(SOURCE1_PATH_FALVOR1);
		expect(removeWhiteSpaces(adPathData.toJSON())).to.equal(AD_PATH_EXPECTED_RESULT);
	});
});

