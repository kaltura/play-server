
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

var KalturaStreamWatcher = function(manager, params, finishCallback){
	this.manager = manager;
	this.finishCallback = finishCallback;

	var manifestId = this.manager.cache.getManifestId(params.url);
	this.trackerOutputKey = this.manager.cache.getManifestContent(manifestId),
	this.entryRequiredKey = this.manager.cache.getEntryRequired(params.entryId);
	this.cuePointsKey = this.manager.cache.getCuePoints(params.entryId);
	this.elapsedTimeKey = this.manager.cache.getElapsedTime(params.entryId);
	this.encodingParamsId = (params.bitrate + ':' + params.width + 'X' + params.height).md5();
	this.cuePoints = {};
	this.segmentsHistoryLimit = 12;
	this.segmentsHistory = {};

	this.firstTime = true;
	this.startTime = new Date().getTime();
	this.trackerRequired = false;
	this.lastOutputSeqNum = null;

	this.lastUsedSegmentKey = this.manager.cache.getLastUsedSegment(params.masterUrl);
	this.flavorManifestHandledKey = this.manager.cache.getFlavorManifestHandled(params.url);
	this.latency = manager.config.stream.latency / 10; // assuming each segment is of 10 seconds
	
	this.url = params.url;
	this.lowestBitrate = params.lowestBitrate;
	this.entryId = params.entryId;
	this.masterUrl = params.masterUrl;

	if(params.restored){
		this.getManifest();
	}
	else{
		var This = this;
		this.manager.cache.get(this.flavorManifestHandledKey, function(data){
			if(!data){
				This.getManifest();
				This.manager.cache.set(This.flavorManifestHandledKey, true, 10);
			}
		});
	}
};
KalturaStreamWatcher.prototype = {
	MINIMUM_RUN_PERIOD: 60000,
	RESULT_MANIFEST_EXPIRY: 30,
	CYCLE_INTERVAL: 2000,

	manager: null,
	finishCallback: null,

	handleManifest: function(manifestContent){
		var This = this;
		var cycleStartTime = new Date().getTime();
		
		this.manager.cache.get(this.entryRequiredKey, function(data){
			if(data){
				This.trackerRequired = true;
			}
			else{
				This.trackerRequired = false;
			}
		});

		this.manager.cache.get(this.cuePointsKey, function(data){
			if(data){
				This.cuePoints = data;
			}
		});

		var manifest = this.parseM3U8(manifestContent);
		var lastSegmentSequest = null;
		if(manifest.segments.length > 0){
			for(var i = 0; i < manifest.segments.length; i++){
				if(this.firstTime || this.lowestBitrate){
					this.manager.downloadHttpUrl(manifest.segments[i].url, null, function(localPath){
						if(This.firstTime){
//							TODO 
//							var tsEncodingParams = ffmpegTSParams.getMpegTSEncodingParams(firstSegmentPath);
//							KalturaLogger.log('Encoding params [' + tsEncodingParams + ']');
//							this.manager.cache.append(ffmpegParamsKey, tsEncodingParams + '\n', this.RESULT_MANIFEST_EXPIRY);
						}
						
						if(This.lowestBitrate){
							This.parseSyncPoints(This.entryId, manifest.segments[i], localPath);
						}
					}, function(err){
						KalturaLogger.error('Failed to fetch first segment: ' + err);
					});
				}
				this.firstTime = false;
				lastSegmentSequest = manifest.segments[i].sequence;
				this.segmentsHistory[lastSegmentSequest] = manifest.segments[i];
			}
			
			for(var sequence in this.segmentsHistory){
				if(sequence < (lastSegmentSequest - this.segmentsHistoryLimit)){
					delete this.segmentsHistory[sequence];
				}
			}
		}

		this.manager.cache.get(this.elapsedTimeKey, function(elapsedTime){
			if(elapsedTime){
				var offset = elapsedTime.offset;
				for(var sequence in This.segmentsHistory){
					if(sequence >= elapsedTime.sequence){
						This.segmentsHistory[sequence].offset = offset;
						offset += (This.segmentsHistory[sequence].duration);
					}
				}
			}
		});
		
		
		var newResult = [];
		var buffer = [];
		var lastUsedSegment = null;
		var segmentsCount = manifest.segments.length - this.latency;
		for(var segmentIndex = 0; segmentIndex < segmentsCount; segmentIndex++){
			// hold a buffer of 3 segments
			buffer.push(manifest.segments[segmentIndex]);
			if(buffer.length < 3)
				continue;

			while(buffer.length > 3)
				buffer.shift();

			// load buffer
			url1 = buffer[0].url;
			url2 = buffer[1].url;
			url3 = buffer[2].url;
			seg1 = buffer[0].sequence;
			seg2 = buffer[1].sequence;
			offsetStart = buffer[0].offset;
			offsetEnd = buffer[2].offset + buffer[2].duration;
			
			// check whether seg1 is part of an ad sequence
			var partOfAd = false;
			
			var cuePoint = null;
			if(offset1 || offset2){
				for(var cuePointId in this.cuePoints){
					cuePoint = this.cuePoints[cuePointId];
					if(offsetStart <= cuePoint.startTime && cuePoint.endTime <= offsetEnd){
						partOfAd = true;
						break;
					}
				}
			}
					
			// not part of ad -> just output it
			if(!partOfAd){
				lastUsedSegment = seg1;
				if(!parseInt(this.manager.config.stream.useCdn)){
					buffer[0].url = url.resolve(this.masterUrl, buffer[0].url);
				}
				newResult.push(buffer[0]);
				continue;
			}
				
			// check whether we already mapped this buffer
			if(urlTranslations[url2]){
				newResult.push(urlTranslations[url2]);
				continue;
			}
				
			if(buffer[0].offset <= cuePoint.startTime && cuePoint.startTime < buffer[1].offset){
				// ad starts here
				var segmentLength = cuePoint.startTime - buffer[0].offset;

//				TODO
				// get the pre-ad segment
//				tempClipFile = md5(url2) + '-1.ts'
//				tempClipPath = servedFilesPath + tempClipFile
				var preSegmentId = this.manager.cache.getPreSegmentId(this.entryId, this.encodingParamsId);
				this.cutTsFile(buffer[0], segmentLength, preSegmentId);
				
				// add the required urls
//				tempClipUrl = servedFilesUrl + tempClipFile
				urlTranslations[url2] = [{'URL' : tempClipUrl, 'EXTINF' : segmentLength,}]
				newResult = newResult + urlTranslations[url2]
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
		if(this.lastOutputSeqNum != null){
			for(var currentPosision = newResult.length - 1; currentPosision > newResult.length - 3 && currentPosision >= 0;  currentPosision--){
				var curUrl = newResult[currentPosision].url;
				if(curUrl == this.lastOutputSeqNum.url){
					outputSeqNum = this.lastOutputSeqNum.sequence - currentPosision;
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
		this.lastOutputSeqNum = null;
		for(var currentPosision = newResult.length - 1; currentPosision > newResult.length - 3 && currentPosision >= 0;  currentPosision--){
			var curUrl = newResult[currentPosision].url;
			if(curUrl == this.AD_URL_MARKER)
				continue;
			
			this.lastOutputSeqNum = {
				URL: curUrl, 
				SEQ: outputSeqNum + currentPosision
			};
			break;
		}
			
		// build the final manifest
//		console.log('newResult: ' + newResult.length);
		var newManifestContent = this.buildM3U8(manifest.headers, newResult, manifest.footers);

		// update the last used segment in memcache
		if(lastUsedSegment != null){
			// Note: there is a race here between the get & set, but it shouldn't be a problem since trackers
			//		working on the same entry will more or less synchronized, if they aren't it's a problem anyway...
			this.manager.cache.get(this.lastUsedSegmentKey, function(data){
				if (data === false || lastUsedSegment > data){
					This.manager.cache.set(this.lastUsedSegmentKey, lastUsedSegment, this.RESULT_MANIFEST_EXPIRY);
				}
			}, function(err){
				This.manager.cache.set(this.lastUsedSegmentKey, lastUsedSegment, this.RESULT_MANIFEST_EXPIRY);
			});
		}
			
		// save the result to memcache
		this.manager.cache.add(this.trackerOutputKey, newManifestContent, this.RESULT_MANIFEST_EXPIRY, null, function (err) {
			This.manager.cache.set(This.trackerOutputKey, newManifestContent, This.RESULT_MANIFEST_EXPIRY);
		});
		
		// sleep until next cycle
		var curTime = new Date().getTime();
		var sleepTime = Math.max(0, cycleStartTime + this.CYCLE_INTERVAL - curTime);
		setTimeout(function(){
			This.getManifest();
		}, sleepTime);
	},

	getManifest: function(){

		if(new Date().getTime() > (this.startTime + this.MINIMUM_RUN_PERIOD) && !this.trackerRequired){
			this.manager.cache.del(this.flavorManifestHandledKey);
			KalturaLogger.log('Done');
			if(this.finishCallback && typeof this.finishCallback === 'function'){
				this.finishCallback();
			}
			return;
		}
		
		this.manager.cache.touch(this.flavorManifestHandledKey, true, 10);
		
		var This = this;
		this.manager.getHttpUrl(this.url, function(manifestContent){
			This.handleManifest(manifestContent);
		}, function(err){
			KalturaLogger.error('Failed to fetch manifest: ' + err);
		});
	},

	parseSyncPoints: function(entryId, segment, localPath){
		// TODO 
//		var elapsedTime = {
//			sequence: xxx, // TODO
//			offset: xxx // TODO
//		};
//		
//		this.manager.cache.set(this.elapsedTimeKey, elapsedTime, 600);
	},
	
	parseM3U8 : function(manifestContent){
		KalturaLogger.log(manifestContent);
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
				
				segmentInfo.url = m3u8Line;
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
					segmentInfo[key] = value;
					segmentInfo.duration = parseInt(value * 1000);
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
	},
	
	buildM3U8 : function(headers, segments, footers) {
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
			
	//		TODO
	//		if(segmentUrl == this.AD_URL_MARKER){
	//			result += '#EXT-X-DISCONTINUITY\n';
	//		}
			
			result += '#EXTINF:' + segment['EXTINF'] + '\n';
			
	//		TODO
	//		if(segmentUrl != this.AD_URL_MARKER){
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
	}
};

var KalturaStreamManager = function(config){
	if(config)
		this.init(config);
};
util.inherits(KalturaStreamManager, kaltura.KalturaManager);

KalturaStreamManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['url', 'entryId', 'masterUrl']);
	if(!params)
		return;
	
	KalturaLogger.dir(params);
	
	this.callRestorableAction('stream', 'watchFlavor', params);

	KalturaLogger.log('Request [' + response.requestId + '] handled');
	response.writeHead(200);
	response.end('OK');
};

KalturaStreamManager.prototype.watchFlavor = function(params, finishCallback){
	KalturaLogger.dir(params);

	params.latency = this.config.stream.latency / 10; // assuming each segment is of 10 seconds

	var streamWatcher = new KalturaStreamWatcher(this, params, finishCallback);
	// TODO add streamWatcher to array to be stopped when service stopped
};

module.exports.KalturaStreamManager = KalturaStreamManager;
