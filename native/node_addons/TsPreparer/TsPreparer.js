/**
 * Sample command line:
 * 
 * node TsPreparer.js localhost 11211 600 key /web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh /web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh leftcut 1085300 /tmp/part1.ts /tmp/part2.ts /tmp/part3.ts
 */

var tsPreparer = require('../../../lib/media/KalturaTsPreparer');
var memjs = require('memjs');

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

function prepareTsCallback(error, data) {
	if (error) {
		console.log(error);
		process.exit(1);
	}

	tsPreparer.savePreparedTsToMemcache(memcache, outputKey, data, expiration, function (error) {
		if (error) {
			console.log(error);
			process.exit(1);
		}
		
		console.log('Finished successfully');
		process.exit(0);
	});
}
	
// parse the command line
const SUPPORTED_MODES = ['nocut', 'leftcut', 'rightcut'];
const USAGE = 'Usage:\n' + 
	'\tnode TsPreparer.js <memcache host> <memcache port> <expiration> <output key> <ffmpeg bin> <ffprobe bin> nocut <file1> [<file2> [ ... ] ]\n' +
	'\tnode TsPreparer.js <memcache host> <memcache port> <expiration> <output key> <ffmpeg bin> <ffprobe bin> leftcut/rightcut <cut offset> <file1> [<file2> [ ... ] ]\n';

if (process.argv.length < 10) {
	console.log(USAGE);
	process.exit(1);
}

var memcacheHost = process.argv[2];
var memcachePort = process.argv[3];
var expiration = parseInt(process.argv[4]);
var outputKey = process.argv[5];
var ffmpegBin = process.argv[6];
var ffprobeBin = process.argv[7];
var mode = process.argv[8];

if (SUPPORTED_MODES.indexOf(mode) < 0) {
	console.log('Invalid mode ' + process.argv[8] + ', should be one of: ' + SUPPORTED_MODES.join());
	process.exit(1);
}

var cutOffset;
var inputFiles;

if (mode == 'nocut') {
	inputFiles = process.argv.slice(9);
}
else {
	if (process.argv.length < 11) {
		console.log(USAGE);
		process.exit(1);
	}

	cutOffset = parseInt(process.argv[9]);
	if (typeof cutOffset === 'undefined') {
		console.log('Failed to parse cut offset ' + process.argv[9]);
		process.exit(1);
	}
	inputFiles = process.argv.slice(10);
}

// prepare the TS file
process.env['MEMCACHIER_SERVERS'] = memcacheHost + ':' + memcachePort;
var memcache = memjs.Client.create();

if (mode == 'nocut') {
	tsPreparer.prepareTsFiles(ffprobeBin, inputFiles, prepareTsCallback);
}
else {
	tsPreparer.cutTsFiles(ffmpegBin, ffprobeBin, cutOffset, mode == 'leftcut', inputFiles, prepareTsCallback);
}
