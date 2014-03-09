// TODO:
//	1. support single bitrate master manifest

/*

npm install memcached

*/

var stitcher = require('../../native/node_addons/TsStitcher/build/Release/TsStitcher');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var extend = require('util')._extend;
var memcached = require('memcached');
var memcachedbin = require('./memcachedbin');			// XXXXX TODO fix memcache library so that we won't need 2 instances
var crypto = require('crypto');
var exec = require('child_process').exec;
var fs = require('fs');

// parameters
const LOCAL_SERVER_PORT = 1337;
const SERVER_EXTERNAL_URL = 'http://lbd.kaltura.com:1337';
const START_TRACKER_URL = 'http://localhost:' + LOCAL_SERVER_PORT;
const MEMCACHE_URL = 'localhost:11211';

const STREAM_TRACKER_SCRIPT = __dirname + '/../tracker/streamTracker.sh';

const PREPARE_AD_SCRIPT = __dirname + '/../tracker/prepareAd.sh';

const SERVER_SECRET = 'Angry birds !!!';

// NOTE: the following constants must match stitcher.cc
const STATE_PRE_AD = 0;
const STATE_AD = 1;
const STATE_PAD = 2;
const STATE_POST_AD = 3;
const STATE_PRE_AD_HEADER = 4;
const STATE_AD_HEADER = 5;
const STATE_PAD_HEADER = 6;
const STATE_POST_AD_HEADER = 7;

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

const AD_REQUEST_URL = 'http://dogusns-f.akamaihd.net/i/DOGUS_STAR/StarTV/Program/osesturkiye/suvedilara.mp4/segment1_0_av.ts?e=e933a313f6018d5d';


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
	console.log('Error code ' + statusCode + ' : ' + body);
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

	var req = http.request(options,function(res) {
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

function stitchMasterM3U8(manifest, baseParams) {
	var attributes = {};
	var split = manifest.split('\n');
	var result = '';
	var urlsToTrack = [];

	for (var i = 0; i < split.length; i++) {
		var curLine = split[i].trim();

		if (curLine.length && curLine[0] != '#') {
			var trackerParams = {
				url: curLine,
				trackerRequiredKey: 'required-' + baseParams.entryId,
				trackerOutputKey: 'trackerOutput-' + md5(curLine),
				adPositionsKey: 'adPos-' + baseParams.entryId,
				lastUsedSegmentKey: 'lastUsedSegment-' + baseParams.entryId,
				ffmpegParamsKey: 'ffmpegParams-' + baseParams.entryId,
				adSegmentRedirectUrl: SERVER_EXTERNAL_URL + AD_SEGMENT_REDIRECT_URI,
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
				cb({statusCode:200, body:stitchMasterM3U8(urlData, {entryId: params.entryId})});
			}, function (err) {
				console.log('Error : ' + err);
				cb({statusCode:400, body:err});
			})
		},
		function (data) {	// callback
			res.writeHead(data.statusCode, {'Content-Type': 'application/vnd.apple.mpegurl'});
			res.end(data.body);
		} 
	);
}

function readTrackerOutput(res, trackerOutputKey, responseHeaders, attempts) {
	memcache.get(trackerOutputKey, function (err, data) {
		if (err) {
			errorResponse(res, 400, 'error getting tracker output');
			return;
		}
		
		if (data) {
			res.writeHead(200, responseHeaders);
			res.end(data);
			return;
		}
		
		if (attempts <= 0) {
			errorResponse(res, 400, 'timed out waiting for tracker output');
			return;
		}
		
		setTimeout(function () {
			readTrackerOutput(res, trackerOutputKey, responseHeaders, attempts - 1);
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

function processFlavorStitch(params, cookies, res) {
	if (!params.entryId || !params.trackerRequiredKey || !params.trackerOutputKey) {
		errorMissingParameter(res);
		return;
	}
		
	// get ads allocated to the user
	var allocatedAds = cookies.allocatedAds;
	console.log('allocated ads ' + allocatedAds);
	if (allocatedAds)
		allocatedAds = JSON.parse(allocatedAds);
	else
		allocatedAds = {};

	// get ad positions for the entry
	var adPositionsKey = 'adPos-' + params.entryId;
	memcache.get(adPositionsKey, function (err, data) {
		if (err) {
			// XXXX
		}
		
		var adPositions = JSON.parse(data);
		var adsToPrepare = [];
		var i = 0;
		
		// find which ads should be prepared
		for (i = 0; i < adPositions.length; i++) {
			var adPosition = adPositions[i];
			if (!allocatedAds[adPosition.cuePointId]) {
				console.log('requesting ad for user');

				// XXXX TODO get via VAST
				var adUrl = 'http://www.kaltura.com//content/clientlibs/python/TestCode/DemoVideo.flv';
				var adId = md5(adUrl);
				
				adsToPrepare.push({adUrl: adUrl, adId: adId, entryId: params.entryId});
				
				allocatedAds[adPosition.cuePointId] = adId;
			}
		}
		
		// update the allocated ads cookie and return the m3u8 to the client
		var responseHeaders = {
			'Content-Type': 'application/vnd.apple.mpegurl',
			'Set-Cookie': 	'allocatedAds=' + escape(JSON.stringify(allocatedAds))
		};
			
		readTrackerOutput(res, params.trackerOutputKey, responseHeaders, 30);

		// mark the tracker as required
		memcache.set(params.trackerRequiredKey, '1', 600, function (err) {});
		
		// prepare the ads
		for (i = 0; i < adsToPrepare.length; i++) {
			var adToPrepare = adsToPrepare[i];
			prepareAdForEntry(adToPrepare.adUrl, adToPrepare.adId, adToPrepare.entryId);
		}
	});
}

function proxyMasterM3U8(manifest, uid) {
	var split = manifest.split('\n');
	var result = '';

	for (var i = 0; i < split.length; i++) {
		var curLine = split[i].trim();

		if (curLine.length && curLine[0] != '#') {
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
				cb({statusCode:200, body:proxyMasterM3U8(urlData, params.uid)});
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

function processFlavorProxy(queryParams, res) {
	if (!queryParams.url || !queryParams.uid) {
		errorMissingParameter(res);
		return;
	}
	
	getHttpUrl(queryParams.url, function (urlData) {
		var initialSeqNum = null;
		var m3u8Lines = urlData.split('\n');
		
		for (var i = 0; i < m3u8Lines.length; i++) {
			if (m3u8Lines[i].startsWith('#EXT-X-MEDIA-SEQUENCE')) {
				var splittedLine = m3u8Lines[i].split(':');
				initialSeqNum = splittedLine[1];
			}
		}
		
		memcache.add('initialSeqNum-' + queryParams.uid, initialSeqNum, 10 * 3600, function (err) {});
		res.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		res.end(urlData);
	}, function (err) {
		errorResponse(res, 400, 'Failed to get original URL');
	});
}

function doInsertAd(entryId, segmentId, segmentOffset, adSlotDuration, res) {
	var adPositionsKey = 'adPos-' + entryId;
	var lastUsedSegmentKey = 'lastUsedSegment-' + entryId;

	memcache.getMulti([adPositionsKey, lastUsedSegmentKey], function (err, data) {
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
		memcache.get('initialSeqNum-' + params.uid, function (err, data) {
			if (err) {
				errorResponse(res, 400, 'error getting initial seq num from memcache');
				return;
			}
			var currentTime = parseFloat(params.currentTime);
			var segmentId = parseInt(data) + Math.floor(currentTime / 10);
			var segmentOffset = currentTime % 10;

			console.log('inserting ad - segmentId=' + segmentId + ' segmentOffset=' + segmentOffset);
			
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

	console.log('Executing: ' + cmdLine);
	
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
	var allocatedAds = cookies.allocatedAds;
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

function outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, res) {
	do {
		var processResult = stitcher.processChunk(
			outputLayout,
			curChunk,
			outputState);
				
		if (processResult.chunkOutputEnd > 0) {
			console.log('writing ' + processResult.chunkOutputStart + '..' + processResult.chunkOutputEnd);
			res.write(curChunk.slice(processResult.chunkOutputStart, processResult.chunkOutputEnd));
		}
	} while (!processResult.moreDataNeeded);
	
	curChunk = null;		// no longer need the chunk
	
	var chunkIndex = Math.floor(outputState.chunkStartOffset / FILE_CHUNK_SIZE);
	var videoKey;
	
	switch (outputState.chunkType) {
	case STATE_PRE_AD:
		videoKey = preAdKey + '-' + chunkIndex;
		break;
	case STATE_AD:
		videoKey = adKey + '-' + chunkIndex;
		break;
	case STATE_PAD:
		videoKey = blackKey + '-' + chunkIndex;
		break;
	case STATE_POST_AD:
		videoKey = postAdKey + '-' + chunkIndex;
		break;
	case STATE_PRE_AD_HEADER:
		videoKey = preAdKey + '-header';
		break;
	case STATE_AD_HEADER:
		videoKey = adKey + '-header';
		break;
	case STATE_PAD_HEADER:
		videoKey = blackKey + '-header';
		break;
	case STATE_POST_AD_HEADER:
		videoKey = postAdKey + '-header';
		break;
		
	default:
		console.log('request completed');
		res.end();
		return;
	}

	console.log('getting ' + videoKey);
	memcachebin.get(videoKey, function (err, curChunk) {
		outputState.chunkStartOffset = chunkIndex * FILE_CHUNK_SIZE;
		outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, res);
	});
}

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
				
					console.log('preAdKey ' + preAdKey);
					console.log('adKey ' + adKey);
					console.log('blackKey ' + blackKey);
					console.log('postAdKey ' + postAdKey);
					
					if (adMetadata == null)
						console.log('adMetadata is null');
					else
						console.log('adMetadata length ' + adMetadata.length);

					// build the layout of the output TS
					var outputLayout = stitcher.buildLayout(
						preAdMetadata,
						adMetadata,
						blackMetadata,
						postAdMetadata,
						parseInt(queryParams.outputStart),
						parseInt(queryParams.outputEnd));
						
					// free the metadata buffers, we don't need them anymore
					preAdMetadata = null;
					adMetadata = null;
					blackMetadata = null;
					postAdMetadata = null;
					
					// output the TS
					res.writeHead(200, {'Content-Type': 'video/MP2T'});
					outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKey, blackKey, postAdKey, res);
				});
			});
		});
	});
}

var shortUrls = {};
var shortUrlCounter = 1;

function handleHttpRequest(req, res) {
	var parsedUrl = url.parse(req.url);
	var queryParams = querystring.parse(parsedUrl.query);
	
	console.log('request ' + parsedUrl.path);
	console.dir(req.headers);
	
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
		
	case '/':
		processInsertAdPage(res);
		break;
				
	default:
		if (shortUrls[parsedUrl.pathname]) {
			res.writeHead(302, {
				'Location': shortUrls[parsedUrl.pathname]
			});
			res.end();
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
