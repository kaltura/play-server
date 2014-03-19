
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service manifest
 */
var KalturaManifestManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

/**
 * Cookie key to store player ad config to be applied on the ad URL
 * The config accepted from the master manifest URL and used later when requesting ads
 */
KalturaManifestManager.COOKIE_PLAYER_CONFIG = 'playerConfig';

/**
 * Trigger watching cue-points and flavor manifests for entry
 * 
 * @param entryId
 * @param manifestUrl
 * @param flavorsWatchParams
 * @param renditionIds
 */
KalturaManifestManager.prototype.startWatcherExclusive = function(entryId, manifestUrl, flavorsWatchParams, renditionIds) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + ']');
	
	var This = this;
	var entryRequiredKey = this.cache.getEntryRequired(entryId);
	this.cache.add(entryRequiredKey, renditionIds, 60, function(){
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] notify stream manager');
		
		for(var i = 0; i < flavorsWatchParams.length; i++){
			This.callPlayServerService('stream', 'watch', flavorsWatchParams[i]);
		}
		
		var cuePointsParams = {
			entryId: entryId
		};			
		This.callPlayServerService('cuePoints', 'watch', cuePointsParams);
	}, function (err) {
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] watcher already exists');
	});
};

/**
 * @param attributes
 * @returns Array
 */
KalturaManifestManager.prototype.splitM3U8TagAttributes = function(attributes) {
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
};

/**
 * @param currentLine
 * @returns object
 */
KalturaManifestManager.prototype.parseM3U8TagAttributes = function(currentLine) {
	var attributes = currentLine.split(':', 2)[1];
	attributes = this.splitM3U8TagAttributes(attributes);
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
};

/**
 * @param entryId
 * @param manifestUrl
 * @param manifestContent
 * @returns string
 */
KalturaManifestManager.prototype.stitchMasterM3U8 = function(entryId, manifestUrl, manifestContent) {
	KalturaLogger.debug('Entry [' + entryId + '] manifest [' + manifestUrl + ']: ' + manifestContent);
	var attributes = {};
	var split = manifestContent.split('\n');
	var result = '';
	var flavorsWatchParams = [];
	var renditionIds = [];
	var lowestBitrate = null;

	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var flavorManifestUrl = url.resolve(manifestUrl, currentLine);
			var flavorWatchParams = {
				entryId: entryId,
				url: flavorManifestUrl,
				masterUrl: manifestUrl
			};
			
			if (attributes['BANDWIDTH'])
				flavorWatchParams.bitrate = parseInt(attributes['BANDWIDTH']);
			if (attributes['RESOLUTION']) {
				var resolution = attributes['RESOLUTION'].split('x');
				flavorWatchParams.width = resolution[0];
				flavorWatchParams.height = resolution[1];
			}
			var renditionId = (flavorWatchParams.bitrate + ':' + flavorWatchParams.width + 'X' + flavorWatchParams.height).md5();
			renditionIds.push(renditionId);
			
			if(lowestBitrate == null || lowestBitrate > flavorWatchParams.bitrate)
				lowestBitrate = flavorWatchParams.bitrate;
			
			flavorsWatchParams.push(flavorWatchParams);
			
			var flavorStitchParams = {
				entryId: entryId,
				manifestId: this.cache.getManifestId(flavorManifestUrl)
			};

			result += this.getPlayServerUrl('manifest', 'flavor', flavorStitchParams) + '\n';
			
			attributes = {};
			continue;
		}
		if (currentLine.startsWith('#EXT-X-STREAM-INF:')) {
			attributes = this.parseM3U8TagAttributes(currentLine);
		}
		
		result += currentLine + '\n';
	}

	for(var i = 0; i < flavorsWatchParams.length; i++){
		if(flavorsWatchParams[i].bitrate == lowestBitrate)
			flavorsWatchParams[i].lowestBitrate = true;
	}
	
	this.startWatcherExclusive(entryId, manifestUrl, flavorsWatchParams, renditionIds);
	
	return result;
};


/**
 * @param response
 * @param manifestUrl
 * @param entryId
 */
KalturaManifestManager.prototype.fetchMaster = function(response, manifestUrl, entryId){
	KalturaLogger.log('Request [' + response.requestId + '] not found in cache');

	var This = this;
	this.getHttpUrl(manifestUrl, function (manifestContent) {

		if(!This.run){
			return;
		}

		KalturaLogger.log('Request [' + response.requestId + '] Stitching');			    
		var body = This.stitchMasterM3U8(entryId, manifestUrl, manifestContent);

		var manifestId = This.cache.getManifestId(manifestUrl);
		var manifestContentKey = This.cache.getManifestContent(manifestId);
		This.cache.add(manifestContentKey, body, 600, function(){
			KalturaLogger.log('Request [' + response.requestId + '] Added to cache [' + manifestContentKey + ']');
		}, function (err) {
			KalturaLogger.error(err);
		});

		KalturaLogger.log('Request [' + response.requestId + '] Returns body');
		response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		response.end(body);
	}, function (err) {
		KalturaLogger.log('Request [' + response.requestId + ']: ' + err);
	    This.errorFileNotFound(response);
	});
};


/**
 * Returns the master manifest, from cache or from the cdn
 * 
 * @action manifest.master
 * 
 * @param url
 * @param entryId
 */
KalturaManifestManager.prototype.master = function(request, response, params){
	KalturaLogger.dir(params);
	if (!params.url || !params.entryId) {
		KalturaLogger.error('Request [' + response.requestId + '] missing arguments');
		this.errorMissingParameter(response);
		return;
	}
	
	if(params.playerConfig){
		this.setCookie(response, KalturaManifestManager.COOKIE_PLAYER_CONFIG, params.playerConfig);
	}
	
	var manifestId = this.cache.getManifestId(params.url);
	var manifestContentKey = this.cache.getManifestContent(manifestId);
	KalturaLogger.log('Request [' + response.requestId + '] Checking cache [' + manifestContentKey + ']');
	var This = this;
	this.cache.get(manifestContentKey, function(data){
		if(data){
			KalturaLogger.log('Request [' + response.requestId + '] returned from cache');
			response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
			response.end(data);

			var entryRequiredKey = This.cache.getEntryRequired(params.entryId);
			This.cache.touch(entryRequiredKey, 600);
		}
		else{
			This.fetchMaster(response, params.url, params.entryId);
		}
	}, function (err) {
		This.fetchMaster(response, params.url, params.entryId);
	});
};


/**
 * @param request
 * @returns string player ip address
 */
KalturaManifestManager.prototype.parseIp = function(request){
	if(request.headers['x-forwarded-for']){
		var forwardeds = request.headers['x-forwarded-for'].split(',');
		return forwardeds[0].trim();
	}
	
	return request.connection.remoteAddress || 
		request.socket.remoteAddress ||
		request.connection.socket.remoteAddress;
};

/**
 * Fetch cue-points from cache and trigger stitching with the player info
 * 
 * @param request used to extract the player ip and cookies
 * @param response used to set ad cookies
 * @param entryId
 * @param callback called after all needed ads triggered
 */
KalturaManifestManager.prototype.stitchCuePoints = function(request, response, entryId, callback){
	var This = this;
	var renditionIds = null;
	var maxAge = 20  * 60 * 1000; // 20 minutes
	var playerConfig = this.getCookie(request, KalturaManifestManager.COOKIE_PLAYER_CONFIG);
	var headers = {
		'x-forwarded-for': this.parseIp(request)
	};
	
	var stitchAd = function(cuePoint) {
		
		var sourceUrl = cuePoint.sourceUrl;
		// TODO - apply playerConfig on the sourceUrl

		for(var i = renditionIds; i < renditionIds; i++){

			var playerAdId = This.cache.getPlayerAdId(entryId, cuePoint.id, renditionIds[i]);
			var serverAdId = this.cache.getServerAdId(sourceUrl, renditionIds[i]);
			KalturaLogger.log('Server ad ID [' + serverAdId + ']');

			This.setCookie(response, playerAdId, serverAdId, maxAge);	
		
			var adMediaKey = this.cache.getAdMedia(serverAdId);
			this.cache.get(adMediaKey, function(data){
				if(data){
					KalturaLogger.log('Server ad [' + serverAdId + '] already stitched');
					return;
				}

				var adHandledKey = This.cache.getAdHandled(serverAdId);
				This.cache.add(adHandledKey, true, 60, function(){
					var params = {
						serverAdId: serverAdId,
						url: sourceUrl,
						headers: headers,
						renditionId: renditionIds[i]
					};
					This.callPlayServerService('ad', 'stitch', params);
				}, function (err) {
					KalturaLogger.log('Server ad [' + serverAdId + '] already handled');
				});
			});
		}
	};
	
	var cuePointsKey = this.cache.getCuePoints(entryId);
	var elapsedTimeKey = this.cache.getElapsedTime(entryId);
	var entryRequiredKey = This.cache.getEntryRequired(entryId);
	this.cache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey], function(data){
		var cuePoints = data[0];
		var elapsedTime = data[1];
		renditionIds = data[2];
		
		if(!cuePoints || !elapsedTime || !renditionIds){
			return;
		}
		
		var tenMinutes = 10 * 60 * 1000;
		
		var timeWindowStart = elapsedTime.timestamp - tenMinutes;
		var timeWindowEnd = elapsedTime.timestamp + tenMinutes;

		var offsetWindowStart = elapsedTime.offset - tenMinutes;
		var offsetWindowEnd = elapsedTime.offset + tenMinutes;

		for(var cuePointId in cuePoints){
			cuePoint = cuePoints[cuePointId];
			if(cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt && cuePoint.triggeredAt < timeWindowEnd){
				This.stitchAd(cuePoint);
			}
			else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
				This.stitchAd(cuePoint);
			}
		}
		callback();
	});
};


/**
 * Returns the flavor manifest from cache
 * 
 * @action flavor
 * 
 * @param manifestId
 * @param entryId
 */
KalturaManifestManager.prototype.flavor = function(request, response, params){
	KalturaLogger.dir(params);
	if (!params.manifestId || !params.entryId) {
		KalturaLogger.error('Request [' + response.requestId + '] missing arguments');
		this.errorMissingParameter(response);
		return;
	}

	var entryRequiredKey = this.cache.getEntryRequired(params.entryId);
	this.cache.touch(entryRequiredKey, 600);
	
	var This = this;
	var manifestContentKey = this.cache.getManifestContent(params.manifestId);
	this.cache.get(manifestContentKey, function(data){
		if(data){
			This.stitchCuePoints(request, response, params.entryId, function(){
				KalturaLogger.log('Request [' + response.requestId + '] returned from cache');
				response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
				response.end(data);
			});
		}		
		else{
			KalturaLogger.log('Request [' + response.requestId + '] not found in cache');
			This.errorFileNotFound(response);
		}
	});
};

module.exports.KalturaManifestManager = KalturaManifestManager;
