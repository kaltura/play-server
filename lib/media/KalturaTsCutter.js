var fs = require('fs');
var temp = require('temp');
var util = require('util');
var childProcess = require('child_process');

var tsCutter = require('../../bin/Release/TsCutter.node');

var kaltura = {
	mediaInfo : require('./KalturaMediaInfo'),
	multiBuffer : require('./KalturaMultiBuffer'),
	ffmpegParams : require('./KalturaFfmpegParams')
};

var KalturaTsCutter = {
	TS_PACKET_LENGTH: 188,
	MAX_FFPROBE_OUTPUT_SIZE: (2 * 1024 * 1024),
	logger: console,

	setLogger: function(logger){
		KalturaTsCutter.logger = logger;
	},
	
	findLastPatPmtPackets: function(inputBuffers, endPos) {
    	var outputBuffers = new kaltura.multiBuffer();
    	inputBuffers.reverseWalk(endPos, function(curBuffer) {
    		var patPmtPackets = tsCutter.findLastPatPmtPackets(curBuffer);
    		if (!patPmtPackets) {
    			return true;
    		}
    
    		outputBuffers.push(curBuffer.slice(patPmtPackets.pat, patPmtPackets.pat + KalturaTsCutter.TS_PACKET_LENGTH));
    		outputBuffers.push(curBuffer.slice(patPmtPackets.pmt, patPmtPackets.pmt + KalturaTsCutter.TS_PACKET_LENGTH));
    		return false;
    	});
    
    	// Note: this is OK since reverseWalk is synchronous
    	return outputBuffers;
    },
    
    buildTsBuffers: function(inputBuffers, startPos, endPos) {
    	var patPmtBuffers = KalturaTsCutter.findLastPatPmtPackets(inputBuffers, startPos);
    	if (!patPmtBuffers) {
    		return null;
    	}
    
    	var bufferSlice = inputBuffers.slice(startPos, endPos);
    	if (!bufferSlice) {
    		return null;
    	}
    
    	return patPmtBuffers.concat(bufferSlice);
    },
    
    executeCommand: function(commandLine, options, callback) {
    	KalturaTsCutter.logger.log('Executing ' + commandLine);
    	var startTime = new Date().getTime();
    	childProcess.exec(commandLine, options, function(error, stdout, stderr) {
    		var endTime = new Date().getTime();
    		KalturaTsCutter.logger.log('Done, took ' + ((endTime - startTime) / 1000));
    		callback(error, stdout, stderr);
    	});
    },
    
    getFramesInfo: function(ffprobeBin, inputFiles, callback) {
    	var ffprobeCmd = ffprobeBin + " -show_packets -i 'concat:" + inputFiles.join('|') + "'";
    
    	KalturaTsCutter.executeCommand(ffprobeCmd, {maxBuffer : KalturaTsCutter.MAX_FFPROBE_OUTPUT_SIZE}, function(error, framesInfo, stderr) {
    		callback(error, framesInfo);
    	});
    },
    
    readFilesAndGetFrames: function(ffprobeBin, inputFiles, callback) {
    	// read the input files
    	var inputBuffers = new kaltura.multiBuffer();
    	inputBuffers.readFiles(inputFiles, function(error) {
    		if (error) {
    			callback(error);
    			return;
    		}
    
    		// get the frames info
    		KalturaTsCutter.getFramesInfo(ffprobeBin, inputFiles, function(error, framesInfo) {
    			if (error) {
    				callback(error);
    				return;
    			}
    
    			callback(null, inputBuffers, framesInfo);
    		});
    	});
    },
    
    executeFfmpegWithTempOutput: function(ffmpegBin, params, callback) {
    	// create a temp file
		//temp.open
		temp.open({suffix: '.ts'}, function(err, outputFile) {
    		if (err) {
    			callback(err);
    			return;
    		}
    
    		fs.closeSync(outputFile.fd);
    
    		// execute ffmpeg
    		var ffmpegCmd = [ ffmpegBin, params, '-y ' + outputFile.path ].join(' ');
    		KalturaTsCutter.executeCommand(ffmpegCmd, {}, function(error, stdout, stderr) {
    
    			if (error) {
    				callback(error);
    			} else {
    				callback(null, outputFile.path);
    			}
    		});
    	});
    },
    
    clipWithFfmpeg: function(ffmpegBin, ffprobeBin, inputBuffers, cutOffset, leftPortion, callback) {
    	// save the input buffers to a file
    	inputBuffers.writeTempFile(function(err, inputFile) {
    		if (err) {
    			callback(err);
    			return;
    		}
    
    		// parse the media info
    		kaltura.mediaInfo.parse(inputFile, function(mediaInfo) {
    			KalturaTsCutter.logger.log('Parsed media info:' + util.inspect(mediaInfo));
    
    			// build the encoding params
    			var encodingParams = kaltura.ffmpegParams.buildEncodingParams(mediaInfo, leftPortion, false);
    			var clipSwitch;
    			if (leftPortion) {
    				clipSwitch = '-t ' + cutOffset;
    			} else {
    				clipSwitch = '-ss ' + cutOffset;
    			}
    			var ffmpegParams = [ '-i ' + inputFile, encodingParams, clipSwitch ].join(' ');
    
    			// run ffmpeg with temp file output
    			KalturaTsCutter.executeFfmpegWithTempOutput(ffmpegBin, ffmpegParams, function(err, ffmpegClippedFile) {
    				if (err) {
    					callback(err);
    					return;
    				}
    
    				// read the result
    				KalturaTsCutter.readFilesAndGetFrames(ffprobeBin, [ ffmpegClippedFile ], function(error, clippedBuffers, clippedFramesInfo) {
    					callback(error, clippedBuffers, clippedFramesInfo);
    				});
    			});
    		});
    	});
    },
    
    cutTsFiles: function(outputFile, ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, callback) {
    	// read the input files
    	KalturaTsCutter.readFilesAndGetFrames(ffprobeBin, inputFiles, function(error, inputBuffers, framesInfo) {
    
    		if (error) {
    			callback(error);
    			return;
    		}
    
    		// get the frame positions and timestamps
    		cutDetails = tsCutter.getCutDetails(inputBuffers.buffers, framesInfo, cutOffset, leftPortion);
    		KalturaTsCutter.logger.log('Using the following parameters for the cut: ' + util.inspect(cutDetails));
    
    		// add the margins to the output buffers
    		var outputBuffers;
    		if (leftPortion) {
    			outputBuffers = inputBuffers.slice(0, cutDetails.frames.leftPos);
    		} else {
    			outputBuffers = KalturaTsCutter.buildTsBuffers(inputBuffers, cutDetails.frames.rightPos, -1);
    		}
    
    		// check whether we can perform a simple cut without transcoding
    		if (cutDetails.frames.leftPos == cutDetails.frames.rightPos) {
    			KalturaTsCutter.logger.log('Performing a simple cut');
    			outputBuffers.writeFile(outputFile, function(error) {
    				callback(error);
    			});
    			return;
    		}
    
    		// extract the section bounded by the two iframes
    		var boundedSection = KalturaTsCutter.buildTsBuffers(inputBuffers, cutDetails.frames.leftPos, cutDetails.frames.rightPos);
    		inputBuffers = null; // no longer need the full input buffers
    
    		// clip the bounded section with ffmpeg
    		var cutOffsetSec = (cutOffset - cutDetails.frames.leftOffset) / 90000;
    		KalturaTsCutter.clipWithFfmpeg(ffmpegBin, ffprobeBin, boundedSection, cutOffsetSec, leftPortion, function(error, clippedBuffers, clippedFramesInfo) {
    
    			if (error) {
    				callback(error);
    				return;
    			}
    
    			// fix the timestamps of the clip
    			tsCutter.fixTimestamps(clippedBuffers.buffers[0], clippedFramesInfo, cutDetails.timestamps, leftPortion);
    
    			// add the clip to the output buffers and fix the continuity counters
    			if (leftPortion) {
    				outputBuffers = outputBuffers.concat(clippedBuffers);
    
    				tsCutter.fixContinuityForward(outputBuffers.buffers);
    			} else {
    				outputBuffers = clippedBuffers.concat(outputBuffers);
    
    				tsCutter.fixContinuityBackward(outputBuffers.buffers);
    			}
    
    			// write the result
				KalturaTsCutter.logger.log('Writing ' + outputBuffers);
    			outputBuffers.writeFile(outputFile, function(error) {
    				callback(error);
    			});
    		});
    	});
    }
};

module.exports = KalturaTsCutter;
