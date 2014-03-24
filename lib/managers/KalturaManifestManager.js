
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

/**
 * @service manifest
 */
var KalturaManifestManager = function(){
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

/**
 * Cookie key to store player ad config to be applied on the ad URL
 * The config accepted from the master manifest URL and used later when requesting ads
 */
KalturaManifestManager.COOKIE_PLAYER_CONFIG = 'playerConfig';

/**
 * Trigger watching cue-points and rendition manifests for entry
 * 
 * @param entryId
 * @param manifestUrl
 * @param renditionsWatchParams
 */
KalturaManifestManager.prototype.startWatcherExclusive = function(entryId, manifestUrl, renditionsWatchParams) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + ']');
	
	var This = this;
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	KalturaCache.add(entryRequiredKey, ' ', 60, function(){
		KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] notify stream manager');
		
		for(var i = 0; i < renditionsWatchParams.length; i++){
			This.callPlayServerService('stream', 'watch', renditionsWatchParams[i]);
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
	var renditionsWatchParams = [];
	var lowestBitrate = null;

	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var renditionManifestUrl = url.resolve(manifestUrl, currentLine);

			var renditionWatchParams = {
				entryId: entryId,
				url: renditionManifestUrl,
				masterUrl: manifestUrl
			};
			
			if (attributes['BANDWIDTH'])
				renditionWatchParams.bitrate = parseInt(attributes['BANDWIDTH']);
			if (attributes['RESOLUTION']) {
				var resolution = attributes['RESOLUTION'].split('x');
				renditionWatchParams.width = resolution[0];
				renditionWatchParams.height = resolution[1];
			}
			
			if(lowestBitrate == null || lowestBitrate > renditionWatchParams.bitrate)
				lowestBitrate = renditionWatchParams.bitrate;
			
			renditionsWatchParams.push(renditionWatchParams);
			
			var renditionId = KalturaCache.getManifestId(renditionManifestUrl);
			var encodedMasterUrl = new Buffer(manifestUrl).toString('base64');
			var renditionStitchParams = {
				entryId: entryId,
				renditionId: renditionId,
				master: encodedMasterUrl
			};

			result += this.getPlayServerUrl('manifest', 'rendition', renditionStitchParams) + '\n';
			
			attributes = {};
			continue;
		}
		if (currentLine.startsWith('#EXT-X-STREAM-INF:')) {
			attributes = this.parseM3U8TagAttributes(currentLine);
		}
		
		result += currentLine + '\n';
	}

	for(var i = 0; i < renditionsWatchParams.length; i++){
		if(renditionsWatchParams[i].bitrate == lowestBitrate)
			renditionsWatchParams[i].lowestBitrate = true;
	}
	
	this.startWatcherExclusive(entryId, manifestUrl, renditionsWatchParams);
	
	return result;
};


/**
 * @param response
 * @param manifestUrl
 * @param entryId
 */
KalturaManifestManager.prototype.fetchMaster = function(response, manifestUrl, entryId){
	response.log('not found in cache');

	var This = this;
	this.getHttpUrl(manifestUrl, function (manifestContent) {

		if(!This.run){
			return;
		}

		response.log('stitching');			    
		var body = This.stitchMasterM3U8(entryId, manifestUrl, manifestContent);

		var manifestId = KalturaCache.getManifestId(manifestUrl);
		var manifestContentKey = KalturaCache.getManifestContent(manifestId);
		KalturaCache.add(manifestContentKey, body, 600, function(){
			response.log('Added to cache [' + manifestContentKey + ']');
		}, function (err) {
			response.error(err);
		});

		response.log('Returns body');
		response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		response.done(body);
	}, function (err) {
		response.error(err);
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
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}
	
	if(params.playerConfig){
		this.setCookie(response, KalturaManifestManager.COOKIE_PLAYER_CONFIG, params.playerConfig);
	}
	
	var manifestId = KalturaCache.getManifestId(params.url);
	var manifestContentKey = KalturaCache.getManifestContent(manifestId);
	response.log('Checking cache [' + manifestContentKey + ']');
	var This = this;
	KalturaCache.get(manifestContentKey, function(data){
		if(data){
			response.log('Returned from cache');
			response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
			response.done(data);

			var entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
			KalturaCache.touch(entryRequiredKey, 600);
		}
		else{
			This.fetchMaster(response, params.url, params.entryId);
		}
	}, function (err) {
		This.fetchMaster(response, params.url, params.entryId);
	});
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
	var encodingIds = null;
	var maxAge = 20  * 60 * 1000; // 20 minutes
	var playerConfig = this.getCookie(request, KalturaManifestManager.COOKIE_PLAYER_CONFIG);
	var headers = {
		'x-forwarded-for': request.ip
	};
	
	var stitchAd = function(cuePoint) {
		
		var sourceUrl = cuePoint.sourceUrl;
		// TODO - apply playerConfig on the sourceUrl

		var adId = KalturaCache.getAdId(sourceUrl);
		This.setCookie(response, cuePoint.id, adId, maxAge);

		for(var i = encodingIds; i < encodingIds; i++){

			if(!encodingIds[i].trim().length){
				continue;
			}
			
			var serverAdId = KalturaCache.getServerAdId(adId, encodingIds[i]);
			response.log('Server ad ID [' + serverAdId + ']');
		
			var adMediaKey = KalturaCache.getAdMedia(serverAdId);
			KalturaCache.touch(adMediaKey, function(){
				// key exists
				response.log('Server ad [' + serverAdId + '] already stitched');
			}, function(err){
				// key doesn't exist
				var adHandledKey = KalturaCache.getAdHandled(serverAdId);
				KalturaCache.add(adHandledKey, true, 60, function(){
					var params = {
						serverAdId: serverAdId,
						url: sourceUrl,
						headers: headers,
						encodingId: encodingIds[i]
					};
					This.callPlayServerService('ad', 'stitch', params);
				}, function (err) {
					response.log('Server ad [' + serverAdId + '] already handled');
				});
			});
		}
	};
	
	var cuePointsKey = KalturaCache.getCuePoints(entryId);
	var elapsedTimeKey = KalturaCache.getElapsedTime(entryId);
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	KalturaCache.getMulti([cuePointsKey, elapsedTimeKey, entryRequiredKey], function(data){
		var cuePoints = data[cuePointsKey];
		var elapsedTime = data[elapsedTimeKey];
		encodingIds = data[entryRequiredKey].unique();
		
		if(!cuePoints || !elapsedTime || !encodingIds){
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
				stitchAd(cuePoint);
			}
			else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
				stitchAd(cuePoint);
			}
		}
		callback();
	});
};


/**
 * Returns the rendition manifest from cache
 * 
 * @action rendition
 * 
 * @param renditionId
 * @param entryId
 */
KalturaManifestManager.prototype.getRenditionFromCache = function(response, entryId, renditionId, masterUrl){
	if(response.retries){
		response.retries++;
	}
	else{
		response.retries = 1;
	}
	if(response.retries >= 3){
		response.log('Not found in cache');
		this.errorFileNotFound(response);
	}
	
	var This = this;
	var manifestContentKey = KalturaCache.getManifestContent(params.renditionId);
	KalturaCache.get(manifestContentKey, function(data){
		if(data){
			This.stitchCuePoints(request, response, params.entryId, function(){
				response.log('Returned from cache');
				response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
				response.done(data);
			});
		}		
		else{
			
			// restarts master stitching
			var masterParams = {
				url: masterUrl,
				entryId: entryId
			};
			This.callPlayServerService('manifest', 'master', masterParams);
			
			// retry get from cache
			setTimeout(function(){
				This.getRenditionFromCache(response, entryId, renditionId);
			}, 3000);
		}
	});
};


/**
 * Returns the rendition manifest from cache
 * 
 * @action rendition
 * 
 * @param renditionId
 * @param entryId
 */
KalturaManifestManager.prototype.rendition = function(request, response, params){
	KalturaLogger.dir(params);
	if (!params.renditionId || !params.entryId || !params.master) {
		response.error('Missing arguments');
		this.errorMissingParameter(response);
		return;
	}

	var entryRequiredKey = KalturaCache.getEntryRequired(params.entryId);
	KalturaCache.touch(entryRequiredKey, 600);
	
	var masterUrl = new Buffer(params.master, 'base64').toString('ascii');
	this.getRenditionFromCache(response, params.entryId, params.renditionId, masterUrl);
};

module.exports.KalturaManifestManager = KalturaManifestManager;
