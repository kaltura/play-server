var fs = require('fs');
var temp = require('temp');
var util = require('util');
var childProcess = require('child_process');

var tsPreparer = require('../../bin/Release/TsPreparer.node');

var kaltura = {
	mediaInfo : require('./KalturaMediaInfo'),
	multiBuffer : require('./KalturaMultiBuffer'),
	ffmpegParams : require('./KalturaFfmpegParams')
};

var KalturaTsPreparer = {
	TS_PACKET_LENGTH: 188,
	FILE_CHUNK_SIZE: 2500 * 188,
	MAX_FFPROBE_OUTPUT_SIZE: (64 * 1024 * 1024),
	
	BUFFER_FLAG_FIXED_TIMESTAMPS:		(0x01),
	BUFFER_FLAG_TIMESTAMPS_REF_START:	(0x02),
	BUFFER_FLAG_TIMESTAMPS_REF_END:		(0x04),
	BUFFER_FLAG_UPDATE_CCS:				(0x08),
	BUFFER_FLAG_TS_HEADER:				(0x10),
	BUFFER_FLAG_FILTER_MEDIA_STREAMS:	(0x20),
	
	logger: console,

	setLogger: function(logger){
		KalturaTsPreparer.logger = logger;
	},
	
	findLastPatPmtPackets: function(inputBuffers, endPos) {
    	var outputBuffers = new kaltura.multiBuffer();
    	inputBuffers.reverseWalk(endPos, function(curBuffer) {
    		var patPmtPackets = tsPreparer.findLastPatPmtPackets(curBuffer);
    		if (!patPmtPackets) {
    			return true;
    		}
    
    		outputBuffers.push(curBuffer.slice(patPmtPackets.pat, patPmtPackets.pat + KalturaTsPreparer.TS_PACKET_LENGTH));
    		outputBuffers.push(curBuffer.slice(patPmtPackets.pmt, patPmtPackets.pmt + KalturaTsPreparer.TS_PACKET_LENGTH));
    		return false;
    	});
    
    	// Note: this is OK since reverseWalk is synchronous
    	return outputBuffers;
    },
    
    buildTsBuffers: function(inputBuffers, startPos, endPos) {
    	var patPmtBuffers = KalturaTsPreparer.findLastPatPmtPackets(inputBuffers, startPos);
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
    	KalturaTsPreparer.logger.log('Executing ' + commandLine);
    	var startTime = new Date().getTime();
    	childProcess.exec(commandLine, options, function(error, stdout, stderr) {
    		var endTime = new Date().getTime();
    		KalturaTsPreparer.logger.log('Done, took ' + ((endTime - startTime) / 1000));
    		callback(error, stdout, stderr);
    	});
    },
    
    getFramesInfo: function(ffprobeBin, inputFiles, callback) {
    	var ffprobeCmd = ffprobeBin + " -show_packets -i 'concat:" + inputFiles.join('|') + "'";
    
    	KalturaTsPreparer.executeCommand(ffprobeCmd, {maxBuffer : KalturaTsPreparer.MAX_FFPROBE_OUTPUT_SIZE}, function(error, framesInfo, stderr) {
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
    		KalturaTsPreparer.getFramesInfo(ffprobeBin, inputFiles, function(error, framesInfo) {
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
    		KalturaTsPreparer.executeCommand(ffmpegCmd, {}, function(error, stdout, stderr) {
    
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
    			KalturaTsPreparer.logger.log('Parsed media info:' + util.inspect(mediaInfo));
    
    			// build the encoding params
    			var encodingParams = kaltura.ffmpegParams.buildEncodingParams(mediaInfo, false, false);
    			var clipSwitch;
    			if (leftPortion) {
    				clipSwitch = '-t ' + cutOffset;
    			} else {
    				clipSwitch = '-ss ' + cutOffset;
    			}
    			var ffmpegParams = [ '-i ' + inputFile, encodingParams, clipSwitch ].join(' ');
    
    			// run ffmpeg with temp file output
    			KalturaTsPreparer.executeFfmpegWithTempOutput(ffmpegBin, ffmpegParams, function(err, ffmpegClippedFile) {
    				if (err) {
    					callback(err);
    					return;
    				}
    
    				// read the result
    				KalturaTsPreparer.readFilesAndGetFrames(ffprobeBin, [ ffmpegClippedFile ], function(error, clippedBuffers, clippedFramesInfo) {
    					callback(error, clippedBuffers, clippedFramesInfo);
    				});
    			});
    		});
    	});
    },

    prepareTsFiles: function(ffprobeBin, inputFiles, callback) {
    	// read the input files
    	KalturaTsPreparer.readFilesAndGetFrames(ffprobeBin, inputFiles, function(error, inputBuffers, framesInfo) {

			if (error) {
    			callback(error, null);
    			return;
    		}

			var inputFrames = tsPreparer.parseFramesInfo(inputBuffers.buffers, framesInfo);

			result = tsPreparer.prepareTs([
				{
					'buffers': inputBuffers.buffers, 
					'frames': inputFrames, 
					'framesPosShift': 0,
					'flags': KalturaTsPreparer.BUFFER_FLAG_TS_HEADER
				}]);

			callback(null, result);
		});
	},
    
    cutTsFiles: function(ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, callback) {
    	// read the input files
    	KalturaTsPreparer.readFilesAndGetFrames(ffprobeBin, inputFiles, function(error, inputBuffers, framesInfo) {
    
    		if (error) {
    			callback(error, null);
    			return;
    		}
    
    		// get the frame positions and timestamps
    		var cutDetails = tsPreparer.getCutDetails(inputBuffers.buffers, framesInfo, cutOffset, leftPortion);
    		KalturaTsPreparer.logger.log('Using the following parameters for the cut: ' + util.inspect(cutDetails));
    
    		// add the margins to the output buffers
    		var originalBuffers;
    		if (leftPortion) {
    			originalBuffers = inputBuffers.slice(0, cutDetails.leftPos);
    		} else {
    			originalBuffers = KalturaTsPreparer.buildTsBuffers(inputBuffers, cutDetails.rightPos, -1);
    		}
    
    		// check whether we can perform a simple cut without transcoding
    		if (cutDetails.leftPos == cutDetails.rightPos) {
    			KalturaTsPreparer.logger.log('Performing a simple cut');
				
    			var result = null;
    			if (leftPortion) {
					result = tsPreparer.prepareTs([
						{
							'buffers': originalBuffers.buffers, 
							'frames': cutDetails.originalFrames, 
							'framesPosShift': 0,
							'flags': KalturaTsPreparer.BUFFER_FLAG_FIXED_TIMESTAMPS | KalturaTsPreparer.BUFFER_FLAG_TIMESTAMPS_REF_END | KalturaTsPreparer.BUFFER_FLAG_UPDATE_CCS | KalturaTsPreparer.BUFFER_FLAG_TS_HEADER
						}]);
				} 
				else {
					result = tsPreparer.prepareTs([
						{
							'buffers': originalBuffers.buffers, 
							'frames': cutDetails.originalFrames, 
							'framesPosShift': 2 * KalturaTsPreparer.TS_PACKET_LENGTH - cutDetails.rightPos,
							'flags': KalturaTsPreparer.BUFFER_FLAG_FIXED_TIMESTAMPS | KalturaTsPreparer.BUFFER_FLAG_TIMESTAMPS_REF_START | KalturaTsPreparer.BUFFER_FLAG_UPDATE_CCS | KalturaTsPreparer.BUFFER_FLAG_TS_HEADER
						}]);
				}
				
				callback(null, result);
    			return;
    		}
    
    		// extract the section bounded by the two iframes
    		var boundedSection = KalturaTsPreparer.buildTsBuffers(inputBuffers, cutDetails.leftPos, cutDetails.rightPos);
    		inputBuffers = null; // no longer need the full input buffers
    
    		// clip the bounded section with ffmpeg
    		var cutOffsetSec = (cutOffset - cutDetails.leftOffset) / 90000;
    		KalturaTsPreparer.clipWithFfmpeg(ffmpegBin, ffprobeBin, boundedSection, cutOffsetSec, leftPortion, function(error, clippedBuffers, clippedFramesInfo) {
    
    			if (error) {
    				callback(error, null);
    				return;
    			}
    
				var clippedFrames = tsPreparer.parseFramesInfo(clippedBuffers.buffers, clippedFramesInfo);
				var result;
				
    			if (leftPortion) {
					result = tsPreparer.prepareTs([
						{
							'buffers': originalBuffers.buffers, 
							'frames': cutDetails.originalFrames, 
							'framesPosShift': 0,
							'flags': KalturaTsPreparer.BUFFER_FLAG_FIXED_TIMESTAMPS | KalturaTsPreparer.BUFFER_FLAG_TIMESTAMPS_REF_END | KalturaTsPreparer.BUFFER_FLAG_UPDATE_CCS | KalturaTsPreparer.BUFFER_FLAG_TS_HEADER
						},
						{
							'buffers': clippedBuffers.buffers, 
							'frames': clippedFrames, 
							'framesPosShift': 0,
							'flags': KalturaTsPreparer.BUFFER_FLAG_FILTER_MEDIA_STREAMS
						}]);
				} 
				else {
					result = tsPreparer.prepareTs([
						{
							'buffers': clippedBuffers.buffers, 
							'frames': clippedFrames, 
							'framesPosShift': 0,
							'flags': KalturaTsPreparer.BUFFER_FLAG_FILTER_MEDIA_STREAMS
						},
						{
							'buffers': originalBuffers.buffers, 
							'frames': cutDetails.originalFrames, 
							'framesPosShift': 2 * KalturaTsPreparer.TS_PACKET_LENGTH - cutDetails.rightPos,
							'flags': KalturaTsPreparer.BUFFER_FLAG_FIXED_TIMESTAMPS | KalturaTsPreparer.BUFFER_FLAG_TIMESTAMPS_REF_START | KalturaTsPreparer.BUFFER_FLAG_UPDATE_CCS | KalturaTsPreparer.BUFFER_FLAG_TS_HEADER, 
						}]);
				}
				
				callback(null, result);
    		});
    	});
    },
	
	memcacheSetMulti: function (memcache, keys, values, expiration, index, callback) {
		if (index >= keys.length) {
			callback(null);
			return;
		}
		
		memcache.set(keys[index], values[index], function (error) {
			if (error) {
				callback(error);
				return;
			}
			
			KalturaTsPreparer.memcacheSetMulti(memcache, keys, values, expiration, index + 1, callback);
		}, expiration);
	},

	savePreparedTsToMemcache: function (memcache, outputKey, data, expiration, callback) {
		var buffers = [];
		var keys = [];
		var curIndex = 0;
		for (var curPos = 0; curPos < data.data.length; curPos += KalturaTsPreparer.FILE_CHUNK_SIZE, curIndex++) {
			keys.push(outputKey + '-' + curIndex);
			buffers.push(data.data.slice(curPos, curPos + KalturaTsPreparer.FILE_CHUNK_SIZE));
		}
		keys.push(outputKey + '-header');
		buffers.push(data.header);
		keys.push(outputKey + '-metadata');
		buffers.push(data.metadata);
		
		KalturaTsPreparer.memcacheSetMulti(memcache, keys, buffers, expiration, 0, callback);
	}	
};

module.exports = KalturaTsPreparer;
