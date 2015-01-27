/**
 * Sample command line:
 * 
 * node TsCutter.js /tmp/testJsCutter.ts /web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh /web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh 1085300 left /tmp/pre-1-4fd291d9968ec0fa2db44c52786295e0.ts /tmp/pre-2-cb11685b4a167e4a41d323871819a6df.ts /tmp/pre-3-5634dbf4fd82448ea3faf2b201820718.ts
 */

var kalturaTsPreparer = require('../../../lib/media/KalturaTsPreparer');
var tsStitcher = require('../../../bin/Release/TsStitcher.node');
var fs = require('fs');

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

const PBA_CALL_AGAIN = 0;
const PBA_GET_NEXT_CHUNK = 1;
const PBA_CLONE_CURRENT_CHUNK = 2;

const CHUNK_TYPE_TS_HEADER = 0;
const CHUNK_TYPE_PRE_AD = 	 1;

const TS_PACKET_LENGTH = 188;
const FILE_CHUNK_SIZE = 2500 * TS_PACKET_LENGTH;

kalturaTsPreparer.cutTsFiles(ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, function (error, data) {
	var fd = fs.openSync(outputFile, 'w');
	var outputLayout = tsStitcher.buildLayout(data.metadata, null, [], 0, 0, 0);
	var outputState = {};
	var curChunk = new Buffer(0);
	new Buffer(0)
	
	while (curChunk != null) {
		do {
			var processResult = tsStitcher.processChunk(
				outputLayout,
				curChunk,
				outputState);

			if (processResult.chunkOutputEnd > 0) {
				console.log('Writing ' + processResult.chunkOutputStart + '..' + processResult.chunkOutputEnd);
				var curSlice = curChunk.slice(processResult.chunkOutputStart, processResult.chunkOutputEnd);
				fs.writeSync(fd, curSlice, 0, curSlice.length);
			}

			if (processResult.outputBuffer) {
				console.log('Writing extra buffer of size ' + processResult.outputBuffer.length);
				fs.writeSync(fd, processResult.outputBuffer, 0, processResult.outputBuffer.length);
			}

			if (processResult.action == PBA_CLONE_CURRENT_CHUNK)
			{
				console.log('Cloning chunk buffer');
				chunkClone = new Buffer(curChunk.length);
				curChunk.copy(chunkClone);
				curChunk = chunkClone;
			}
		} while (processResult.action != PBA_GET_NEXT_CHUNK);

		curChunk = null;		// no longer need the chunk

		switch (outputState.chunkType) {
		case CHUNK_TYPE_PRE_AD:
			var chunkIndex = Math.floor(outputState.chunkStartOffset / FILE_CHUNK_SIZE);
			curChunk = data.data.slice(chunkIndex * FILE_CHUNK_SIZE, (chunkIndex + 1) * FILE_CHUNK_SIZE);
			break;
		case CHUNK_TYPE_TS_HEADER:
			curChunk = data.header;
			break;
		default:
			// done
		}
	}

	fs.closeSync(fd);
});
