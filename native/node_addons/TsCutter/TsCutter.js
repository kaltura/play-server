/**
 * Sample command line:
 * 
 * node TsCutter.js /tmp/testJsCutter.ts /web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh /web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh 1085300 left /tmp/pre-1-4fd291d9968ec0fa2db44c52786295e0.ts /tmp/pre-2-cb11685b4a167e4a41d323871819a6df.ts /tmp/pre-3-5634dbf4fd82448ea3faf2b201820718.ts
 */

var tsCutter = require('../../../lib/media/KalturaTsCutter');

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

if (process.argv.length < 8) {
	console.log('Usage:\n\tnode TsCutter.js <output file> <ffmpeg bin> <ffprobe bin> <cut offset> <left/right> <file1> [<file2> [ ... ] ]');
	process.exit(1);
}

var outputFile = process.argv[2];
var ffmpegBin = process.argv[3];
var ffprobeBin = process.argv[4];
var cutOffset = parseInt(process.argv[5]);
if (typeof cutOffset === 'undefined') {
	console.log('Failed to parse cut offset ' + process.argv[5]);
	process.exit(1);
}

var leftPortion;
if (process.argv[6] == 'left') {
	leftPortion = true;
} else if (process.argv[6] == 'right') {
	leftPortion = false;
} else {
	console.log('Invalid portion requested ' + process.argv[6] + ', should be either left or right');
	process.exit(1);
}
var inputFiles = process.argv.slice(7);

tsCutter.cutTsFiles(outputFile, ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, function(error) {
	if (error) {
		console.log(error);
		process.exit(1);
	}
	console.log('Finished successfully');
	process.exit(0);
});
