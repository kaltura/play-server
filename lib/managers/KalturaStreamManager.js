
var url = require('url');

var KalturaStreamManager = function(){
	KalturaLogger.log('Initializing');
};

KalturaStreamManager.prototype = require('../KalturaManager');

KalturaStreamManager.prototype.MINIMUM_RUN_PERIOD = 60000;
KalturaStreamManager.prototype.RESULT_MANIFEST_EXPIRY = 30;
KalturaStreamManager.prototype.CYCLE_INTERVAL = 2000;

KalturaStreamManager.prototype.stitchMasterM3U8 = function(entryId, manifestUrl, manifestContent) {
	KalturaLogger.log('Entry [' + entryId + '] manifest [' + manifestUrl + ']');
	var attributes = {};
	var split = manifestContent.split('\n');
	var result = '';
	var flavorManifests = [];

	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var flavorManifestUrl = url.resolve(manifestUrl, currentLine);
			var manifestId = this.cache.getManifestId(flavorManifestUrl);
			var flavorManifestsParams = {
				entryId: entryId,
				url: flavorManifestUrl,
				masterUrl: manifestUrl,
				trackerOutputKey: this.cache.getManifestContent(manifestId),
//				ffmpegParamsKey: 'ffmpegParams-' + entryId, // TODO what is it?
			};
			
			if (attributes['BANDWIDTH'])
				flavorManifestsParams.bitrate = attributes['BANDWIDTH'];
			if (attributes['RESOLUTION']) {
				var resolution = attributes['RESOLUTION'].split('x');
				flavorManifestsParams.width = resolution[0];
				flavorManifestsParams.height = resolution[1];
			}
			
			flavorManifests.push(flavorManifestsParams);
			
			var flavorStitchParams = {
				entryId: entryId,
				manifestId: manifestId
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

	for(var i = 0; i < flavorManifests.length; i++){
		this.callRestorableAction('stream', 'watchFlavor', flavorManifests[i]);
	}
	
	return result;
};


KalturaStreamManager.prototype.splitM3U8TagAttributes = function(attributes) {
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

KalturaStreamManager.prototype.parseM3U8TagAttributes = function(currentLine) {
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

KalturaStreamManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params);
	if(!params)
		return;

	KalturaLogger.dir(params);
	if (!params.url || !params.entryId) {
		this.errorMissingParameter(response);
		return;
	}

	var This = this;
	this.getHttpUrl(params.url, function (manifestContent) {
		KalturaLogger.log('Request [' + response.requestId + '] Stitching');
	    
		var body = This.stitchMasterM3U8(params.entryId, params.url, manifestContent);

		var manifestId = This.cache.getManifestId(params.url);
		var manifestContentKey = This.cache.getManifestContent(manifestId);
		This.cache.add(manifestContentKey, body, This.RESULT_MANIFEST_EXPIRY, function (err) {
			if(err){
				KalturaLogger.error(err);
			}
			else{
				KalturaLogger.log('Request [' + response.requestId + '] Added to cache [' + manifestContentKey + ']');
			}
		});

		KalturaLogger.log('Request [' + response.requestId + '] Returns body');
		response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
		response.end(body);
	}, function (err) {
	    This.errorResponse(response, 404, err);
	});
};

KalturaStreamManager.prototype.parseM3U8 = function(manifestContent){
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
			
			segmentInfo['URL'] = m3u8Line;
			segmentInfo['SEQ'] = lastSequenceNum;
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
			case 'EXT-X-DISCONTINUITY':
				if(value.substr(-1) == ',')
					value = value.trim(0, value.length - 1);
				
				if(key == 'EXTINF')
					value = parseFloat(value);
				
				segmentInfo[key] = value;
				break;
			
			default:
				manifest.headers[key] = value;
		}
	}
		
	return manifest;
};

KalturaStreamManager.prototype.buildM3U8 = function(headers, segments, footers) {
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
		segmentUrl = segment['URL'];
		
//		TODO
//		if(segmentUrl == This.AD_URL_MARKER){
//			result += '#EXT-X-DISCONTINUITY\n';
//		}
		
		result += '#EXTINF:' + segment['EXTINF'] + '\n';
		
//		TODO
//		if(segmentUrl != This.AD_URL_MARKER){
			result += segmentUrl + '\n';
//		}
//		else{
//			result += adRequestUrl + '\n';
//			result += '#EXT-X-DISCONTINUITY\n';
//		}
	}

	for(var key in footers){
		var value = footers[key];
		result += '#' + key;
		if(value.length > 0)
			result += ':' + value;
		result += '\n';
	}
	
	return result;
};

KalturaStreamManager.prototype.watchFlavor = function(params, finishCallback){
	KalturaLogger.dir(params);

	params.manifestRequiredKey = this.cache.getManifestRequired(params.entryId);
	params.cuePointsKey = this.cache.getCuePoints(params.entryId);

	var firstTime = true;
	var startTime = new Date().getTime();
	var trackerRequired = false;
	var lastOutputSeqNum = null;

	var lastUsedSegmentKey = this.cache.getLastUsedSegment(params.masterUrl);
	var flavorManifestHandledKey = this.cache.getFlavorManifestHandled(params.url);
	var latency = 4; // TODO get from API

	var This = this;
	var getManifest = null;
	var handleManifest = function(manifestContent){
		var cycleStartTime = new Date().getTime();
		
		This.cache.get(params.manifestRequiredKey, function(err, data){
			if (err || data === false){
				trackerRequired = false;
			}
			else{
				trackerRequired = true;
			}
		});
		
		var manifest = This.parseM3U8(manifestContent);
		if(firstTime && manifest.segments.length > 0){
			This.downloadHttpUrl(manifest.segments[0]['URL'], null, function(localPath){
				// TODO 
//				var tsEncodingParams = ffmpegTSParams.getMpegTSEncodingParams(firstSegmentPath);
//				KalturaLogger.log('Encoding params [' + tsEncodingParams + ']');
//				This.cache.append(ffmpegParamsKey, tsEncodingParams + '\n', This.RESULT_MANIFEST_EXPIRY);
			}, function(err){
				KalturaLogger.error('Failed to fetch first segment: ' + err);
			});
		}
		
		// TODO fetch cue-points
		var cuePoints = [];

		var newResult = [];
		var buffer = [];
		var lastUsedSegment = null;
		var segmentsCount = manifest.segments.length - latency;
//		console.log('segmentsCount: ' + segmentsCount);
		for(var segmentIndex = 0; segmentIndex < segmentsCount; segmentIndex++){
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
//			console.log('push: ' + segmentIndex);
			if(buffer.length < 3)
				continue;

			while(buffer.length > 3)
				buffer.shift();

//			console.dir(buffer);
			// load buffer
			url1 = buffer[0]['URL'];
			url2 = buffer[1]['URL'];
			url3 = buffer[2]['URL'];
			seg1 = buffer[0]['SEQ'];
			seg2 = buffer[1]['SEQ'];
			
			// check whether seg1 is part of an ad sequence
			var partOfAd = false;
			
			for(var cuePointId in cuePoints){
				var cuePoint = cuePoints[cuePointId];
//				TODO
//				(adStartSeg, adStartOffset, adEndSeg, adEndOffset) = adPosition
//				if(seg1 >= adStartSeg - 1 and seg1 <= adEndSeg + 1)
//					partOfAd = True
//					break
			}
					
			// not part of ad -> just output it
			if(!partOfAd){
				lastUsedSegment = seg1;
//				console.log(buffer[0]['URL']);
				if(!parseInt(This.config.stream.useCdn)){
					buffer[0]['URL'] = url.resolve(params.masterUrl, buffer[0]['URL']);
				}
				newResult.push(buffer[0]);
				continue;
			}
				
			// check whether we already mapped this buffer
			if(urlTranslations[url2]){
				newResult.push(urlTranslations[url2]);
				continue;
			}
				
			if(seg2 == adStartSeg){
//				TODO
//				# ad starts here
//				segmentLength = buffer[0]['EXTINF'] + adStartOffset
//				
//				# get the pre-ad segment
//				tempClipFile = md5(url2) + '-1.ts'
//				tempClipPath = servedFilesPath + tempClipFile
//				cutTsFiles(tempClipPath, buffer, segmentLength, 'left')
//				
//				# add the required urls
//				tempClipUrl = servedFilesUrl + tempClipFile
//				urlTranslations[url2] = [{'URL' : tempClipUrl, 'EXTINF' : segmentLength,}]
//				newResult = newResult + urlTranslations[url2]
			}
			else if(seg2 == adEndSeg){
//				TODO
//				# ad ends here
//				seekOffset = buffer[0]['EXTINF'] + adEndOffset
//				
//				# get the post-ad segment
//				tempClipFile = md5(url2) + '-2.ts'
//				tempClipPath = servedFilesPath + tempClipFile
//				cutTsFiles(tempClipPath, buffer, seekOffset, 'right')
//				
//				# add the required urls
//				tempClipUrl = servedFilesUrl + tempClipFile
//				urlTranslations[url2] = [{'URL' : AD_URL_MARKER, 'EXTINF' : AD_DURATION,}]
//				urlTranslations[url3] = [{'URL' : tempClipUrl, 'EXTINF' : buffer[1]['EXTINF'] + buffer[2]['EXTINF'] - adEndOffset,}]
//				
//				# output only the ad in this iteration
//				newResult = newResult + urlTranslations[url2]
			}
		}
//		console.log('after for');
		
		// calculate the output sequence number
		var outputSeqNum = null;
		if(lastOutputSeqNum != null){
			for(var currentPosision = newResult.length - 1; currentPosision > newResult.length - 3 && currentPosision >= 0;  currentPosision--){
				var curUrl = newResult[currentPosision]['URL'];
				if(curUrl == lastOutputSeqNum['URL']){
					outputSeqNum = lastOutputSeqNum['SEQ'] - currentPosision;
					break;
				}
			}
		}

		if(outputSeqNum == null){
			outputSeqNum = manifest.headers['EXT-X-MEDIA-SEQUENCE'] * 1;
		}
		else{
			manifest.headers['EXT-X-MEDIA-SEQUENCE'] = outputSeqNum;
		}
		
		// remember the sequence number of the last non-ad URL for next time
		lastOutputSeqNum = null;
		for(var currentPosision = newResult.length - 1; currentPosision > newResult.length - 3 && currentPosision >= 0;  currentPosision--){
			var curUrl = newResult[currentPosision]['URL'];
			if(curUrl == This.AD_URL_MARKER)
				continue;
			
			lastOutputSeqNum = {
				URL: curUrl, 
				SEQ: outputSeqNum + currentPosision
			};
			break;
		}
			
		// build the final manifest
//		console.log('newResult: ' + newResult.length);
		var newManifestContent = This.buildM3U8(manifest.headers, newResult, manifest.footers);

		firstTime = false;
		// update the last used segment in memcache
		if(lastUsedSegment != null){
			// Note: there is a race here between the get & set, but it shouldn't be a problem since trackers
			//		working on the same entry will more or less synchronized, if they aren't it's a problem anyway...
			This.cache.get(lastUsedSegmentKey, function(err, data){
				if (err || data === false || lastUsedSegment > data){
					This.cache.set(lastUsedSegmentKey, lastUsedSegment, This.RESULT_MANIFEST_EXPIRY);
				}
			});
		}
			
		// save the result to memcache
		This.cache.add(params.trackerOutputKey, newManifestContent, This.RESULT_MANIFEST_EXPIRY, function (err) {
			if(err){
				This.cache.set(params.trackerOutputKey, newManifestContent, This.RESULT_MANIFEST_EXPIRY);
			}
		});
		
		// sleep until next cycle
		var curTime = new Date().getTime();
		var sleepTime = Math.max(0, cycleStartTime + This.CYCLE_INTERVAL - curTime);
		setTimeout(getManifest, sleepTime);
	};

	getManifest = function(){

		if(new Date().getTime() > (startTime + This.MINIMUM_RUN_PERIOD) && !trackerRequired){
			This.cache.del(flavorManifestHandledKey);
			KalturaLogger.log('Done');
			if(finishCallback && typeof finishCallback === 'function'){
				finishCallback();
			}
			return;
		}
		
		This.cache.touch(flavorManifestHandledKey, true, 10);
		
		This.getHttpUrl(params.url, handleManifest, function(err){
			KalturaLogger.error('Failed to fetch manifest: ' + err);
		});
	};

	if(params.restored){
		getManifest();
	}
	else{
		This.cache.get(flavorManifestHandledKey, function(err, data){
			if (err || data === false){
				getManifest();
				This.cache.add(flavorManifestHandledKey, true, 10);
			}
		});
	}
};

module.exports.init = function(config){
	var manager = new KalturaStreamManager();
	manager.init(config);
	return manager;
};
