// TODO:
//	1. support single bitrate master manifest

/*

npm install memcached

*/

var formatTime = require('./formatTime');
var accessLog = require('./accessLog');
var stitcher = require('../../native/node_addons/TsStitcher/build/Release/TsStitcher');
var http = require('http');
var httpClient = require('follow-redirects').http;
var url = require('url');
var querystring = require('querystring');
var util = require('util');
var memcached = require('memcached');
var memcachedbin = require('./memcachedbin');			// XXXXX TODO fix memcache library so that we won't need 2 instances
var crypto = require('crypto');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var fs = require('fs');

require('./vastParser');

// parameters
const LOCAL_SERVER_PORT = 1337;
const SERVER_EXTERNAL_DOMAIN = 'adstitchdemo.kaltura.com';
const SERVER_EXTERNAL_URL = SERVER_EXTERNAL_DOMAIN;
const SERVER_EXTERNAL_HTTP_URL = 'http://' + SERVER_EXTERNAL_URL;
const START_TRACKER_URL = 'http://localhost:' + LOCAL_SERVER_PORT;
const MEMCACHE_URL = 'localhost:11211';

const STREAM_TRACKER_SCRIPT = __dirname + '/../tracker/streamTracker.sh';

const PREPARE_AD_SCRIPT = __dirname + '/../tracker/prepareAd.sh';

const SERVER_SECRET = 'Angry birds !!!';

// NOTE: the following constants must match ts_stitcher_impl.h
const PBA_CALL_AGAIN = 0;
const PBA_GET_NEXT_CHUNK = 1;
const PBA_CLONE_CURRENT_CHUNK = 2;

const ALIGN_LEFT = 		0;
const ALIGN_MIDDLE =	1;
const ALIGN_RIGHT = 	2;

const CHUNK_TYPE_INVALID  =	-1;
const CHUNK_TYPE_TS_HEADER = 0;
const CHUNK_TYPE_PRE_AD = 	 1;
const CHUNK_TYPE_POST_AD = 	 2;

const CHUNK_TYPE_AD = 		 3;
const CHUNK_TYPE_BLACK = 	 4;

// NOTE: the following constants must match videoMemcache.py
const TS_PACKET_LENGTH = 188;
const FILE_CHUNK_SIZE = 2500 * TS_PACKET_LENGTH;

// content types
const CONTENT_TYPE_PLAIN_TEXT = 'text/plain';
const CONTENT_TYPE_XML = 'application/xml';
const CONTENT_TYPE_HTML = 'text/html';
const CONTENT_TYPE_ICON = 'image/x-icon';
const CONTENT_TYPE_M3U8 = 'application/vnd.apple.mpegurl';
const CONTENT_TYPE_MPEG2TS = 'video/MP2T';

// URIs
const MASTER_STITCH_URI = '/masterstitch.m3u8';
const FLAVOR_STITCH_URI = '/flavorstitch.m3u8';
const MASTER_PROXY_URI = '/masterproxy.m3u8';
const FLAVOR_PROXY_URI = '/flavorproxy.m3u8';
const INSERT_AD_URI = '/insertAd.js';
const START_TRACKER_URI = '/startAdTracker.js';
const AD_SEGMENT_REDIRECT_URI = '/adRedirect.ts';
const STITCH_SEGMENT_URI = '/stitchSegment.ts';
const IS_WATCHED_URI = '/isWatched.js';
const GET_NEXT_AD_TIME_URI = '/getNextAdTime.js';
const SHORT_URL_URI = '/shortUrl.js';
const NOTIFY_ERROR_URI = '/notifyError.js';
const NOTIFY_STATUS_URI = '/notifyStatus.js';
const NOTIFY_STATUS_ADMIN_URI = '/notifyStatusAdmin.js';
const RESTART_SERVER_URI = '/restartServer.js';
const FAVICON_ICO_URI = '/favicon.ico';
const CROSS_DOMAIN_URI = '/crossdomain.xml';

const NO_DVR_M3U8_TS_COUNT = 3;

// paths
const PLAY_ERROR_LOG_PATH = '/tmp/playErrorLog/';
const MANIFEST_PATH = '/tmp/manifests/';
const TS_FILES_PATH = '/tmp/tsFiles/';

var memcache = new memcached(MEMCACHE_URL);

// add startsWith/endsWith functions to string
if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}

if (typeof String.prototype.endsWith != 'function') {
  String.prototype.endsWith = function (str){
    return this.slice(-str.length) == str;
  };
}

if (typeof String.prototype.replaceAll != 'function') {
	String.prototype.replaceAll = function(str1, str2, ignore) {
		return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
	};
}

// add getUnique to arrays
Array.prototype.getUnique = function(){
   var u = {}, a = [];
   for(var i = 0, l = this.length; i < l; ++i){
      if(u.hasOwnProperty(this[i])) {
         continue;
      }
      a.push(this[i]);
      u[this[i]] = 1;
   }
   return a;
};

function md5(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

function errorResponse(res, statusCode, body) {
	res.log('Error code ' + statusCode + ' : ' + body);
	res.writeHead(statusCode, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT, 'Access-Control-Allow-Origin': '*'});
	res.end(body);
}

function errorFileNotFound(res) {
	errorResponse(res, 404, 'file not found');
}

function errorMissingParameter(res) {
	errorResponse(res, 400, 'missing mandatory parameter');
}

function getHttpUrl(urlStr, success, error) {
	var parsedUrl = url.parse(urlStr);
	var options = {
		hostname: parsedUrl.hostname,
		port: parsedUrl.port,
		path: parsedUrl.path,
		method: 'GET',
	};

	var req = httpClient.request(options,function(res) {
		if (res.statusCode != 200) {		// TODO check whether redirect can be handled automatically by node
			error('Invalid http status ' + res.statusCode);
			return;
		}
		
		var fullData = '';
		res.on('data',function(data){
			fullData += data;
		});
		res.on('end',function(){
			success(fullData);
		});
	});
	
	req.on('error', function (e) { 
		error(e.message);
	});

	req.end();
}

function splitM3U8TagAttributes(attributes) {
	var result = [];
	while (attributes.length) {
		var commaPos = attributes.indexOf(',');
		var quotePos = attributes.indexOf('"');
		if (quotePos >= 0 && quotePos < commaPos) {
			var quoteEndPos = attributes.indexOf('"', quotePos + 1);
			commaPos = attributes.indexOf(',', quoteEndPos);
		}
		if (commaPos < 0) {
			result.push(attributes);
			break;
		}
		result.push(attributes.slice(0, commaPos));
		attributes = attributes.slice(commaPos + 1);
	}
	return result;
}

function parseM3U8TagAttributes(curLine) {
	var attributes = curLine.split(':', 2)[1];
	attributes = splitM3U8TagAttributes(attributes);
	var result = {};
	for (var i = 0; i < attributes.length; i++) {
		var splittedAtt = attributes[i].split('=', 2);
		if (splittedAtt.length > 1) {
			var value = splittedAtt[1].trim();
			if (value.startsWith('"') && value.endsWith('"'))
				value = value.slice(1, -1);
			result[splittedAtt[0]] = value;
		} else {
			result[splittedAtt[0]] = '';
		}
	}
	return result;
}

function startTrackerExclusive(trackerInfo) {
	memcache.add(trackerInfo.trackerOutputKey, '', 60, function (err) {
		if (err)
			return;		// someone else grabbed the lock
		console.log('Starting tracker on ' + trackerInfo.url);
		
		var encodedTrackerInfo = new Buffer(JSON.stringify(trackerInfo)).toString('base64');
		var signature = md5(SERVER_SECRET + encodedTrackerInfo);
		var params = querystring.stringify({params: encodedTrackerInfo, signature: signature });
		
		getHttpUrl(START_TRACKER_URL + START_TRACKER_URI + '?' + params, function (data) {
			console.log('Tracker request returned: ' + data);
		}, function (err) {
			console.log('Tracker request failed: ' + err);
		});
	});
}

function startTrackers(urlsToTrack) {
	var trackerOutputKeys = urlsToTrack.map(function (urlToTrack) { return urlToTrack.trackerOutputKey; });
	
	memcache.getMulti(trackerOutputKeys, function (err, data) {
		if (err)
			return;

		var shouldStartTrackers = false;
		for (var i = 0; i < urlsToTrack.length; i++) {
			var urlToTrack = urlsToTrack[i];
			if (!data[urlToTrack.trackerOutputKey])
				shouldStartTrackers = true;
		}

		if (!shouldStartTrackers)
			return;

		memcache.add(urlsToTrack[0].ffmpegParamsKey, '', 60, function (err) {
			for (var i = 0; i < urlsToTrack.length; i++) {
				var urlToTrack = urlsToTrack[i];
				if (!data[urlToTrack.trackerOutputKey])
					startTrackerExclusive(urlToTrack);
			}
		});
	});
}

function getUrlFromM3U8Line(curLine) {
	var curUrl = '';
	var curPrefix = '';
	var curSuffix = '';

	if (curLine.length && curLine[0] != '#')
	{
		curUrl = curLine;
	}
	else if (curLine.startsWith('#EXT-X-MEDIA'))
	{
		var uriStartPos = curLine.search('URI="');
		var uriEndPos = curLine.substring(uriStartPos + 5).search('"');
		if (uriStartPos >= 0 && uriEndPos >= 0)
		{
			uriStartPos += 5;
			uriEndPos += uriStartPos;
			curPrefix = curLine.substring(0, uriStartPos);
			curUrl = curLine.substring(uriStartPos, uriEndPos);
			curSuffix = curLine.substring(uriEndPos);
		}
	}
	
	return {url: curUrl, prefix: curPrefix, suffix: curSuffix};
}

function stitchMasterM3U8(masterUrl, manifest, baseParams) {
	var attributes = {};
	var split = manifest.split('\n');
	var result = '';
	var urlsToTrack = [];
	
	var protocol;
	if (masterUrl.startsWith('https://'))
		protocol = 'https://';
	else
		protocol = 'http://';

	for (var i = 0; i < split.length; i++) {
		var curLine = split[i].trim();
		var curUrl = getUrlFromM3U8Line(curLine);
		
		if (curUrl.url) {
			curUrl.url = url.resolve(masterUrl, curUrl.url);
			var trackerParams = {
				url: curUrl.url,
				trackerRequiredKey: 'required-' + baseParams.entryId,
				trackerOutputKey: 'trackerOutput-' + md5(curUrl.url + baseParams.entryId),
				adPositionsKey: 'adPos-' + baseParams.entryId,
				lastUsedSegmentKey: 'lastUsedSegment-' + baseParams.entryId,
				ffmpegParamsKey: 'ffmpegParams-' + baseParams.entryId,
				adSegmentRedirectUrl: SERVER_EXTERNAL_HTTP_URL + AD_SEGMENT_REDIRECT_URI,
				entryId: baseParams.entryId
			};
			if (attributes.BANDWIDTH)
				trackerParams.bitrate = attributes.BANDWIDTH;
			if (attributes.RESOLUTION) {
				var resolution = attributes.RESOLUTION.split('x');
				trackerParams.width = resolution[0];
				trackerParams.height = resolution[1];
			}
			
			urlsToTrack.push(trackerParams);
			
			var flavorStitchParams = {
				entryId: baseParams.entryId,
				masterUrl: masterUrl, 
				trackerRequiredKey: trackerParams.trackerRequiredKey,
				trackerOutputKey: trackerParams.trackerOutputKey,
				uid: baseParams.uid
			};
			
			result += curUrl.prefix + protocol + SERVER_EXTERNAL_URL + FLAVOR_STITCH_URI + '?' + querystring.stringify(flavorStitchParams) + curUrl.suffix + '\n';
			
			attributes = {};
			continue;
		}
		if (curLine.startsWith('#EXT-X-STREAM-INF:')) {
			attributes = parseM3U8TagAttributes(curLine);
		}
		
		result += curLine + '\n';
	}
	startTrackers(urlsToTrack);
	return result;
}

function simpleCache(key, expiry, calcFunc, callback) {
	memcache.get(key, function (err, data) {
		/*if (!err && data !== false) {				// TODO uncomment to enable caching
			console.log('returning from memcache');
			callback(data);
		} 
		else */{
			calcFunc(function (data) {
				console.log('saving to memcache');
				memcache.set(key, data, expiry, function (err) {});
				callback(data);
			});
		}
	});
}

function processMasterStitch(params, res) {
	if (!params.url || !params.entryId) {
		errorMissingParameter(res);
		return;
	}
	
	simpleCache(params.url, 60, 
		function (cb) {		// calcFunc
			getHttpUrl(params.url, function (urlData) {
				cb({statusCode:200, body:stitchMasterM3U8(params.url, urlData, {entryId: params.entryId, uid: params.uid})});
			}, function (err) {
				res.log('Error : ' + err);
				cb({statusCode:400, body:err});
			});
		},
		function (data) {	// callback
			res.writeHead(data.statusCode, {'Content-Type': CONTENT_TYPE_M3U8});
			res.end(data.body);
		} 
	);
}

var m3u8FileCounter = 1;

function logManifestToFile(res, manifestString) {
	var outputFileName = MANIFEST_PATH + (m3u8FileCounter % 10) + ".m3u8";
	fs.writeFile(outputFileName, manifestString, function(err) {
		if(err) {
			res.log(err);
		} else {
			res.log("Manifest saved to " + outputFileName);
		}
	}); 
	m3u8FileCounter++;
}

function doMemcacheMultiTouch(memcache, keys, curIndex, lifetime, callback) {
	if (curIndex >= keys.length) {
		callback(null);
		return;
	}
	
	memcache.touch(keys[curIndex], lifetime, function (err) {
		if (err)
			callback(err);
		else
			doMemcacheMultiTouch(memcache, keys, curIndex + 1, lifetime, callback);
	});
}

function memcacheMultiTouch(memcache, keys, lifetime, callback) {
	doMemcacheMultiTouch(memcache, keys, 0, lifetime, callback);
}

function prepareAdExclusive(encodingParams, adUrl, outputKey) {
	memcache.add(outputKey + '-lock', '', 60, function (err) {
		if (err)
			return;		// someone else grabbed the lock
			
		// start the ad preparation script
		var cmdLine = ['sh', PREPARE_AD_SCRIPT, adUrl, outputKey, encodingParams].join(' ');

		console.log('Executing: ' + cmdLine);

		var child = exec(cmdLine, function (error, stdout, stderr) { });
		child = null;
	});
}

function prepareAdFlavor(encodingParams, adUrl, adId) {
	var encodingParamsId = md5(encodingParams);
	var outputKey = 'ad-' + encodingParamsId + '-' + adId;
	
	memcachebin.get(outputKey + '-metadata', function (err, metadata) {
		if (err || !metadata) {
			prepareAdExclusive(encodingParams, adUrl, outputKey);
			return;
		}
		
		var requiredKeys = [outputKey + '-metadata', outputKey + '-header'];		
		var chunkCount = stitcher.getChunkCount(metadata);
		for (var i = 0; i < chunkCount; i++) {
			requiredKeys.push(outputKey + '-' + i);
		}
		
		memcacheMultiTouch(memcache, requiredKeys, 0, function (err) {
			if (err) {
				prepareAdExclusive(encodingParams, adUrl, outputKey);
			}
		});
	});
}

function prepareAdForEntry(adUrl, adId, entryId) {
	// XXXX TODO add lock
	memcache.get('ffmpegParams-' + entryId, function (err, data) {
		if (err) {
			// XXXX
		}
		
		if (!data)
			return;

		var ffmpegParams = data.split('\n').getUnique();
		for (var i = 0; i < ffmpegParams.length; i++) {
			if (!ffmpegParams[i])
				continue;

			prepareAdFlavor(ffmpegParams[i], adUrl, adId);
		}
	});
}

function prepareAdsForEntry(adsToPrepare) {
	for (var i = 0; i < adsToPrepare.length; i++) {
		var adToPrepare = adsToPrepare[i];
		prepareAdForEntry(adToPrepare.adUrl, adToPrepare.adId, adToPrepare.entryId);
	}
}

var adPoolUrls = [
	//31 seconds - Blistex
	'http://cdnapi.kaltura.com/p/437481/sp/43748100/playManifest/entryId/0_r0rsau9o/flavorId/0_mx13do2t/format/url/protocol/http/a.flv',

	//32 seconds - HomeAway.com
	'http://cdnapi.kaltura.com/p/777122/sp/77712200/playManifest/entryId/0_vriq23ct/flavorId/0_g0vnoj5i/format/url/protocol/http/a.mp4',

	//47 seconds - iPhone 4 Gizmodo
	//'http://cdnapi.kaltura.com/p/524241/sp/52424100/playManifest/entryId/0_mb7d3bcg/flavorId/0_xwolbf6p/format/url/protocol/http/a.mp4',

	//52 seconds - Google search
	//'http://cdnapi.kaltura.com/p/437481/sp/43748100/playManifest/entryId/0_0i5ymzed/flavorId/0_3japm9zh/format/url/protocol/http/a.webm',
];

function processIsWatched(params, res) {
	var trackerRequiredKey = 'required-' + params.entryId;
	
	memcache.get(trackerRequiredKey, function (err, data) {
		var result;
		var currentTime = Math.floor(new Date().getTime() / 1000);
		if (!data || currentTime - data > 20) {
			result = '0';
		} else {
			result = '1';
		}
		res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});
		res.end(result);
	});
}

function readTrackerOutput(res, trackerOutputKey, successCallback, errorCallback, attempts) {
	memcache.get(trackerOutputKey, function (err, data) {
		if (err) {
			errorCallback('error getting tracker output');
			return;
		}
		
		if (data) {
			successCallback(data);
			return;
		}
		
		if (attempts <= 0) {
			errorCallback('timed out waiting for tracker output');			
			return;
		}
		
		setTimeout(function () {
			readTrackerOutput(res, trackerOutputKey, successCallback, errorCallback, attempts - 1);
		}, 100);
	});
}

function allocateAdsForUser(res, entryId, uid, adPositions, allocatedAds, adsToPrepare, callback) {
	var newAllocatedAds = {};
	var adsCount = adPositions.length;
	// find which ads should be prepared
	for (var i = 0; i < adPositions.length; i++) {
		var adPosition = adPositions[i];
		if (allocatedAds[adPosition.cuePointId]) {
			// already allocated
			newAllocatedAds[adPosition.cuePointId] = allocatedAds[adPosition.cuePointId];
			adsCount--;
			if(adsCount == 0){
				return callback(newAllocatedAds);
			}
			continue;
		}
		
		res.log('requesting ad for user');
		
		
		//get user ip to stich ad by	
		var userAndIp = uid.split("_");
		var ip = userAndIp[1];
	
		// ad IP to vast url request
		var vastUrl;

		//ad IP to vast url request
		if(ip == '91.142.215.121')
			vastUrl = 'http://search.spotxchange.com/vast/2.0/96156?content_page_url=http://kalturatest.com&VPI=MP4&ip_addr=91.142.215.121';
		else
			vastUrl = 'http://search.spotxchange.com/vast/2.0/96157?content_page_url=http://kalturatest.com&VPI=MP4&ip_addr=46.20.235.45';
		
		// get via VAST	
		vastParser.getAdMediaFiles(res, vastUrl, adPositions[i].adSlotDuration*1000, function(adUrl, trackingInfo){
			if(adUrl){
				var adId = md5(adUrl);
				adsToPrepare.push({adUrl: adUrl, adId: adId, entryId: entryId});		
				newAllocatedAds[adPosition.cuePointId] = adId;		
				res.log('saving tracking info to memcache with key: ' + 'trackingInfo-' + adId + '-' + uid + ' value: ' + JSON.stringify(trackingInfo));	
				memcache.set('trackingInfo-' + adId + '-' + uid, trackingInfo, 600, function (err) {
					res.log('Failed to set tracking info in cache:' + err);
				});	
			}
			adsCount--;
			if(adsCount == 0){
				return callback(newAllocatedAds);
			}			
		});
	}
}

function processFlavorStitch(params, res) {
	if (!params.entryId || !params.trackerRequiredKey || !params.trackerOutputKey) {
		errorMissingParameter(res);
		return;
	}
	
	// read the tracker output
	res.log('getting tracker output');
	readTrackerOutput(res, params.trackerOutputKey, function (manifestString) {

		manifestString = manifestString.replaceAll(AD_SEGMENT_REDIRECT_URI + '?', AD_SEGMENT_REDIRECT_URI + '?uid=' + params.uid + '&');
	
		// parse the m3u8 and remove the DVR
		var manifest = parseFlavorM3U8('', manifestString);		// no need for the URL, will always be absolute here
		res.log('sequence is ' + manifest.headers['EXT-X-MEDIA-SEQUENCE']);
		disableDvr(manifest);
		
		// return the final manifest
		var finalManifest = buildFlavorM3U8(manifest);
		
		// XXXX remove unneeded headers
		var currentDate = new Date().toUTCString();
		res.writeHead(200, {
			//'Mime-Version': '1.0',
			'Content-Type': CONTENT_TYPE_M3U8,
			'Content-Length': finalManifest.length,
			/*'Pragma': 'no-cache',
			'Cache-Control': 'no-store',
			'Expires': currentDate,
			'Date': currentDate,
			'Connection': 'keep-alive',			// hangs python
			'Access-Control-Allow-Origin': '*',	*/
		});	
		
		res.end(finalManifest);
		logManifestToFile(res, finalManifest);			

		// update the segment offsets
		updateSegmentOffsets(manifest, 'segmentOffsets-' + params.uid);
	}, function (msg) {
		errorResponse(res, 400, msg);
		
		// reload the master URL and start any trackers that died
		getHttpUrl(params.masterUrl, function (urlData) {
			stitchMasterM3U8(params.masterUrl, urlData, {entryId: params.entryId});
		}, function (err) {});			
	}, 200);
		
	// mark the tracker as required
	var currentTime = Math.floor(new Date().getTime() / 1000);
	memcache.set(params.trackerRequiredKey, '' + currentTime, 600, function (err) {});

	// get ads allocated to the user
	var allocatedAdsKey = 'allocatedAds-' + params.uid;
	var adPositionsKey = 'adPos-' + params.entryId;
	memcache.get(adPositionsKey, function(err, data){
		console.log('got inserted ad:'+JSON.stringify(data));
		var adPositions = data;
		memcache.get(allocatedAdsKey, function(err, data){
			var allocatedAds = data;
			res.log('allocated ads ' + allocatedAds);
        	        if (allocatedAds)
	                        allocatedAds = JSON.parse(allocatedAds);
                	else
                        	allocatedAds = {};
			res.log('got ad positions ' + adPositions);
	                if (adPositions)
        	                adPositions = JSON.parse(adPositions);
                	else
                        	adPositions = {};
			var adsToPrepare = [];
	                allocateAdsForUser(res, params.entryId, params.uid, adPositions, allocatedAds, adsToPrepare, function(newAllocatedAds){
        	                memcache.set(allocatedAdsKey, JSON.stringify(newAllocatedAds), 3600, function (err) {});
                	        // prepare the ads
                        	prepareAdsForEntry(adsToPrepare);

                	});

		});
	});
}

function proxyMasterM3U8(masterUrl, manifest, uid) {
	var split = manifest.split('\n');
	var result = '';

	var protocol;
	if (masterUrl.startsWith('https://'))
		protocol = 'https://';
	else
		protocol = 'http://';
	
	for (var i = 0; i < split.length; i++) {
		var curLine = split[i].trim();
		var curUrl = getUrlFromM3U8Line(curLine);
		
		if (curUrl.url) {
			curUrl.url = url.resolve(masterUrl, curUrl.url);
			result += curUrl.prefix + protocol + SERVER_EXTERNAL_URL + FLAVOR_PROXY_URI + '?' + querystring.stringify({'uid': uid, 'url': curUrl.url}) + curUrl.suffix + '\n';
			continue;
		}

		result += curLine + '\n';
	}
	return result;
}

function processMasterProxy(params, res) {
	if (!params.url || !params.uid) {
		errorMissingParameter(res);
		return;
	}
	
	simpleCache(params.url, 60, 
		function (cb) {		// calcFunc
			getHttpUrl(params.url, function (urlData) {
				cb({statusCode:200, body:proxyMasterM3U8(params.url, urlData, params.uid)});
			}, function (err) {
				cb({statusCode:400, body:err});
			})
		},
		function (data) {	// callback
			res.writeHead(data.statusCode, {'Content-Type': CONTENT_TYPE_M3U8});
			res.end(data.body);
		} 
	);
}

function parseFlavorM3U8(manifestUrl, manifestContent){
	var manifest = {
		headers: {},
		segments: [],
		footers: {}
	};
	
	var segmentInfo = {};
	var lastSequenceNum = null;
	var m3u8Lines = manifestContent.split('\n');
	for(var i = 0; i < m3u8Lines.length; i++){
		var m3u8Line = m3u8Lines[i].trim();
		if(m3u8Line.length == 0)
			continue;
		
		if(m3u8Line[0] != '#'){
			if(lastSequenceNum == null)
				lastSequenceNum = manifest.headers['EXT-X-MEDIA-SEQUENCE'] * 1;
			
			segmentInfo.url = url.resolve(manifestUrl, m3u8Line);
			segmentInfo.sequence = lastSequenceNum;
			manifest.segments.push(segmentInfo);
			segmentInfo = {};
			lastSequenceNum += 1;
			continue;
		}
			
		var splittedLine = m3u8Line.substr(1).split(':', 2);
		if(splittedLine.length < 2)
			splittedLine.push('');

		var key = splittedLine[0];
		var value = splittedLine[1];
		
		switch(key){
			case 'EXT-X-ENDLIST':
				manifest.footers[key] = value;
				break;
				
			case 'EXTINF':
				value = value.split(',')[0];

				value = parseFloat(value);
				segmentInfo[key] = value;
				segmentInfo.duration = value;
				break;
				
			case 'EXT-X-DISCONTINUITY':
				value = value.split(',')[0];
				
				segmentInfo[key] = value;
				break;
			
			default:
				manifest.headers[key] = value;
		}
	}
		
	return manifest;
}


function buildFlavorM3U8(manifest) {
	var headers = manifest.headers;
	var segments = manifest.segments;
	var footers = manifest.footers;
	var result = '';
	
	for(var key in headers){
		var value = headers[key];
		result += "#" + key;
		if(value.length > 0)
			result += ":" + value;
		result += '\n';
	}
		
	for(var i = 0; i < segments.length; i++){
		var segment = segments[i];
		var segmentUrl = segment.url;
			
		result += '#EXTINF:' + segment.duration.toFixed(3) + ',\n';
		result += segmentUrl + '\n';
	}

	for(var key in footers){
		var value = footers[key];
		result += '#' + key;
		if(value.length > 0)
			result += ':' + value;
		result += '\n';
	}
	
	return result;
}

function disableDvr(manifest) {
	// leave only the last 3 segments
	manifest.segments = manifest.segments.slice(-NO_DVR_M3U8_TS_COUNT);

	// update the returned sequence number
	var initialSeqNum = manifest.segments[0].sequence;
	manifest.headers['EXT-X-MEDIA-SEQUENCE'] = '' + initialSeqNum;		
}

function updateSegmentOffsets(manifest, memcacheKey) {
	// build an array that maps sequence number to player time
	var initialSeqNum = manifest.segments[0].sequence;
	var segmentOffsets = {};
	var curOffset = 0;
	for (var i = 0; i < manifest.segments.length; i++) {
		var curSegment = manifest.segments[i];
		segmentOffsets[curSegment.sequence] = { offset: curOffset, duration: curSegment.duration };
		curOffset += curSegment.duration;
	}

	// get the previously saved offsets
	memcache.get(memcacheKey, function (err, previousOffsets) {
		if (previousOffsets) {
			// calculate how much we need to shift the segment offsets
			var offsetShift;
			if (previousOffsets[initialSeqNum]) {
				offsetShift = previousOffsets[initialSeqNum].offset;
			} else {
				var sortedSegmentIds = Object.keys(previousOffsets).sort();
				var referenceSegmentId = sortedSegmentIds[sortedSegmentIds.length - 1];
				offsetShift = previousOffsets[referenceSegmentId].offset + previousOffsets[referenceSegmentId].duration;
				previousOffsets = {};		// remove all previously known offsets
			}
			
			// shift the offset of the current segments
			var curSegmentId;
			for(curSegmentId in segmentOffsets) {
				segmentOffsets[curSegmentId].offset += offsetShift;
			}
			
			// merge the previous offsets to the current offsets
			for(curSegmentId in previousOffsets) {
				segmentOffsets[curSegmentId] = previousOffsets[curSegmentId];
			}
			
			// leave only the last NO_DVR_M3U8_TS_COUNT * 2 offsets
			var segmentIdsToRemove = Object.keys(segmentOffsets).sort();
			segmentIdsToRemove = segmentIdsToRemove.slice(0, -(NO_DVR_M3U8_TS_COUNT * 2));
			for(var i = 0; i < segmentIdsToRemove.length; i++) {
				delete segmentOffsets[segmentIdsToRemove[i]];
			}
		} else {
			console.log('failed to get previous offsets, initial seq num is ' + initialSeqNum + ' previous offsets are ');
			console.dir(previousOffsets);
		}
		
		// save to memcache
		console.log('setting ' + memcacheKey + ' to ');
		console.dir(segmentOffsets);
		memcache.set(memcacheKey, segmentOffsets, 86400, function (err) {});
	});
}

function translateTimeToSegmentId(segmentOffsets, currentTime) {
	var segmentId = undefined;
	for(var curSegmentId in segmentOffsets) {
		if (currentTime >= segmentOffsets[curSegmentId].offset && 
			currentTime < segmentOffsets[curSegmentId].offset + segmentOffsets[curSegmentId].duration) {
			segmentId = curSegmentId;
		}
	}
	if(typeof segmentId === 'undefined') {
		return undefined;
	}
	
	var result = {};
	result.segmentId = parseInt(segmentId);
	result.segmentOffset = currentTime - segmentOffsets[segmentId].offset;
	return result;
}

function getMaxSegmentDuration(segmentOffsets) {
	var result = 0;
	for(var curSegmentId in segmentOffsets) {
		if (segmentOffsets[curSegmentId].duration > result) {
			result = segmentOffsets[curSegmentId].duration;
		}
	}
	return result;
}

function processGetNextAdTime(queryParams, res) {
	var adPositionsKey = 'adPos-' + queryParams.entryId;
	var segmentOffsetsKey = 'segmentOffsets-' + queryParams.uid;

	memcache.getMulti([adPositionsKey, segmentOffsetsKey], function (err, data) {
		// get previous offsets and translate time
		var segmentOffsets = data[segmentOffsetsKey];
		if (!segmentOffsets) {
			errorResponse(res, 400, 'failed to get previous offsets from memcache');
			return;
		}
	
		var translatedTime = translateTimeToSegmentId(segmentOffsets, parseFloat(queryParams.currentTime));
		if (!translatedTime) {
			res.log('time=' + queryParams.currentTime + ' offsets=' + JSON.stringify(segmentOffsets));
			errorResponse(res, 400, 'failed to translate player time');
			return;
		}

		// parse ad positions
		var adPositions = data[adPositionsKey];
		if (adPositions) {
			adPositions = JSON.parse(adPositions);
		} else {
			adPositions = [];
		}
		
		// get the next ad
		var nextAd = undefined;
		for (var i = 0; i < adPositions.length; i++) {
			var adPosition = adPositions[i];
			
			if (adPosition.startSegmentId < translatedTime.segmentId || 
				(adPosition.startSegmentId == translatedTime.segmentId && adPosition.startSegmentOffset < translatedTime.segmentOffset)) {
				// ad already passed
				continue;
			}

			if (!nextAd || 
				adPosition.startSegmentId < nextAd.startSegmentId ||
				(adPosition.startSegmentId == nextAd.startSegmentId && adPosition.startSegmentOffset < nextAd.startSegmentOffset)) {
				// adPosition is earlier than nextAd
				nextAd = adPosition;
			}
		}
		
		if (!nextAd) {
			res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});
			res.end('{}');
			return;
		}
		
		// calculate time left
		res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});

		var timeForAd = nextAd.startSegmentOffset - translatedTime.segmentOffset;
		var message = 'Ad will show in ';
		if (segmentOffsets[nextAd.startSegmentId]) {			
			for (var curSegmentId = translatedTime.segmentId; curSegmentId < nextAd.startSegmentId; curSegmentId++) {
				timeForAd += segmentOffsets[curSegmentId].duration;
			}
			timeForAd = Math.round(timeForAd);
		} else {
			var maxSegmentDuration = getMaxSegmentDuration(segmentOffsets);
			timeForAd += (nextAd.startSegmentId - translatedTime.segmentId) * maxSegmentDuration;
			timeForAd = Math.round(timeForAd / 5) * 5;
			message += 'about ';		// not 100% accurate since we assume equal length segments
		}
		message += timeForAd + ' seconds';
		var result = {
			message: message, 
			adDuration: nextAd.adSlotDuration,
			cuePointId: nextAd.cuePointId,
		};
		result = JSON.stringify(result);
		res.log(result);
		res.end(result);
	});
}

function processFlavorProxy(queryParams, res) {
	if (!queryParams.url || !queryParams.uid) {
		errorMissingParameter(res);
		return;
	}
	
	getHttpUrl(queryParams.url, function (urlData) {
		var manifest = parseFlavorM3U8(queryParams.url, urlData);

		disableDvr(manifest);
		
		res.writeHead(200, {'Content-Type': CONTENT_TYPE_M3U8});
		res.end(buildFlavorM3U8(manifest));

		updateSegmentOffsets(manifest, 'segmentOffsets-' + queryParams.uid);

	}, function (err) {
		errorResponse(res, 400, 'failed to get original stream URL via HTTP');
	});
}

function doInsertAd(entryId, segmentId, segmentOffset, vastUrl, adSlotDuration, res) {
	res.log('inserting ad - segmentId=' + segmentId + ' segmentOffset=' + segmentOffset);	

	var adPositionsKey = 'adPos-' + entryId;
	var lastUsedSegmentKey = 'lastUsedSegment-' + entryId;

	memcache.getMulti([adPositionsKey, lastUsedSegmentKey], function (err, data) {
		res.log('last used segment is ' + data[lastUsedSegmentKey] + 'data:' + JSON.stringify(data));
		if (err) {
			errorResponse(res, 400, 'failed to get current ad positions');
			return;
		}
		
		if (data[lastUsedSegmentKey] && segmentId <= parseInt(data[lastUsedSegmentKey]) + 2) {
			errorResponse(res, 400, 'cannot place an ad that touches a segment that was already returned to the player');
			return;
		}
		
		var adPositions = data[adPositionsKey];
		
		if (adPositions) {
			adPositions = JSON.parse(adPositions);
			/*var lastAdEndSegmentId = adPositions[adPositions.length - 1].startSegmentId + 1;		// XXX TODO: ad may not be 1 segment
			if (segmentId <= lastAdEndSegmentId + 2) {
				errorResponse(res, 400, 'cannot place an ad that touches a segment that is a part of a previous ad');
				return;
			}*/
		} else {
			adPositions = [];			
		}
		
		var newAd = {
			cuePointId: entryId + segmentId,
			startSegmentId: segmentId,
			startSegmentOffset: segmentOffset,
			adSlotDuration: parseInt(adSlotDuration),			// get from parameter
			vastUrl: vastUrl,
		};
		
		adPositions.push(newAd);
		
		memcache.set(adPositionsKey, JSON.stringify(adPositions), 3600, function (err) {
			if (err) {
				errorResponse(res, 400, 'failed to write the ad position to memcache');
			} else {
				res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT, 'Access-Control-Allow-Origin': '*'});
				res.end('ad inserted');				
			}
		});
	});
}

function processInsertAd(params, res) {

	if (!params.entryId) {
		errorMissingParameter(res);
		return;
	}
	
	if (params.segmentId && params.segmentOffset) {
		var segmentId = parseInt(params.segmentId);
		var segmentOffset = parseFloat(params.segmentOffset);
		doInsertAd(params.entryId, segmentId, segmentOffset, params.vastUrl, params.adSlotDuration, res);
	} else if (params.currentTime && params.currentTime != '0' && params.uid) {
		memcache.get('segmentOffsets-' + params.uid, function (err, segmentOffsets) {
			if (err || !segmentOffsets) {
				errorResponse(res, 400, 'failed to get the segment offsets from memcache');
				return;
			}
			
			var translatedTime = translateTimeToSegmentId(segmentOffsets, parseFloat(params.currentTime));

			if (!translatedTime) {
				res.log('time=' + params.currentTime + ' offsets=' + JSON.stringify(segmentOffsets));
				errorResponse(res, 400, 'failed to translate player time to a segment id, reload the player');
				return;
			}
			
			doInsertAd(params.entryId, translatedTime.segmentId, translatedTime.segmentOffset, params.vastUrl, params.adSlotDuration, res);
		});
	} else {
		errorMissingParameter(res);
		return;
	}
}

function processStartTracker(queryParams, res) {
	if (queryParams.signature != md5(SERVER_SECRET + queryParams.params)) {
		errorResponse(res, 403, 'bad signature');
	}
	
	var cmdLine = ['sh', STREAM_TRACKER_SCRIPT, queryParams.params].join(' ');

	res.log('Executing: ' + cmdLine);
	
	var child = exec(cmdLine, function (error, stdout, stderr) { });
	child = null;
	
	res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});
	res.end('tracker started');
}

function processInsertAdPage(protocol, res) {
	fs.readFile(__dirname + '/insertAd.html', 'utf8', function (err, data) {
		if (err) {
			errorFileNotFound(res);
			return;
		}
		
		crypto.randomBytes(4, function(ex, buf) {
			var uid = buf.toString('hex');
			
            res.writeHead(200, {'Content-Type': CONTENT_TYPE_HTML});
            res.end(data.replaceAll('@UID@', uid).
            				replaceAll('@EXTERNAL_URL@', protocol + SERVER_EXTERNAL_URL).
        					replaceAll('@PROTOCOL@', protocol));
		});
	});
}

function processAdSegmentRedirect(queryParams, res) {
	// get allocated ads
	var allocatedAdsKey = 'allocatedAds-' + queryParams.uid;
	memcache.get(allocatedAdsKey, function (err, allocatedAds) {
		if (allocatedAds)
			allocatedAds = JSON.parse(allocatedAds);
		else
			allocatedAds = {};

		// get the id of the current ad
		var adId;
		if (allocatedAds[queryParams.cuePointId]) {
			adId = allocatedAds[queryParams.cuePointId];
		} else {
			adId = 'none';
		}

		var trackingId = 'trackingInfo-' + adId + '-' + queryParams.uid;
		vastParser.sendBeacon(res, trackingId, parseInt(queryParams.segmentIndex),parseInt(queryParams.outputStart), parseInt(queryParams.outputEnd), memcache);

		// update the query parameters
		delete queryParams.uid;
		queryParams.adId = adId;

		// redirect
		res.writeHead(302, {
			'Location': STITCH_SEGMENT_URI + '?' + querystring.stringify(queryParams)
		});
		res.end();
	});
}

function outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, res, tsDebugFile) {
	if (!curChunk) {
		// not much to do about this since we already returned the response headers
		res.log('failed to get chunk from memcache');
		res.end();
		fs.closeSync(tsDebugFile);
		return;
	}
	
	var processResult;
	do {
		processResult = stitcher.processChunk(
			outputLayout,
			curChunk,
			outputState);
				
		if (processResult.chunkOutputEnd > 0) {
			res.log('writing ' + processResult.chunkOutputStart + '..' + processResult.chunkOutputEnd);
			var curSlice = curChunk.slice(processResult.chunkOutputStart, processResult.chunkOutputEnd);
			res.write(curSlice);
			fs.writeSync(tsDebugFile, curSlice, 0, curSlice.length);
		}
		
		if (processResult.outputBuffer) {
			res.log('writing extra buffer of size ' + processResult.outputBuffer.length);
			res.write(processResult.outputBuffer);
			fs.writeSync(tsDebugFile, processResult.outputBuffer, 0, processResult.outputBuffer.length);
		}
		
		if (processResult.action == PBA_CLONE_CURRENT_CHUNK)
		{
			res.log('cloning chunk buffer');
			var chunkClone = new Buffer(curChunk.length);
			curChunk.copy(chunkClone);
			curChunk = chunkClone;
		}
	} while (processResult.action != PBA_GET_NEXT_CHUNK);
	
	curChunk = null;		// no longer need the chunk
	
	var chunkIndex = Math.floor(outputState.chunkStartOffset / FILE_CHUNK_SIZE);
	var videoKey;
	
	switch (outputState.chunkType) {
	case CHUNK_TYPE_PRE_AD:
		videoKey = preAdKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_AD:
		videoKey = adKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_BLACK:
		videoKey = blackKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_POST_AD:
		videoKey = postAdKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_TS_HEADER:
		videoKey = preAdKey + '-header';
		break;		
	default:
		res.log('request completed');
		fs.closeSync(tsDebugFile);
		res.end();
		return;
	}

	res.log('getting ' + videoKey);
	memcachebin.get(videoKey, function (err, curChunk) {
		outputState.chunkStartOffset = chunkIndex * FILE_CHUNK_SIZE;
		outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, res, tsDebugFile);
	});
}

var tsFileCounter = 1;

function processStitchSegment(queryParams, res) {
	var preAdKey =  'preAd-' + 	queryParams.streamHash +		'-' + queryParams.cuePointId;
	var adKey =     'ad-' + 	queryParams.encodingParamsId +	'-' + queryParams.adId;
	var blackKey =  'black-' + 	queryParams.encodingParamsId;
	var postAdKey = 'postAd-' + queryParams.streamHash +		'-' + queryParams.cuePointId;
	
	// XXX TODO use multiGet when we have a client that supports it on binary data
	//var keysToGet = [preAdKey, adKey, blackKey, postAdKey];
	//keysToGet = keysToGet.map(function (videoKey) { return videoKey + '-metadata'; });
	
	memcachebin.get(preAdKey + '-metadata', function (err, preAdMetadata) {
		memcachebin.get(adKey + '-metadata', function (err, adMetadata) {
			memcachebin.get(blackKey + '-metadata', function (err, blackMetadata) {
				memcachebin.get(postAdKey + '-metadata', function (err, postAdMetadata) {
								
					res.log('preAdKey ' + preAdKey);
					res.log('adKey ' + adKey);
					res.log('blackKey ' + blackKey);
					res.log('postAdKey ' + postAdKey);
					
					if (!preAdMetadata) {
						errorResponse(res, 400, 'failed to get pre ad segment from memcache ' + preAdKey);
						return;
					}

					if (!blackMetadata) {
						errorResponse(res, 400, 'failed to get black segment from memcache ' + blackKey);
						return;
					}

					var outputEnd = parseInt(queryParams.outputEnd);
					if (!postAdMetadata && outputEnd == 0) {
						errorResponse(res, 400, 'failed to get post ad segment from memcache ' + postAdKey);
						return;
					}
				
					if (adMetadata == null)
						res.log('adMetadata is null');
					else
						res.log('adMetadata length ' + adMetadata.length);

					// build the layout of the output TS
					var outputLayout = stitcher.buildLayout(
						preAdMetadata,
						postAdMetadata,
						[{
							adChunkType: CHUNK_TYPE_AD,
							ad: adMetadata,
							fillerChunkType: CHUNK_TYPE_BLACK,
							filler: blackMetadata,
							startPos: 0,
							endPos: 0, 
							alignment: ALIGN_LEFT
						}],
						parseInt(queryParams.segmentIndex),
						parseInt(queryParams.outputStart),
						parseInt(queryParams.outputEnd));
						
					// free the metadata buffers, we don't need them anymore
					preAdMetadata = null;
					adMetadata = null;
					blackMetadata = null;
					postAdMetadata = null;
					
					// output the TS
					res.writeHead(200, {'Content-Type': CONTENT_TYPE_MPEG2TS});
					
					var tsDebugFileName = TS_FILES_PATH + (tsFileCounter % 10) + '.ts';
					res.log('saving ts file to ' + tsDebugFileName);
					var tsDebugFile = fs.openSync(tsDebugFileName, 'w');
					tsFileCounter++;
					outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKey, blackKey, postAdKey, res, tsDebugFile);
				});
			});
		});
	});
}

var shortUrls = {};
var shortUrlCounter = 1;

function handleHttpRequest(req, res) {
	var sessionId = Math.floor(Math.random() * 0x7fffffff);
	res.setHeader('X-Kaltura-Session', sessionId);
	res.log = function (msg) {
		console.log(formatTime.getDateTime() + ' [' + sessionId + '] ' + msg);
	};
	res.dir = function (obj) {
		res.log(util.inspect(obj));
	};
	
	accessLog(req, res);
	
	var protocol = 'http://';
	if (req.headers['x-kaltura-f5-https'] == 'ON') {
		protocol = 'https://';
	}

	var parsedUrl = url.parse(req.url);
	var queryParams = querystring.parse(parsedUrl.query);
	
	res.log('handling request: ' + parsedUrl.pathname);
	res.dir(queryParams);
	
	switch (parsedUrl.pathname) {
	case MASTER_STITCH_URI:
		processMasterStitch(queryParams, res);
		break;
		
	case FLAVOR_STITCH_URI:
		processFlavorStitch(queryParams, res);
		break;
		
	case MASTER_PROXY_URI:
		processMasterProxy(queryParams, res);
		break;
		
	case FLAVOR_PROXY_URI:
		processFlavorProxy(queryParams, res);
		break;
		
	case INSERT_AD_URI:
		processInsertAd(queryParams, res);
		break;
		
	case START_TRACKER_URI:
		processStartTracker(queryParams, res);
		break;

	case AD_SEGMENT_REDIRECT_URI:
		processAdSegmentRedirect(queryParams, res);
		break;
	
	case STITCH_SEGMENT_URI:
		processStitchSegment(queryParams, res);
		break;
		
	case IS_WATCHED_URI:
		processIsWatched(queryParams, res);
		break;
		
	case GET_NEXT_AD_TIME_URI:
		processGetNextAdTime(queryParams, res);
		break;
		
	case SHORT_URL_URI:
		var shortUri = '/' + shortUrlCounter;
		shortUrls[shortUri] = queryParams;
		var pageIdIp_key = 'pageId-ip-' + shortUrlCounter;
		memcache.set(pageIdIp_key, queryParams.IP, 86400, function (err) {});
		shortUrlCounter++;
		res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});
		res.end(protocol + SERVER_EXTERNAL_URL + shortUri);		
		break;
		
	case NOTIFY_ERROR_URI:
		
		var cmdLine = "python " + __dirname + "/../utils/debug/debugStream.py '" + queryParams.url + "' " + PLAY_ERROR_LOG_PATH + "x.m3u8";

		res.log('Executing: ' + cmdLine);

		var child = exec(cmdLine, function (error, stdout, stderr) { });
		child = null;

		// fall through
		
	case NOTIFY_STATUS_URI:
	case NOTIFY_STATUS_ADMIN_URI:
		res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});
		res.end('logged');		
		break;
		
	case RESTART_SERVER_URI:
		res.writeHead(200, {'Content-Type': CONTENT_TYPE_PLAIN_TEXT});
		res.end('restarting');
		
		setTimeout(function () {
			spawn('bash', [__dirname + '/clear.sh']);
		}, 1000);
		break;
		
	case CROSS_DOMAIN_URI:
	case FAVICON_ICO_URI:
		fs.readFile(__dirname + parsedUrl.pathname, function (err, data) {
			if (err) {
				errorFileNotFound(res);
				return;
			}
			
			res.writeHead(200, {'Content-Type': parsedUrl.pathname == CROSS_DOMAIN_URI ? CONTENT_TYPE_XML : CONTENT_TYPE_ICON, 'Content-Length': data.length});
			res.end(data);
		});
		break;
		
	case '/':
		var hostName = req.headers.host;
		if (hostName && hostName.trim().toLowerCase() != SERVER_EXTERNAL_DOMAIN) {
			res.writeHead(302, {
				'Location': SERVER_EXTERNAL_HTTP_URL
			});
			res.end();
			break;
		}
		processInsertAdPage(protocol, res);
		break;
						
	default:
		if (shortUrls[parsedUrl.pathname]) {
			/*res.writeHead(302, {
				'Location': shortUrls[parsedUrl.pathname]
			});
			res.end();*/
			fs.readFile(__dirname + '/debugPlay.html', 'utf8', function (err, data) {
				if (err) {
					errorFileNotFound(res);
					return;
				}

				crypto.randomBytes(4, function(ex, buf) {
					var uid = buf.toString('hex');
							
					res.writeHead(200, {'Content-Type': CONTENT_TYPE_HTML});
					
					data = data.replaceAll('@UID@', uid + '_' + shortUrls[parsedUrl.pathname].IP).
								replaceAll('@EXTERNAL_URL@', protocol + SERVER_EXTERNAL_URL);
								
					for (var key in shortUrls[parsedUrl.pathname]) {
						var value = shortUrls[parsedUrl.pathname][key];
						data = data.replaceAll('@' + key + '@', value);
					}
					res.end(data);
				});
			});
			
			break;
		}
	
		errorFileNotFound(res);
		break;
	}
}

var mkdirIfNotExist = function (path) {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }
};

mkdirIfNotExist(PLAY_ERROR_LOG_PATH);
mkdirIfNotExist(MANIFEST_PATH);
mkdirIfNotExist(TS_FILES_PATH);

var memcachebin = new memcachedbin();

memcachebin.host = 'localhost';
memcachebin.port = 11211;

memcachebin.on('connect', function() {
	http.createServer(handleHttpRequest).listen(LOCAL_SERVER_PORT, '0.0.0.0');

	console.log('Server running at http://0.0.0.0:' + LOCAL_SERVER_PORT + '/');
});

memcachebin.connect();