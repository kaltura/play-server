var os = require('os');
var url = require('url');
var dns = require('dns');
var http = require('http');

var playServerHost = null;
var playServerPort = null;
var masterUrl = null;
var canStart = true;


function buildMasterUrl(entryid, manifestUrl) {
	// 'http://dev-backend-desktop.dev.kaltura.com:808/manifest/master/entryId/'
	// + entryid + '/name/master.m3u8?url=' + manifestUrl;
	return 'http://' + playServerHost + ':' + playServerPort
			+ '/manifest/master/entryId/' + entryid + '/name/master.m3u8?url='
			+ manifestUrl;
}

function printHelp() {
	var examples = {
		'0_x1n7h66c' : 'http://kalsegsec-a.akamaihd.net/dc-0/m/pa-live-publish1/kLive/smil:0_x1n7h66c_all.smil/playlist.m3u8',
		'0_wwsxfta8' : 'http://dev-hudson9.dev.kaltura.com:1935/kLive/smil:0_wwsxfta8_all.smil/playlist.m3u8',
		'0_04b835a6' : 'http://urtmpkal-f.akamaihd.net/i/004b835a6_1@179492/master.m3u8',
		'0_4mo1iw8g' : 'http://dev-hudson9.dev.kaltura.com:1935/kLive/smil:0_4mo1iw8g_all.smil/playlist.m3u8'
	};

	console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' [options] [master manifest url]');
	console.log('Options:');
	console.log('\t -h / --help - This help');
	console.log('\t -s / --server - Play-Server hostname');
	console.log('\t -p / --port - Play-Server port');
	console.log('URL Examples:');
	for ( var entryId in examples) {
		console.log('\t - ' + buildMasterUrl(entryId, examples[entryId]));
	}
}

function ask(question, format, callback) {
	if(typeof format === 'function' && !callback){
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

function getUserInputs(){
	if (masterUrl) {
		return;
	}

	canStart = playServerHost && playServerPort && masterUrl;
	test();

	if(!playServerHost){
		var defaultServerHost = os.hostname();
		var question = 'Please specify play-server hostname or leave empty to use "' + defaultServerHost + '"';
		ask(question, function(data){
			if(data === ''){
				playServerHost = defaultServerHost;
			}
			else{
				playServerHost = data;
			}
			getUserInputs();
		});
		return;
	}

	if(!playServerPort){
		var defaultServerPort = 80;
		var question = 'Please specify play-server port or leave empty to use ' + defaultServerPort;
		ask(question, /^\d*$/, function(data){
			if(data === ''){
				playServerPort = defaultServerPort;
			}
			else{
				playServerPort = parseInt(data);
			}
			getUserInputs();
		});
		return;
	}

	if(!masterUrl){
		ask('Please specify entry id', /^[01]_[\w\d]{8}$/, function(data){
			var entryId = data;

			ask('Please specify manifest URL', /^https?:\/\/.+$/, function(data){
				var manifestUrl = data;
				masterUrl = buildMasterUrl(entryId, manifestUrl);
				getUserInputs();
			});
		});
	}
}

function parseCommandLineOptions(){
	var argv = process.argv;
	argv.shift();
	argv.shift();
	
	var option;
	while (argv.length) {
		option = argv.shift();
		if (option[0] != '-' && !argv.length) {
			masterUrl = option;
			var urlRegex = /^https?:\/\/.+\/manifest\/master\/.*entryId\/.*\?.*url=https?:\/\/.+$/;
			if (!urlRegex.match(masterUrl)) {
				console
						.error('Master manifest in wrong format [' + masterUrl
								+ ']');
				printHelp();
				process.exit(1);
			}
		}
	
		if (option == '-h' || option == '--help') {
			printHelp();
			process.exit(1);
		}
	
		if (option == '-s' || option == '--server') {
			if (!argv.length) {
				console.error('Please specify play-server hostname');
				printHelp();
				process.exit(1);
			}

			playServerHost = argv.shift();
			canStart = false;
			dns.lookup(playServerHost, function(err, address, family) {
				if (err) {
					console.error('Invalid play-server hostname [' + playServerHost
							+ ']: ' + err);
					printHelp();
					process.exit(1);
				} else {
					test();
				}
			});
		}
	
		if (option == '-p' || option == '--port') {
			if (!argv.length) {
				console.error('Please specify play-server port');
				printHelp();
				process.exit(1);
			}

			playServerPort = argv.shift();
			if (isNaN(playServerPort) || playServerPort <= 0) {
				console.error('Invalid play-server hostname [' + playServerPort
						+ ']');
				printHelp();
				process.exit(1);
			}
		}
	}
}

function testSegment(segmentUrl) {
	// console.log('Segment [' + segmentUrl + ']');
	http.get(segmentUrl, function(response) {
		response.setEncoding('utf8');
		response.on('data', function(chunk) {
		});
		response.on('end', function() {
			console.log('Segment: OK');
		});
	}).on('error', function(e) {
		console.log('Segment failed [' + segmentUrl + ']:');
		console.dir(e);
	});
}

function handleFlavor(flavorUrl, manifestContent) {
	console.log('Flavor: OK');

	var m3u8Lines = manifestContent.split('\n');
	for (var i = 0; i < m3u8Lines.length; i++) {
		var m3u8Line = m3u8Lines[i].trim();
		if (m3u8Line.length == 0)
			continue;

		if (m3u8Line[0] != '#') {
			// console.log('Segment path: ' + m3u8Line);
			segmentUrl = url.resolve(flavorUrl, m3u8Line);
			testSegment(segmentUrl);
		}
	}

	setTimeout(function() {
		testFlavor(flavorUrl, manifestContent);
	}, 5000);
}

function testFlavor(flavorUrl, oldManifestContent) {
	// console.log('Flavor [' + flavorUrl + ']');
	http.get(flavorUrl, function(response) {
		response.setEncoding('utf8');
		var manifestContent = '';
		response.on('data', function(chunk) {
			manifestContent += chunk;
		});
		response.on('end', function() {
			if (manifestContent != oldManifestContent) {
				handleFlavor(flavorUrl, manifestContent);
			} else {
				testFlavor(flavorUrl, manifestContent);
			}
		});
	}).on('error', function(e) {
		console.log('Flavor failed [' + flavorUrl + ']:');
		console.dir(e);
	});
}

function handleMaster(manifestContent) {
	console.log('Master: OK');

	var split = manifestContent.split('\n');
	for (var i = 0; i < split.length; i++) {
		var currentLine = split[i].trim();

		if (currentLine.length && currentLine[0] != '#') {
			testFlavor(currentLine);
		}
	}
}

function testMaster(masterUrl) {
	console.log('Master [' + masterUrl + ']');
	http.get(masterUrl, function(response) {
		response.setEncoding('utf8');
		var manifestContent = '';
		response.on('data', function(chunk) {
			manifestContent += chunk;
		});
		response.on('end', function() {
			handleMaster(manifestContent);
		});
	}).on('error', function(e) {
		console.log('Master failed [' + masterUrl + ']:');
		console.dir(e);
	});
}

function test() {
	if (canStart) {
		testMaster(masterUrl);
	}
}

parseCommandLineOptions();
getUserInputs();
test();
