var os = require('os');
var fs = require('fs');
var url = require('url');
var dns = require('dns');
var util = require('util');
var http = require('http');
var adServer = require('kaltura-ad-server');

var id3Reader = require('../bin/TsId3Reader.node');

var kaltura = {
	client: require('../lib/client/KalturaClient')
};

var partnerId = null;
var adminSecret = null;
var entryId = null;
var serverHost = null;
var canStart = true;

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

function pushAd(client){
	
}

function cuePointsDisabled(players){
	console.log('Cue-Points Disabled');
	for(var i = 0; i < players.length; i++){
		players[i].isCuePointsEnabled = false;
	}
}

function cuePointsEnabled(client, players){
	console.log('Cue-Points Enabled');
	for(var i = 0; i < players.length; i++){
		players[i].isCuePointsEnabled = true;
	}

	pushAd(client);
}

function enableCuePoints(client, players){
	var duration = 150;
	client.liveStream.createPeriodicSyncPoints(function(err){
		if (err && err.objectType && err.objectType == 'KalturaAPIException') {
			console.error('liveStream.createPeriodicSyncPoints: ' + err.message);
		}

		cuePointsEnabled(client, players);
		setTimeout(function(){
			cuePointsDisabled(players);
		}, duration * 1000);
	}, entryId, 30, duration);
}

function handlePlayManifest(client, manifestUrl, manifestContent) {
	var split = manifestContent.split('\n');
	
	console.log('Master: OK (' + split.length + ' lines)');

	var players = [];
	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			var playerClient = initClient(client.getKs());
			var renditionUrl = url.resolve(manifestUrl, currentLine);
			players.push(new player(playerClient, renditionUrl));
		}
	}
	
	setTimeout(function(){
		enableCuePoints(client, players);
	}, 15000);
}

function getUrl(httpUrl, callback) {
	http.get(httpUrl, function(response) {
		console.log('Request [' + httpUrl + '] response: ' + response.statusCode);
		console.log('Request [' + httpUrl + '] response headers: ' + util.inspect(response.headers));
		
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
	}

	var playManifestUrl = 'http://' + serverHost + '/p/' + partnerId + '/playManifest/entryId/' + entryId + '/format/applehttp';
	getUrl(playManifestUrl, function(playManifestUrl, data){
		handlePlayManifest(client, playManifestUrl, data);
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

function player(client, renditionUrl){
	console.log('New rendition player [' + renditionUrl + ']');
	this.client = client;
	this.url = renditionUrl;
	this.m3u8Lines = [];
	this.isCuePointsEnabled = null;
	
	this.getManifest();
}
player.prototype = {
	client: null,
	url: null,
	m3u8Lines: null,
	isCuePointsEnabled: false,
	
	getManifest: function(){
		var This = this;
		//console.log('Rendition [' + this.url + '] request...');
    	http.get(this.url, function(response) {
    		if(response.statusCode != 200){
    			console.error('Rendition [' + This.url + '] status code [' + response.statusCode + ']');

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

    			setTimeout(function(){
    				This.getManifest();
    			}, 2000);
    		});
    	}).on('error', function(e) {
    		console.error('Rendition failed [' + This.url + ']:' + e.stack);
    		process.exit(1);
    	});
	},
	
	handleSyncPoint: function(syncPoint, segment){
		if(this.isCuePointsEnabled === false){
			console.error('Sync-point [' + syncPoint.id + '] accepted when sync-points should be disabled');
		}
		
		var offsetInSegment = (syncPoint.pts - segment.pts) / 90;
		var absoluteOffset = syncPoint.offset;
		var segmentOffset = absoluteOffset - offsetInSegment;
		var segmentTimestamp = syncPoint.timestamp - offsetInSegment;
		
		if(this.isCuePointsEnabled && this.elapsedTime && this.elapsedTime.sequence == segment.sequence && Math.abs(this.elapsedTime.offset - segmentOffset) > 1000){
			console.error('large gap between sync offset [' + this.formaTime(segmentOffset) + '] and calculated offset [' + this.formaTime(this.elapsedTime.offset) + ']');
		}
		
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
				console.error('Delete file [' + localPath + ']:' + err);
			}
		});
	},
	
	testSegment: function(segment){
		var segmentUrl = segment.url;
//		console.log('Segment URL [' + segmentUrl + ']');

		var This = this;
		http.get(segmentUrl, function(response) {
    		if(response.statusCode != 200){
    			console.error('Segment [' + segmentUrl + '] status code [' + response.statusCode + ']');
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
adServer.create(options);