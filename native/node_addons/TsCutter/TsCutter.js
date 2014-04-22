var kalturaMediaInfo = require('../../../poc/node/KalturaMediaInfo');
var kalturaFfmpegParams = require('../../../poc/node/KalturaFfmpegParams');
var childProcess = require('child_process');
var nativeCutter = require('./build/Release/TsCutter');
var tmp = require('tmp');
var fs = require('fs');
var MultiBuffer = require('./MultiBuffer').MultiBuffer;

const TS_PACKET_LENGTH = 188;
const MAX_FFPROBE_OUTPUT_SIZE = 2 * 1024 * 1024;

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

function findLastPatPmtPackets(inputBuffers, endPos) {
	var outputBuffers = new MultiBuffer();
	inputBuffers.reverseWalk(endPos, function (curBuffer) {
		var patPmtPackets = nativeCutter.findLastPatPmtPackets(curBuffer);
		if (!patPmtPackets) {
			return true;
		}
		
		outputBuffers.push(curBuffer.slice(patPmtPackets.pat, patPmtPackets.pat + TS_PACKET_LENGTH));
		outputBuffers.push(curBuffer.slice(patPmtPackets.pmt, patPmtPackets.pmt + TS_PACKET_LENGTH));
		return false;
	});

	// Note: this is OK since reverseWalk is synchronous
	return outputBuffers;
}

function buildTsBuffers(inputBuffers, startPos, endPos) {
	var patPmtBuffers = findLastPatPmtPackets(inputBuffers, startPos);
	if (!patPmtBuffers) {
		return null;
	}
	
	var bufferSlice = inputBuffers.slice(startPos, endPos)
	if (!bufferSlice) {
		return null;
	}
	
	return patPmtBuffers.concat(bufferSlice);
}

function executeCommand(commandLine, options, callback) {
	console.log('Executing ' + commandLine);
	var startTime = new Date().getTime();
	childProcess.exec(commandLine, options, function (error, stdout, stderr) {
		var endTime = new Date().getTime();
		console.log('Done, took ' + ((endTime - startTime) / 1000));
		callback(error, stdout, stderr);
	});
}

function getFramesInfo(ffprobeBin, inputFiles, callback) {
	var ffprobeCmd = ffprobeBin + " -show_packets -i 'concat:" + inputFiles.join('|') + "'";

	executeCommand(ffprobeCmd, { maxBuffer: MAX_FFPROBE_OUTPUT_SIZE }, function (error, framesInfo, stderr) {
		callback(error, framesInfo);
	});
}

function readFilesAndGetFrames(ffprobeBin, inputFiles, callback) {
	// read the input files
	var inputBuffers = new MultiBuffer();
	inputBuffers.readFiles(inputFiles, function (error) {
		if (error) {
			callback(error);
			return;
		}
		
		// get the frames info
		getFramesInfo(ffprobeBin, inputFiles, function (error, framesInfo) {
			if (error) {
				callback(error);
				return;
			}
			
			callback(null, inputBuffers, framesInfo);
		});
	});
}

function executeFfmpegWithTempOutput(ffmpegBin, params, callback) {
	// create a temp file
	tmp.file(function (err, outputFile, fd) {
		if (err) {
			callback(err);
			return;
		}

		fs.closeSync(fd);
	
		// execute ffmpeg
		var ffmpegCmd = [ffmpegBin, params, '-y ' + outputFile].join(' ');
		executeCommand(ffmpegCmd, {}, function (error, stdout, stderr) {

			if (error) {
				callback(error);
			}
			else {
				callback(null, outputFile);
			}
		});			
	});
}

function clipWithFfmpeg(ffmpegBin, ffprobeBin, inputBuffers, cutOffset, leftPortion, callback) {
	// save the input buffers to a file
	inputBuffers.writeTempFile(function (err, inputFile) {
		if (err) {
			callback(err);
			return;
		}

		// parse the media info
		kalturaMediaInfo.parse(inputFile, function (mediaInfo) {
			console.log('Parsed media info:');
			console.dir(mediaInfo);
			
			// build the encoding params
			var encodingParams = kalturaFfmpegParams.buildEncodingParams(mediaInfo, leftPortion, false);			
			var clipSwitch;
			if (leftPortion) {
				clipSwitch = '-t ' + cutOffset;
			}
			else {
				clipSwitch = '-ss ' + cutOffset;
			}
			var ffmpegParams = ['-i ' + inputFile, encodingParams, clipSwitch].join(' ');
			
			// run ffmpeg with temp file output
			executeFfmpegWithTempOutput(ffmpegBin, ffmpegParams, function (err, ffmpegClippedFile) {
				if (err) {
					callback(err);
					return;
				}
				
				// read the result
				readFilesAndGetFrames(ffprobeBin, [ffmpegClippedFile], function (error, clippedBuffers, clippedFramesInfo) {
					callback(error, clippedBuffers, clippedFramesInfo);
				});
			});
		});
	});
}

function cutTsFiles(outputFile, ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, callback) {	
	// read the input files
	readFilesAndGetFrames(ffprobeBin, inputFiles, function (error, inputBuffers, framesInfo) {

		if (error) {
			callback(error);
			return;
		}
		
		// get the frame positions and timestamps
		cutDetails = nativeCutter.getCutDetails(
			inputBuffers.buffers,
			framesInfo,
			cutOffset,
			leftPortion
		);
		console.log('Using the following parameters for the cut');
		console.dir(cutDetails);
		
		// add the margins to the output buffers
		var outputBuffers;
		if (leftPortion) {
			outputBuffers = inputBuffers.slice(0, cutDetails.frames.leftPos);
		}
		else {
			outputBuffers = buildTsBuffers(inputBuffers, cutDetails.frames.rightPos, -1);			
		}
		
		// check whether we can perform a simple cut without transcoding
		if (cutDetails.frames.leftPos == cutDetails.frames.rightPos) {
			console.log('Performing a simple cut');
			outputBuffers.writeFile(outputFile, function (error) {
				callback(error);
			});
			return;
		}

		// extract the section bounded by the two iframes
		var boundedSection = buildTsBuffers(inputBuffers, cutDetails.frames.leftPos, cutDetails.frames.rightPos);
		inputBuffers = null;		// no longer need the full input buffers
		
		// clip the bounded section with ffmpeg
		var cutOffsetSec = (cutOffset - cutDetails.frames.leftOffset) / 90000;
		clipWithFfmpeg(ffmpegBin, ffprobeBin, boundedSection, cutOffsetSec, leftPortion, function (error, clippedBuffers, clippedFramesInfo) {		
		
			if (error) {
				callback(error);
				return;
			}

			// fix the timestamps of the clip
			nativeCutter.fixTimestamps(
				clippedBuffers.buffers[0], 
				clippedFramesInfo, 
				cutDetails.timestamps, 
				leftPortion);
			
			// add the clip to the output buffers and fix the continuity counters
			if (leftPortion) {
				outputBuffers = outputBuffers.concat(clippedBuffers);
				
				nativeCutter.fixContinuityForward(outputBuffers.buffers);
			}
			else {
				outputBuffers = clippedBuffers.concat(outputBuffers);
				
				nativeCutter.fixContinuityBackward(outputBuffers.buffers);
			}
			
			// write the result
			outputBuffers.writeFile(outputFile, function (error) {
				callback(error);
			});
		});
	});
}

/* 
	Sample command line:
	
	node TsCutter.js /tmp/testJsCutter.ts /web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh /web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh 1085300 left /tmp/pre-1-4fd291d9968ec0fa2db44c52786295e0.ts /tmp/pre-2-cb11685b4a167e4a41d323871819a6df.ts /tmp/pre-3-5634dbf4fd82448ea3faf2b201820718.ts
*/
if(require.main === module) { 
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
	}
	else if (process.argv[6] == 'right') {
		leftPortion = false;
	}
	else {
		console.log('Invalid portion requested ' + process.argv[6] + ', should be either left or right');
		process.exit(1);
	}
	var inputFiles = process.argv.slice(7);

	cutTsFiles(outputFile, ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, function (error) {
		if (error) {
			console.log(error);
			process.exit(1);
		}
		console.log('Finished successfully');
		process.exit(0);
	});
}
else {
	module.exports.cutTsFiles = cutTsFiles;
}
