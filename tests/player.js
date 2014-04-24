var os = require('os');
var fs = require('fs');
var url = require('url');
var dns = require('dns');
var util = require('util');
var http = require('http');
var colors = require('colors');
var kalturaAdServer = require('kaltura-ad-server');

var id3Reader = require('../bin/TsId3Reader.node');

var kaltura = {
	client: require('../lib/client/KalturaClient')
};


colors.setTheme({
	warn: 'yellow',
	debug: 'blue',
	error: 'red'
});

console.err = console.error;
console.error = function(msg){
	console.err(msg.error);
};
console.warn = function(msg){
	console.err(msg.warn);
};
console.debug = function(msg){
	console.log(msg.debug);
};

var partnerId = null;
var adminSecret = null;
var entryId = null;
var serverHost = null;
var canStart = true;
var isCuePointsEnabled = null;
var vast;
var adServer;

if (typeof Array.prototype.diff != 'function') {
	Array.prototype.diff = function(arr) {
		var retArr = [];
		
		thisLoop: for (var k = 0; k < this.length; k++) {
		    for (var i = 0; i < arr.length; i++) {
		    	if(this[k] == arr[i]){
		    		continue thisLoop;
		    	}
		    }
		    retArr.push(this[k]);
		}
		return retArr;
	};
}

function getUniqueId(){
	return Math.floor(Math.random() * 10000000000000001).toString(36);
}

function printHelp() {
	console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' partner-id admin-secret entry-id');
	console.log('Options:');
	console.log('\t -h / --help - This help');
	console.log('\t -s / --server - Kaltura API hostname');

	process.exit(1);
}

function parseCommandLineOptions() {
	var argv = process.argv.slice(2);

	var option;
	while(argv.length) {
		option = argv.shift();
		if (option[0] != '-' && argv.length == 2) {
			partnerId = option;
			if (isNaN(partnerId)) {
				console.error('Partner ID must be numeric [' + partnerId + ']');
				printHelp();
			}
			partnerId = parseInt(partnerId);
		}

		if (option[0] != '-' && argv.length == 1) {
			adminSecret = option;
		}

		if (option[0] != '-' && argv.length == 0) {
			entryId = option;
			var entryRegex = /^[01]_[\w\d]{8}$/;
			if (!entryId.match(entryRegex)) {
				console.error('Entry ID in wrong format [' + entryId + ']');
				printHelp();
			}
		}

		if (option == '-h' || option == '--help') {
			printHelp();
		}

		if (option == '-s' || option == '--server') {
			if (!argv.length) {
				console.error('Please specify Kaltura API hostname');
				printHelp();
			}

			serverHost = argv.shift();
			console.log('Validating Kaltura API hostname [' + serverHost + ']');
			canStart = false;
			dns.lookup(serverHost, function(err, address, family) {
				if (err) {
					console.error('Invalid Kaltura API hostname [' + serverHost + ']: ' + err);
					printHelp();
				} else {
					console.log('Kaltura API hostname [' + serverHost + '] is valid');
					canStart = true;
					test();
				}
			});
		}
	}

	if (!partnerId || !adminSecret || !entryId) {
		printHelp();
	}
}

function ask(question, format, callback) {
	if (typeof format === 'function' && !callback) {
		callback = format;
		format = null;
	}

	var stdin = process.stdin, stdout = process.stdout;
	stdin.resume();
	stdout.write(question + ": ");

	stdin.once('data', function(data) {
		data = data.toString().trim();

		if (format && !format.test(data)) {
			stdout.write("It should match: " + format + "\n");
			ask(question, format, callback);
		} else {
			callback(data);
		}
	});
}

function getUserInputs(callback) {
	if (serverHost) {
		callback();
		return;
	}

	if (!serverHost) {
		var defaultServerHost = os.hostname();
		var question = 'Please specify Kaltura API hostname or leave empty to use "' + defaultServerHost + '"';
		ask(question, function(data) {
			if (data === '') {
				serverHost = defaultServerHost;
			} else {
				serverHost = data;
			}
			getUserInputs(callback);
		});
	}
}

var KalturaClientLogger = {
	log: function(str) {
		console.log(str);
	}
};

function initClient(callback) {
	console.log('Initializing client');
	var clientConfig = new kaltura.client.KalturaConfiguration(partnerId);

	clientConfig.serviceUrl = 'http://' + serverHost;
	clientConfig.clientTag = 'play-server-test-' + os.hostname();
	clientConfig.setLogger(KalturaClientLogger);

	var type = kaltura.client.enums.KalturaSessionType.ADMIN;
	var client = new kaltura.client.KalturaClient(clientConfig);
	
	if(typeof callback === 'function'){
    	client.session.start(function(ks) {
    		client.setKs(ks);
    		callback(client);
    	}, adminSecret, 'test', type, partnerId, 86400, 'disableentitlement');
	}
	else{
		client.setKs(callback);
		return client;
	}
}

function handlePlayManifest(client, manifestUrl, manifestContent) {
	var split = manifestContent.split('\n');
	
	console.log('Master: OK (' + split.length + ' lines)');

	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var playerClient = initClient(client.getKs());
			var renditionUrl = url.resolve(manifestUrl, currentLine);
			new Player(playerClient, renditionUrl);
		}
	}
}

function handleAdminPlayManifest(client, manifestUrl, manifestContent) {
	var split = manifestContent.split('\n');
	
	console.log('Master: OK (' + split.length + ' lines)');

	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var playerClient = initClient(client.getKs());
			var renditionUrl = url.resolve(manifestUrl, currentLine);
			new AdminPlayer(playerClient, renditionUrl);
			break;
		}
	}
}

function getUrl(httpUrl, callback) {
	http.get(httpUrl, function(response) {
		console.log('Request [' + httpUrl + '] response: ' + response.statusCode);
		console.log('Request [' + httpUrl + '] response headers: ' + util.inspect(response.headers));
		
		if(response.headers['x-kaltura']){
			process.exit(0);
		}
		
		if(response.statusCode == 302){
			var redirectUrl = response.headers.location.replace(/^\s+|\s+$/gm,'');
			return getUrl(redirectUrl, callback);
		}
		
		response.setEncoding('utf8');
		
		var data = '';
		response.on('data', function(chunk) {
			data += chunk;
		});
		response.on('end', function() {
			if(response.statusCode != 200){
				console.error('Request [' + httpUrl + '] error: ' + data);
				process.exit(1);
			}
			else if(callback){
				callback(httpUrl, data);
			}
		});
	}).on('error', function(e) {
		console.error('Request [' + httpUrl + '] error: ' + e.stack);
		process.exit(1);
	});
}

function handleEntry(client, entry) {
	if (entry.objectType && entry.objectType == 'KalturaAPIException') {
		console.error('liveStream.get: ' + entry.message);
		process.exit(1);
	}
	
	var playManifestUrl = 'http://' + serverHost + '/p/' + partnerId + '/playManifest/entryId/' + entryId + '/format/applehttp/usePlayServer/1';
	getUrl(playManifestUrl, function(playManifestUrl, data){
		handlePlayManifest(client, playManifestUrl, data);
	});
	
	// low latency manifest to simulate the big-red-buttom player
	playManifestUrl += '/usePlayServer/1';
	getUrl(playManifestUrl, function(playManifestUrl, data){
		handleAdminPlayManifest(client, playManifestUrl, data);
	});
}

function getEntry(client) {
	client.liveStream.get(function(entry){
		handleEntry(client, entry);
	}, entryId);
}

function test() {
	if (!canStart) {
		return;
	}

	initClient(getEntry);
}

function Player(client, renditionUrl){
	this.init(client, renditionUrl);
}
Player.prototype = {
	client: null,
	url: null,
	m3u8Lines: null,
	
	init: function(client, renditionUrl){
		console.log('New rendition player [' + renditionUrl + ']');
		this.client = client;
		this.url = renditionUrl;
		this.m3u8Lines = [];
		
		this.getManifest();
	},
	
	getManifest: function(){

		if(this.lastGoodManifest){
    		var d = new Date();
    		if(this.lastGoodManifest < (d.getTime() - 10000)){
    			console.log('Stream is dead');
    			return;
    		}
		}

		var This = this;
		
		//console.log('Rendition [' + this.url + '] request...');
    	http.get(this.url, function(response) {
    		if(response.statusCode != 200){
    			console.warn('Rendition [' + This.url + '] status code [' + response.statusCode + ']');

    			setTimeout(function(){
    				This.getManifest();
    			}, 2000);
    			return;
    		}
    		//console.log('Rendition [' + This.url + '] OK');
    		
    		response.setEncoding('utf8');
    		var manifestContent = '';
    		response.on('data', function(chunk) {
    			manifestContent += chunk;
    		});
    		response.on('end', function() {
				var m3u8Lines = manifestContent.split('\n');
				var newM3u8Lines = m3u8Lines.slice(0);
				if(This.m3u8Lines.length){
					newM3u8Lines = m3u8Lines.diff(This.m3u8Lines);
				}
    			if (newM3u8Lines.length) {
    				This.m3u8Lines = m3u8Lines;
    				for(var i = 0; i < This.m3u8Lines.length; i++){
    					if(This.m3u8Lines[i][0] === '#'){
    						delete This.m3u8Lines[i];
    					}
    				}
    				This.handleManifest(newM3u8Lines);
    			}
    			
    			var d = new Date();
    			This.lastGoodManifest = d.getTime();

    			setTimeout(function(){
    				This.getManifest();
    			}, 2000);
    		});
    	}).on('error', function(e) {
    		console.error('Rendition failed [' + This.url + ']:' + e.stack);
    		process.exit(1);
    	});
	},	
	
	validateCuePointsAlreadyEnabled: function(syncPoint){
		if(isCuePointsEnabled === 0){
			console.error('Sync-point [' + syncPoint.id + '] accepted when sync-points should be disabled');
		}
	},
	
	validateCuePointsStillEnabled: function(segment, segmentOffset){
		if(isCuePointsEnabled && this.elapsedTime && this.elapsedTime.sequence == segment.sequence && Math.abs(this.elapsedTime.offset - segmentOffset) > 1000){
			console.warn('large gap between sync offset [' + this.formaTime(segmentOffset) + '] and calculated offset [' + this.formaTime(this.elapsedTime.offset) + ']');
		}
	},	
	
	handleSyncPoint: function(syncPoint, segment){
		this.validateCuePointsAlreadyEnabled(syncPoint);
		
		var offsetInSegment = (syncPoint.pts - segment.pts) / 90;
		var absoluteOffset = syncPoint.offset;
		var segmentOffset = absoluteOffset - offsetInSegment;
		var segmentTimestamp = syncPoint.timestamp - offsetInSegment;
		
		this.validateCuePointsStillEnabled(segment, segmentOffset);
		
		this.elapsedTime = {
    		sequence: segment.sequence,
    		duration: segment.duration,
			offset: segmentOffset,
			timestamp: segmentTimestamp // in milliseconds since 1970
		};
	},
	
	
	verifySegment: function(localPath, segment, buffer){
		//console.log('Verify segment [' + localPath + ']');
		
		var parsed = id3Reader.parseBuffer(buffer);
		segment.pts = parsed.videoPts ? parsed.videoPts : parsed.audioPts;
		
		if(parsed.id3tags.length > 0){
			for(var i = 0; i < parsed.id3tags.length; i++){
				var id3tag = parsed.id3tags[i];
				if(id3tag.PTS && id3tag.TEXT && id3tag.TEXT.TEXT){
					var cuePoint = JSON.parse(id3tag.TEXT.TEXT);
					cuePoint.pts = id3tag.PTS;
					if(cuePoint.objectType && cuePoint.objectType == 'KalturaSyncPoint'){
						this.handleSyncPoint(cuePoint, segment);
					}
				}
			}
		}
		
		fs.unlink(localPath, function(err){
			if(err){
//				console.error('Delete file [' + localPath + ']:' + err);
			}
		});
	},
	
	
	testSegment: function(segment){
		var segmentUrl = segment.url;
//		console.log('Segment URL [' + segmentUrl + ']');

		var This = this;
		http.get(segmentUrl, function(response) {
    		if(response.statusCode != 200){
    			console.warn('Segment [' + segmentUrl + '] status code [' + response.statusCode + ']');
    			return;
    		}

    		var urlInfo = url.parse(segmentUrl);
    		var fileName = urlInfo.pathname.substr(urlInfo.pathname.lastIndexOf('/') + 1); 
			var localPath = os.tmpdir() + '/' + fileName;
			var localFile = fs.createWriteStream(localPath);
			response.pipe(localFile);
			
			var buffers = [];
			response.on('data', function(data) {
				buffers.push(data);
			});
			response.on('end', function() {
				This.verifySegment(localPath, segment, Buffer.concat(buffers));
			});
		}).on('error', function(e) {
			console.error('Segment failed [' + segmentUrl + ']:' + e.stack);
    		process.exit(1);
		});
	},
	
	handleManifest: function(m3u8Lines){
		// console.log('Rendition [' + this.url + '] OK');

		var segment;
		var sequence = 1;
		for (var i = 0; i < m3u8Lines.length; i++) {
			var m3u8Line = m3u8Lines[i].trim();
			if (m3u8Line.length == 0)
				continue;

			if (m3u8Line[0] == '#') {
				var parts = m3u8Line.split(':');
				switch(parts[0]){
					case '#EXTM3U':
					case '#EXT-X-VERSION':
					case '#EXT-X-ALLOW-CACHE':
					case '#EXT-X-TARGETDURATION':
						break;
						
					case '#EXT-X-MEDIA-SEQUENCE':
						sequence = parseInt(parts[1]);
						break;
						
					case '#EXTINF':
						var duration = parts[1];
						if(duration.substr(-1) == ',')
							duration = duration.trim(0, duration.length - 1);
		
						duration = parseFloat(duration) * 1000;
						
						segment = {
							sequence: sequence,
							duration: duration
						};

						if(this.elapsedTime && this.elapsedTime.sequence === (sequence - 1)){
							var segmentOffset = this.elapsedTime.offset + this.elapsedTime.duration;
							var segmentTimestamp = this.elapsedTime.timestamp + this.elapsedTime.duration;
							
							this.elapsedTime = {
    							sequence: sequence,
    							duration: duration,
    							offset: segmentOffset,
    							timestamp: segmentTimestamp
    						};
						}

						sequence++;
						break;
				}
			}
			else{
				segment.url = url.resolve(this.url, m3u8Line);
				this.testSegment(segment);
			}
		}
	},
	
	formaTime: function(offset){
		var millis = offset % 1000;
		offset = parseInt(offset / 1000);
		var sec = offset % 60;
		offset -= sec;
		offset /= 60;
		var format = (sec < 10 ? '0' : '') + sec + '.' + millis;
		if(offset > 0){
			var min = offset % 60;
			offset -= min;
			offset /= 60;
			format = (min < 10 ? '0' : '') + min + ':' + format;
		}
		if(offset > 0){
			var hour = offset % 60;
			offset -= hour;
			offset /= 60;
			format = (hour < 10 ? '0' : '') + hour + ':' + format;
		}

		return format;
	}
};

function AdminPlayer(client, renditionUrl){
	this.init(client, renditionUrl);
	this.isCuePointsEnabled = null;

	var This = this;

	// create pre-defined cue-point for now + 60 sec
	var callbacks = {
		get: function(params) {
			console.log('Ad VAST XML requested [' + params.id + ']');
			// TODO
		},
		getAsset: function(params) {
			console.log('Ad asset requested [' + params.id + ']');
			// TODO
		},
		getImpression: function(params) {
			console.log('Ad impression called [' + params.id + ']');
			// TODO
		},
		getTracking: function(params) {
			console.log('Ad tracking called [' + params.id + ']');
			// TODO
		},
		getVideoClick: function(params) {
			console.log('Ad video-click called [' + params.id + ']');
			// TODO
		}
	};
	var id = getUniqueId();
	var sourceUrl = adServer.address + '/vast/get?id=' + id;
	var duration = vast.register(id, callbacks);
	this.createDateCuePoint(sourceUrl, 60, duration);
	
	setTimeout(function(){
		This.enableCuePoints(150);
	}, 120000);
}
util.inherits(AdminPlayer, Player);

AdminPlayer.prototype.cuePointsDisabled = function(latency){
	console.log('Admin Cue-Points Disabled');
	this.isCuePointsEnabled--;
	setTimeout(function(){
		console.log('Cue-Points Disabled');
		isCuePointsEnabled--;
	}, latency * 1000);

	// create pre-defined cue-point for now + 60 sec
	var callbacks = {
		get: function(params) {
			console.log('Ad VAST XML requested [' + params.id + ']');
			// TODO
		},
		getAsset: function(params) {
			console.log('Ad asset requested [' + params.id + ']');
			// TODO
		},
		getImpression: function(params) {
			console.log('Ad impression called [' + params.id + ']');
			// TODO
		},
		getTracking: function(params) {
			console.log('Ad tracking called [' + params.id + ']');
			// TODO
		},
		getVideoClick: function(params) {
			console.log('Ad video-click called [' + params.id + ']');
			// TODO
		}
	};
	var id = getUniqueId();
	var sourceUrl = adServer.address + '/vast/get?id=' + id;
	var duration = vast.register(id, callbacks);
	this.createDateCuePoint(sourceUrl, 60, duration);
};

AdminPlayer.prototype.cuePointsEnabled = function(latency){
	console.log('Admin Cue-Points Enabled');
	this.isCuePointsEnabled++;
	setTimeout(function(){
		console.log('Cue-Points Enabled');
		isCuePointsEnabled++;
	}, latency * 1000);
};

AdminPlayer.prototype.enableCuePoints = function(duration){
	var This = this;
	this.client.liveStream.createPeriodicSyncPoints(function(err){
		if (err && err.objectType && err.objectType == 'KalturaAPIException') {
			console.error('liveStream.createPeriodicSyncPoints: ' + err.message);
			return;
		}

		var latency = 40;
		This.cuePointsEnabled(latency);
		setTimeout(function(){
			This.cuePointsDisabled(latency);
		}, duration * 1000);
	}, entryId, 30, duration);
};

AdminPlayer.prototype.createTimeCuePoint = function(sourceUrl, startTime, endTime, callback){
	var cuePoint = new kaltura.client.objects.KalturaAdCuePoint();
	cuePoint.sourceUrl = sourceUrl;
	cuePoint.startTime = startTime;
	cuePoint.endTime = endTime;
	
	this.createCuePoint(cuePoint, callback);
};

AdminPlayer.prototype.createDurationCuePoint = function(sourceUrl, startTime, duration, callback){
	var cuePoint = new kaltura.client.objects.KalturaAdCuePoint();
	cuePoint.sourceUrl = sourceUrl;
	cuePoint.startTime = startTime;
	cuePoint.duration = duration;
	
	this.createCuePoint(cuePoint, callback);
};

AdminPlayer.prototype.createDateCuePoint = function(sourceUrl, date, duration, callback){
	var cuePoint = new kaltura.client.objects.KalturaAdCuePoint();
	cuePoint.sourceUrl = sourceUrl;
	cuePoint.triggeredAt = date;
	cuePoint.duration = duration;
	
	var This = this;
	this.createCuePoint(cuePoint, function(cuePoint){
		if(callback){
			callback(cuePoint);
			
			var d = new Date();
			var timeout = (cuePoint.triggeredAt * 1000) - d.getTime() - 25000; // sync-points should start 30 seconds before triggeredAt
			var latency = 40;
			setTimeout(function(){
				This.cuePointsEnabled(latency);
			}, timeout);
			setTimeout(function(){
				This.cuePointsDisabled(latency);
			}, timeout + 10000);
		}
	});
};

AdminPlayer.prototype.createCuePoint = function(cuePoint, callback){
	cuePoint.entryId = entryId;
	this.client.cuePoint.add(function(cuePoint){
		if (cuePoint && cuePoint.objectType && cuePoint.objectType == 'KalturaAPIException') {
			console.error('cuePoint.add: ' + cuePoint.message);
			return;
		}
		
		console.log('Cue-Point [' + cuePoint.id + '] created');
		if(callback){
			callback(cuePoint);
		}
	}, cuePoint);
};

AdminPlayer.prototype.validateCuePointsAlreadyEnabled = function(syncPoint){
	if(this.isCuePointsEnabled === 0){
		console.error('Sync-point [' + syncPoint.id + '] accepted when sync-points should be disabled');
	}
};

AdminPlayer.prototype.validateCuePointsStillEnabled = function(segment, segmentOffset){
	if(this.isCuePointsEnabled && this.elapsedTime && this.elapsedTime.sequence == segment.sequence && Math.abs(this.elapsedTime.offset - segmentOffset) > 1000){
		console.error('large gap between sync offset [' + this.formaTime(segmentOffset) + '] and calculated offset [' + this.formaTime(this.elapsedTime.offset) + ']');
	}
};

AdminPlayer.prototype.handleSyncPoint = function(syncPoint, segment){
	Player.prototype.handleSyncPoint.apply(this, [syncPoint, segment]);
	

		if (this.createCuePoints) {
		var callbacks = {
			get: function(params) {
				console.log('Ad VAST XML requested [' + params.id + ']');
				// TODO
			},
			getAsset: function(params) {
				console.log('Ad asset requested [' + params.id + ']');
				// TODO
			},
			getImpression: function(params) {
				console.log('Ad impression called [' + params.id + ']');
				// TODO
			},
			getTracking: function(params) {
				console.log('Ad tracking called [' + params.id + ']');
				// TODO
			},
			getVideoClick: function(params) {
				console.log('Ad video-click called [' + params.id + ']');
				// TODO
			}
		};
		var id = getUniqueId();
		var sourceUrl = adServer.address + '/vast/get?id=' + id;
		var startTime = syncPoint.offset + 15000;
		var endTime = startTime + vast.register(id, callbacks);
		this.createTimeCuePoint(sourceUrl, startTime, endTime);
		console.log('Ad created [' + id + ']');
	}
};

parseCommandLineOptions();
getUserInputs(test);

var options = {
	host: '0.0.0.0',
	port: 8085,
	partnerId : partnerId,
	secret : adminSecret,
	userId : 'ad-server',
	expiry : null,
	privileges : null,
	serviceUrl: 'http://' + serverHost
};
adServer = kalturaAdServer.create(options);
vast = adServer.getProvider('vast');

vast.getOriginal				= vast.get;
vast.getOriginalAssetUrl		= vast.getAssetUrl;
vast.getOriginalImpressionUrl	= vast.getImpressionUrl;
vast.getOriginalTrackingUrl		= vast.getTrackingUrl;
vast.getOriginalVideoClickUrl	= vast.getVideoClickUrl;

vast.callbacks = {};

// register id for tracking
vast.register = function(id, callbacks){
	this.callbacks[id] = callbacks;
	
	var duration = 0;
	for (var entryId in this.entries) {
		duration += this.entries[entryId].duration;
	}
	
	return duration;
};

vast.get = function(request, response, params){
	if(params.id && this.callbacks[params.id] && this.callbacks[params.id].get){
		this.callbacks[params.id].get(params);
	}
	
	return this.getOriginal(request, response, params);
};

vast.urls = {};

vast.getUrl = function(response, params, callbackName){
	if(params.id && this.callbacks[params.id] && this.callbacks[params.id][callbackName]){
		var callback = this.callbacks[params.id][callbackName];
		callback(params);
	}

	if(params.urlId && this.urls[params.urlId]){
		response.writeHead(302, {
		  'Location': this.urls[params.urlId]
		});
		response.end('Redirected by player test.');
	}

	response.writeHead(404);
	response.end('Asset not found!');
};

vast.setUrl = function(originalUrl, identifier, callbackName){
	if(!params.id){
		return originalUrl;
	}
	
	var urlId = identifier + '-' + params.id;
	this.urls[urlId] = originalUrl;
	
	return this.adServer.address + '/vast/' + callbackName + '?id=' + params.id + '&urlId=' + urlId;
};

vast.getAsset = function(request, response, params){
	this.getUrl(response, params, 'getAsset');
};

vast.getAssetUrl = function(asset, params){
	var originalUrl = this.getOriginalAssetUrl(asset, params);
	return this.setUrl(originalUrl, 'asset', 'getAsset');
};

vast.getImpression = function(request, response, params){
	this.getUrl(response, params, 'getImpression');
};

vast.getImpressionUrl = function(entry, params){
	var originalUrl = this.getOriginalImpressionUrl(entry, params);
	return this.setUrl(originalUrl, 'impression', 'getImpression');
};

vast.getTracking = function(request, response, params){
	this.getUrl(response, params, 'getTracking');
};

vast.getTrackingUrl = function(entry, eventType, params){
	var originalUrl = this.getOriginalTrackingUrl(entry, eventType, params);
	return this.setUrl(originalUrl, 'tracking-' + eventType, 'getTracking');
};

vast.getVideoClick = function(request, response, params){
	this.getUrl(response, params, 'getVideoClick');
};

vast.getVideoClickUrl = function(entry, eventType, params){
	var originalUrl = this.getOriginalVideoClickUrl(entry, eventType, params);
	return this.setUrl(originalUrl, 'videoClick-' + eventType, 'getVideoClick');
};


