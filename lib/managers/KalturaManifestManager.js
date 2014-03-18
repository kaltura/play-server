
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

var KalturaManifestManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

KalturaManifestManager.COOKIE_PLAYER_CONFIG = 'playerConfig';

KalturaManifestManager.prototype.startWatcherExclusive = function(entryId, manifestUrl, flavorsWatchParams, encodingParamsIds) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + ']');
	
	var This = this;
	var entryRequiredKey = this.cache.getEntryRequired(entryId);
	this.cache.add(entryRequiredKey, encodingParamsIds, 60, function(){
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

KalturaManifestManager.prototype.stitchAd = function(request, playerAdId, entryId, cuePoint) {
	var serverAdId = null; // TODO calculate the serverAdId
	
	var playerConfig = this.getCookie(request, KalturaManifestManager.COOKIE_PLAYER_CONFIG);
	var sourceUrl = cuePoint.sourceUrl;
	// TODO - apply playerConfig on the sourceUrl
	
	var headers = {
		'x-forwarded-for': this.parseIp(request)
	};
	
	KalturaLogger.log('Server ad ID [' + serverAdId + ']');
	
	var This = this;
	var adMediaKey = this.cache.getAdMedia(serverAdId);
	var entryRequiredKey = This.cache.getEntryRequired(entryId);
	this.cache.getMulti([adMediaKey, entryRequiredKey], function(data){
		if(data[0]){ // adMedia
			KalturaLogger.log('Server ad [' + serverAdId + '] already stitched');
			return;
		}

		if(!data[1]){ // entryRequired
			KalturaLogger.log('Entry [' + entryId + '] is not required anymore');
			return;
		}

		var adHandledKey = This.cache.getAdHandled(serverAdId);
		This.cache.add(adHandledKey, true, 60, function(){
			var encodingParamsIds = data[1];
			for(var i = encodingParamsIds; i < encodingParamsIds; i++){
				var params = {
					serverAdId: serverAdId,
					url: sourceUrl,
					headers: headers,
					encodingParamsId: encodingParamsIds[i]
				};
				This.callPlayServerService('ad', 'stitch', params);
			}
		}, function (err) {
			KalturaLogger.log('Server ad [' + serverAdId + '] already handled');
		});
	});
	
	return serverAdId;
};

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

KalturaManifestManager.prototype.stitchMasterM3U8 = function(entryId, manifestUrl, manifestContent) {
	KalturaLogger.debug('Entry [' + entryId + '] manifest [' + manifestUrl + ']: ' + manifestContent);
	var attributes = {};
	var split = manifestContent.split('\n');
	var result = '';
	var flavorsWatchParams = [];
	var encodingParamsIds = [];
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
			var encodingParamsId = (flavorWatchParams.bitrate + ':' + flavorWatchParams.width + 'X' + flavorWatchParams.height).md5();
			encodingParamsIds.push(encodingParamsId);
			
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
	
	this.startWatcherExclusive(entryId, manifestUrl, flavorsWatchParams, encodingParamsIds);
	
	return result;
};

KalturaManifestManager.prototype.fetchMaster = function(request, response, params){
	KalturaLogger.log('Request [' + response.requestId + '] not found in cache');

	var This = this;
	this.getHttpUrl(params.url, function (manifestContent) {

		if(!This.run){
			return;
		}

		KalturaLogger.log('Request [' + response.requestId + '] Stitching');			    
		var body = This.stitchMasterM3U8(params.entryId, params.url, manifestContent);

		var manifestId = This.cache.getManifestId(params.url);
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
			This.fetchMaster(request, response, params);
		}
	}, function (err) {
		This.fetchMaster(request, response, params);
	});
};

KalturaManifestManager.prototype.parseIp = function(request){
	if(request.headers['x-forwarded-for']){
		var forwardeds = request.headers['x-forwarded-for'].split(',');
		return forwardeds[0].trim();
	}
	
	return request.connection.remoteAddress || 
		request.socket.remoteAddress ||
		request.connection.socket.remoteAddress;
};

KalturaManifestManager.prototype.stitchCuePoints = function(request, entryId, callback){
	var This = this;
	var cuePointsKey = this.cache.getCuePoints(entryId);
	var elapsedTimeKey = this.cache.getElapsedTime(entryId);
	this.cache.getMulti([cuePointsKey, elapsedTimeKey], function(data){
		var cuePoints = data[0];
		var elapsedTime = data[1];
		
		if(!cuePoints || !elapsedTime){
			return;
		}
		
		var tenMinutes = 10 * 60 * 1000;
		
		var timeWindowStart = elapsedTime.timestamp - tenMinutes;
		var timeWindowEnd = elapsedTime.timestamp + tenMinutes;

		var offsetWindowStart = elapsedTime.offset - tenMinutes;
		var offsetWindowEnd = elapsedTime.offset + tenMinutes;

		var ads = {};
		for(var cuePointId in cuePoints){
			cuePoint = cuePoints[cuePointId];
			var playerAdId = This.cache.getPlayerAdId(entryId, cuePoint.id);
			if(cuePoint.triggeredAt && timeWindowStart < cuePoint.triggeredAt && cuePoint.triggeredAt < timeWindowEnd){
				ads[playerAdId] = This.stitchAd(request, playerAdId, entryId, cuePoint);
			}
			else if(cuePoint.startTime && offsetWindowStart < cuePoint.startTime && cuePoint.startTime < offsetWindowEnd){
				ads[playerAdId] = This.stitchAd(request, playerAdId, entryId, cuePoint);
			}
		}
		callback(ads);
	});
};

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
			This.stitchCuePoints(request, params.entryId, function(ads){
				var maxAge = 20  * 60 * 1000; // 20 minutes
				for(var playerAdId in ads){
					This.setCookie(response, playerAdId, ads[i], maxAge);	
				}
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
