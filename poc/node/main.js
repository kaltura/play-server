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
var extend = require('util')._extend;
var memcached = require('memcached');
var memcachedbin = require('./memcachedbin');			// XXXXX TODO fix memcache library so that we won't need 2 instances
var crypto = require('crypto');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var fs = require('fs');

// parameters
const LOCAL_SERVER_PORT = 1337;
const SERVER_EXTERNAL_URL = 'http://lbd.kaltura.com:1337';
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

// URIs
const MASTER_STITCH_URI = '/masterstitch.m3u8';
const FLAVOR_STITCH_URI = '/flavorstitch.m3u8';
const MASTER_PROXY_URI = '/masterproxy.m3u8';
const FLAVOR_PROXY_URI = '/flavorproxy.m3u8';
const INSERT_AD_URI = '/insertAd.js'
const START_TRACKER_URI = '/startAdTracker.js';
const AD_SEGMENT_REDIRECT_URI = '/adRedirect.ts';
const STITCH_SEGMENT_URI = '/stitchSegment.ts';
const SHORT_URL_URI = '/shortUrl.js';
const NOTIFY_ERROR_URI = '/notifyError.js';
const NOTIFY_STATUS_URI = '/notifyStatus.js';
const RESTART_SERVER_URI = '/restartServer.js';
const FAVICON_ICO_URI = '/favicon.ico';

const AD_REQUEST_URL = 'http://dogusns-f.akamaihd.net/i/DOGUS_STAR/StarTV/Program/osesturkiye/suvedilara.mp4/segment1_0_av.ts?e=e933a313f6018d5d';

const PROXIED_M3U8_TS_COUNT = 3;

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
}

function md5(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

function errorResponse(res, statusCode, body) {
	res.log('Error code ' + statusCode + ' : ' + body);
	res.writeHead(statusCode, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
	res.end(body);
}

function errorFileNotFound(res) {
	errorResponse(res, 404, 'Not found!\n');
}

function errorMissingParameter(res) {
	errorResponse(res, 400, 'Missing parameter\n');
}

function getHttpUrl(urlStr, success, error) {
	parsedUrl = url.parse(urlStr)
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
		
		fullData = '';
		res.on('data',function(data){
			fullData += data;
		});
		res.on('end',function(){
			success(fullData)
		});
	});
	
	req.on('error', function (e) { 
		error(e.message)
	});

	req.end();
}

function splitM3U8TagAttributes(attributes) {
	var result = [];
	while (attributes.length) {
		commaPos = attributes.indexOf(',');
		quotePos = attributes.indexOf('"');
		if (quotePos >= 0 && quotePos < commaPos) {
			quoteEndPos = attributes.indexOf('"', quotePos + 1);
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
	memcache.add(trackerInfo['trackerOutputKey'], '', 60, function (err) {
		if (err)
			return;		// someone else grabbed the lock
		console.log('Starting tracker on ' + trackerInfo['url']);
		
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
	trackerOutputKeys = urlsToTrack.map(function (urlToTrack) { return urlToTrack['trackerOutputKey']; });
	
	memcache.getMulti(trackerOutputKeys, function (err, data) {
		if (err)
			return;

		var shouldStartTrackers = false;
		for (var i = 0; i < urlsToTrack.length; i++) {
			var urlToTrack = urlsToTrack[i];
			if (!data[urlToTrack['trackerOutputKey']])
				shouldStartTrackers = true;
		}

		if (!shouldStartTrackers)
			return;

		memcache.add(urlsToTrack[0].ffmpegParamsKey, '', 60, function (err) {
			for (var i = 0; i < urlsToTrack.length; i++) {
				var urlToTrack = urlsToTrack[i];
				if (!data[urlToTrack['trackerOutputKey']])
					startTrackerExclusive(urlToTrack);
			}
		});
	});
}

function stitchMasterM3U8(masterUrl, manifest, baseParams) {
	var attributes = {};
	var split = manifest.split('\n');
	var result = '';
	var urlsToTrack = [];

	for (var i = 0; i < split.length; i++) {
		var curLine = split[i].trim();

		if (curLine.length && curLine[0] != '#') {
			curLine = url.resolve(masterUrl, curLine);
			var trackerParams = {
				url: curLine,
				trackerRequiredKey: 'required-' + baseParams.entryId,
				trackerOutputKey: 'trackerOutput-' + md5(curLine + baseParams.entryId),
				adPositionsKey: 'adPos-' + baseParams.entryId,
				lastUsedSegmentKey: 'lastUsedSegment-' + baseParams.entryId,
				ffmpegParamsKey: 'ffmpegParams-' + baseParams.entryId,
				adSegmentRedirectUrl: SERVER_EXTERNAL_URL + AD_SEGMENT_REDIRECT_URI,
				entryId: baseParams.entryId
			};
			if (attributes['BANDWIDTH'])
				trackerParams['bitrate'] = attributes['BANDWIDTH'];
			if (attributes['RESOLUTION']) {
				var resolution = attributes['RESOLUTION'].split('x');
				trackerParams['width'] = resolution[0];
				trackerParams['height'] = resolution[1];
			}
			
			urlsToTrack.push(trackerParams);
			
			var flavorStitchParams = {
				entryId: baseParams.entryId,
				masterUrl: masterUrl, 
				trackerRequiredKey: trackerParams['trackerRequiredKey'],
				trackerOutputKey: trackerParams['trackerOutputKey']
			};
			
			result += SERVER_EXTERNAL_URL + FLAVOR_STITCH_URI + '?' + querystring.stringify(flavorStitchParams) + '\n';
			
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
				cb({statusCode:200, body:stitchMasterM3U8(params.url, urlData, {entryId: params.entryId})});
			}, function (err) {
				res.log('Error : ' + err);
				cb({statusCode:400, body:err});
			})
		},
		function (data) {	// callback
			res.writeHead(data.statusCode, {'Content-Type': 'application/vnd.apple.mpegurl'});
			res.end(data.body);
		} 
	);
}

var m3u8FileCounter = 1;

function readTrackerOutput(res, trackerOutputKey, masterUrl, entryId, responseHeaders, attempts) {
	memcache.get(trackerOutputKey, function (err, data) {
		if (err) {
			errorResponse(res, 400, 'error getting tracker output');
			return;
		}
		
		if (data) {
			res.writeHead(200, responseHeaders);
			res.end(data);

			// print the returned sequence number for debugging purposes
			var splittedData = data.split('\n');
			for (var i = 0; i < splittedData.length; i++) {
				if (splittedData[i].startsWith('#EXT-X-MEDIA-SEQUENCE')) {
					res.log('sequence is ' + splittedData[i]);
				}
			}

			// save the manifest to a file for debugging purposes
			var outputFileName = "/tmp/manifests/" + (m3u8FileCounter % 10) + ".m3u8";
			fs.writeFile(outputFileName, data, function(err) {
				if(err) {
					res.log(err);
				} else {
					res.log("Manifest saved to " + outputFileName);
				}
			}); 
			m3u8FileCounter++;
			
			return;
		}
		
		if (attempts <= 0) {
			errorResponse(res, 400, 'timed out waiting for tracker output');
			
			// reload the master url and start any trackers that died
			getHttpUrl(masterUrl, function (urlData) {
				stitchMasterM3U8(masterUrl, urlData, {entryId: entryId});
			}, function (err) {});
			
			return;
		}
		
		setTimeout(function () {
			readTrackerOutput(res, trackerOutputKey, masterUrl, entryId, responseHeaders, attempts - 1);
		}, 100);
	});
}

function parseCookies(request) {
    var list = {},
        rc = request.headers.cookie;

    rc && rc.split(';').forEach(function( cookie ) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = unescape(parts.join('='));
    });

    return list;
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

function processFlavorStitch(params, cookies, res) {
	if (!params.entryId || !params.trackerRequiredKey || !params.trackerOutputKey) {
		errorMissingParameter(res);
		return;
	}
	
	// XXX TODO - get the ads only after getting the m3u8 successfully or get the ad from a TS request
		
	// get ads allocated to the user
	var allocatedAdsCookieName = 'allocatedAds_' + params.entryId;
	var allocatedAds = cookies[allocatedAdsCookieName];
	res.log('allocated ads ' + allocatedAds);
	if (allocatedAds)
		allocatedAds = JSON.parse(allocatedAds);
	else
		allocatedAds = {};

	// get ad positions for the entry
	var adPositionsKey = 'adPos-' + params.entryId;
	res.log('getting ad positions');
	memcache.get(adPositionsKey, function (err, data) {
		res.log('got ad positions ' + data);
		if (err) {
			// XXXX
		}
		
		var adPositions = JSON.parse(data);
		var adsToPrepare = [];
		var newAllocatedAds = {};
		var i = 0;
		
		// find which ads should be prepared
		for (i = 0; i < adPositions.length; i++) {
			var adPosition = adPositions[i];
			if (!allocatedAds[adPosition.cuePointId]) {
				res.log('requesting ad for user');

				// XXXX TODO get via VAST
				var adUrl = adPoolUrls[Math.floor(Math.random()*adPoolUrls.length)];
				
				var adId = md5(adUrl);
				
				adsToPrepare.push({adUrl: adUrl, adId: adId, entryId: params.entryId});
				
				newAllocatedAds[adPosition.cuePointId] = adId;
			}
			else {
				newAllocatedAds[adPosition.cuePointId] = allocatedAds[adPosition.cuePointId];
			}
		}
		
		// update the allocated ads cookie and return the m3u8 to the client
		var responseHeaders = {
			'Content-Type': 'application/vnd.apple.mpegurl',
			'Set-Cookie': 	allocatedAdsCookieName + '=' + escape(JSON.stringify(newAllocatedAds))
		};
		
		res.log('reading tracker output');
		readTrackerOutput(res, params.trackerOutputKey, params.masterUrl, params.entryId, responseHeaders, 30);

		// mark the tracker as required
		memcache.set(params.trackerRequiredKey, '1', 600, function (err) {});
		
		// prepare the ads
		for (i = 0; i < adsToPrepare.length; i++) {
			var adToPrepare = adsToPrepare[i];
			prepareAdForEntry(adToPrepare.adUrl, adToPrepare.adId, adToPrepare.entryId);
		}
	});
}

function proxyMasterM3U8(masterUrl, manifest, uid) {
	var split = manifest.split('\n');
	var result = '';

	for (var i = 0; i < split.length; i++) {
		var curLine = split[i].trim();

		if (curLine.length && curLine[0] != '#') {
			curLine = url.resolve(masterUrl, curLine);
			result += SERVER_EXTERNAL_URL + FLAVOR_PROXY_URI + '?' + querystring.stringify({'uid': uid, 'url': curLine}) + '\n';
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
			res.writeHead(data.statusCode, {'Content-Type': 'application/vnd.apple.mpegurl'});
			res.end(data.body);
		} 
	);
}

function parseFlavorM3U8(masterUrl, manifestContent){
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
			
			segmentInfo.url = url.resolve(masterUrl, m3u8Line);
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
				if(value.substr(-1) == ',')
					value = value.trim(0, value.length - 1);

				value = parseFloat(value);
				segmentInfo[key] = parseFloat(value);
				segmentInfo.duration = value;
				break;
				
			case 'EXT-X-DISCONTINUITY':
				if(value.substr(-1) == ',')
					value = value.trim(0, value.length - 1);
				
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
	result = '';
	
	for(var key in headers){
		var value = headers[key];
		result += "#" + key;
		if(value.length > 0)
			result += ":" + value;
		result += '\n';
	}
		
	for(var i = 0; i < segments.length; i++){
		var segment = segments[i];
		segmentUrl = segment.url;
			
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

function processFlavorProxy(queryParams, res) {
	if (!queryParams.url || !queryParams.uid) {
		errorMissingParameter(res);
		return;
	}
	
	getHttpUrl(queryParams.url, function (urlData) {
		var manifest = parseFlavorM3U8(queryParams.url, urlData);

		// remove the DVR window since we don't want to allow the "red button" player to lag
		manifest.segments = manifest.segments.slice(-PROXIED_M3U8_TS_COUNT);
		
		var initialSeqNum = manifest.segments[0].sequence;
		manifest.headers['EXT-X-MEDIA-SEQUENCE'] = '' + initialSeqNum;		
		
		// build an array that maps sequence number to player time
		var segmentOffsets = {};
		var curOffset = 0;
		for (var i = 0; i < manifest.segments.length; i++) {
			var curSegment = manifest.segments[i];
			segmentOffsets[curSegment.sequence] = { offset: curOffset, duration: curSegment.duration };
			curOffset += curSegment.duration;
		}		
				
		res.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		res.end(buildFlavorM3U8(manifest));

		var segmentOffsetsKey = 'segmentOffsets-' + queryParams.uid;
		memcache.get(segmentOffsetsKey, function (err, previousOffsets) {
			if (previousOffsets && previousOffsets[initialSeqNum]) {
				// update the previous offsets with the new ones
				for(var curSegmentId in segmentOffsets) {
					if (!previousOffsets[curSegmentId]) {
						previousOffsets[curSegmentId] = segmentOffsets[curSegmentId];
						previousOffsets[curSegmentId].offset += previousOffsets[initialSeqNum].offset;
					}
				}
				
				// leave only the last PROXIED_M3U8_TS_COUNT * 2 offsets
				var segmentIdsToRemove = Object.keys(previousOffsets).sort();
				segmentIdsToRemove = segmentIdsToRemove.slice(0, -(PROXIED_M3U8_TS_COUNT * 2));
				for(var i = 0; i < segmentIdsToRemove.length; i++) {
					delete previousOffsets[segmentIdsToRemove[i]];
				}				
				segmentOffsets = previousOffsets;
			}
			else {
				console.log('failed to get previous offsets, initial seq num is ' + initialSeqNum + ' previous offsets are ');
				console.dir(previousOffsets);
			}
			console.log('setting segmentOffsets to ');
			console.dir(segmentOffsets);
			memcache.set(segmentOffsetsKey, segmentOffsets, 60, function (err) {});
		});

	}, function (err) {
		errorResponse(res, 400, 'Failed to get original URL');
	});
}

function doInsertAd(entryId, segmentId, segmentOffset, adSlotDuration, res) {
	res.log('inserting ad - segmentId=' + segmentId + ' segmentOffset=' + segmentOffset);	

	var adPositionsKey = 'adPos-' + entryId;
	var lastUsedSegmentKey = 'lastUsedSegment-' + entryId;

	memcache.getMulti([adPositionsKey, lastUsedSegmentKey], function (err, data) {
		res.log('last used segment is ' + data[lastUsedSegmentKey]);
		if (err) {
			errorResponse(res, 400, 'error getting current positions');
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
		};
		
		adPositions.push(newAd);
		
		memcache.set(adPositionsKey, JSON.stringify(adPositions), 3600, function (err) {
			if (err) {
				errorResponse(res, 400, 'failed to write to memcache');
			} else {
				res.writeHead(200, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
				res.end('ad inserted');				
			}
		});
	});
}

function processInsertAd(params, res) {

	console.dir(params);

	if (!params.entryId) {
		errorMissingParameter(res);
		return;
	}
	
	if (params.segmentId && params.segmentOffset) {
		var segmentId = parseInt(params.segmentId);
		var segmentOffset = parseFloat(params.segmentOffset);
		doInsertAd(params.entryId, segmentId, segmentOffset, params.adSlotDuration, res);
	} else if (params.currentTime && params.currentTime != '0' && params.uid) {
		memcache.get('segmentOffsets-' + params.uid, function (err, segmentOffsets) {
			if (err || !segmentOffsets) {
				errorResponse(res, 400, 'failed to get the segment offsets from memcache');
				return;
			}

			// find the segment id
			var currentTime = parseFloat(params.currentTime);
			var segmentId = undefined;
			for(var curSegmentId in segmentOffsets) {
				if (currentTime >= segmentOffsets[curSegmentId].offset && 
					currentTime < segmentOffsets[curSegmentId].offset + segmentOffsets[curSegmentId].duration) {
					segmentId = curSegmentId;
				}
			}
			if(typeof segmentId === 'undefined') {
				errorResponse(res, 400, 'failed to translate player time to a segment id');
				return;
			}
			segmentId = parseInt(segmentId);

			var segmentOffset = currentTime - segmentOffsets[segmentId].offset;

			doInsertAd(params.entryId, segmentId, segmentOffset, params.adSlotDuration, res);
			
		});
	} else {
		errorMissingParameter(res);
		return;
	}
}

function processStartTracker(queryParams, res) {
	if (queryParams.signature != md5(SERVER_SECRET + queryParams.params)) {
		errorResponse(res, 403, 'Forbidden\n');
	}
	
	var cmdLine = ['sh', STREAM_TRACKER_SCRIPT, queryParams.params].join(' ');

	res.log('Executing: ' + cmdLine);
	
	var child = exec(cmdLine, function (error, stdout, stderr) { });
	child = null;
	
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end('tracker started');
}

function processInsertAdPage(res) {
	fs.readFile(__dirname + '/insertAd.html', 'utf8', function (err, data) {
		if (err) {
			errorFileNotFound(res);
			return;
		}
		
		crypto.randomBytes(4, function(ex, buf) {
			var uid = buf.toString('hex');
			
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.end(data.replace(/@UID@/g, uid).replace(/@EXTERNAL_URL@/g, SERVER_EXTERNAL_URL));
		});
	});
}

function processAdSegmentRedirect(queryParams, cookies, res) {
	var allocatedAdsCookieName = 'allocatedAds_' + queryParams.entryId;		// XXX add to the params
	var allocatedAds = cookies[allocatedAdsCookieName];
	if (allocatedAds)
		allocatedAds = JSON.parse(allocatedAds);
	else
		allocatedAds = {};

	var adId;
	if (allocatedAds[queryParams.cuePointId]) {
		adId = allocatedAds[queryParams.cuePointId];
	} else {
		adId = 'none';
	}

	queryParams['adId'] = adId;

	res.writeHead(302, {
		'Location': STITCH_SEGMENT_URI + '?' + querystring.stringify(queryParams)
	});
	res.end();
}

function outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, res, tsDebugFile) {
	if (!curChunk) {
		// not much to do about this since we already returned the response headers
		res.log('failed to get chunk from memcache');
		res.end();
		fs.closeSync(tsDebugFile);
		return;
	}
	
	do {
		var processResult = stitcher.processChunk(
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
			chunkClone = new Buffer(curChunk.length);
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
					res.writeHead(200, {'Content-Type': 'video/MP2T'});
					
					var tsDebugFileName = '/tmp/tsFiles/' + (tsFileCounter % 10) + '.ts';
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
	res.setHeader('x-kaltura-session', sessionId);
	res.log = function (msg) {
		console.log(formatTime.getDateTime() + ' [' + sessionId + '] ' + msg);
	}
	accessLog(req, res);

	var parsedUrl = url.parse(req.url);
	var queryParams = querystring.parse(parsedUrl.query);
	
	//console.log(getDateTime() + ' request ' + parsedUrl.path);
	//console.dir(req.headers);
	
	switch (parsedUrl.pathname) {
	case MASTER_STITCH_URI:
		processMasterStitch(queryParams, res);
		break;
		
	case FLAVOR_STITCH_URI:
		processFlavorStitch(queryParams, parseCookies(req), res);
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
		processAdSegmentRedirect(queryParams, parseCookies(req), res);
		break;
	
	case STITCH_SEGMENT_URI:
		processStitchSegment(queryParams, res);
		break;
		
	case SHORT_URL_URI:
		var shortUri = '/' + shortUrlCounter;
		shortUrls[shortUri] = queryParams.url;
		shortUrlCounter++;
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end(SERVER_EXTERNAL_URL + shortUri);		
		break;
		
	case NOTIFY_ERROR_URI:
		
		var cmdLine = "python " + __dirname + "/../utils/debug/debugStream.py '" + queryParams.url + "' /tmp/playErrorLog/x.m3u8";

		res.log('Executing: ' + cmdLine);

		var child = exec(cmdLine, function (error, stdout, stderr) { });
		child = null;

		// fall through
		
	case NOTIFY_STATUS_URI:
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('logged');		
		break;
		
	case RESTART_SERVER_URI:
		res.writeHead(200, {'Content-Type': 'text/plain'});
		res.end('restarting');
		
		setTimeout(function () {
			spawn('bash', [__dirname + '/clear.sh']);
		}, 1000);
		break;
		
	case FAVICON_ICO_URI:
		fs.readFile(__dirname + '/favicon.ico', function (err, data) {
			if (err) {
				errorFileNotFound(res);
				return;
			}
			
			res.writeHead(200, {'Content-Type': 'image/x-icon'});
			res.end(data);
		});
		break;
		
	case '/':
		processInsertAdPage(res);
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
				
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end(data.replace(/@VIDEO_URL@/g, shortUrls[parsedUrl.pathname]).replace(/@EXTERNAL_URL@/g, SERVER_EXTERNAL_URL));
			});
			
			break;
		}
	
		errorFileNotFound(res);
		break;
	}
}

var memcachebin = new memcachedbin();

memcachebin.host = 'localhost';
memcachebin.port = 11211;

memcachebin.on('connect', function() {
	http.createServer(handleHttpRequest).listen(LOCAL_SERVER_PORT, '0.0.0.0');

	console.log('Server running at http://0.0.0.0:' + LOCAL_SERVER_PORT + '/');
});

memcachebin.connect();
