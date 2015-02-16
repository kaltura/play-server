var stitcher = require('../TsStitcher/build/Debug/TsStitcher');
var memjs = require('memjs');
var fs = require('fs');

// NOTE: the following constants must match ts_stitcher_impl.h
const PBA_CALL_AGAIN = 0;
const PBA_GET_NEXT_CHUNK = 1;
const PBA_CLONE_CURRENT_CHUNK = 2;

const ALIGN_LEFT = 		0;
const ALIGN_MIDDLE =	1;
const ALIGN_RIGHT = 	2;

const CHUNK_TYPE_INVALID  =	-1;
const CHUNK_TYPE_TS_HEADER = 0;
const CHUNK_TYPE_PRE_AD = 	 1;
const CHUNK_TYPE_POST_AD = 	 2;

const CHUNK_TYPE_AD = 		 3;
const CHUNK_TYPE_BLACK = 	 4;

// NOTE: the following constants must match KalturaTsPreparer.js
const TS_PACKET_LENGTH = 188;
const FILE_CHUNK_SIZE = 2500 * TS_PACKET_LENGTH;

function outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, tsDebugFile) {
	if (!curChunk) {
		// not much to do about this since we already returned the response headers
		console.log('failed to get chunk from memcache');
		fs.closeSync(tsDebugFile);
		return;
	}
	
	var processResult;
	do {
		processResult = stitcher.processChunk(
			outputLayout,
			curChunk,
			outputState);
				
		if (processResult.chunkOutputEnd > 0) {
			console.log('writing ' + processResult.chunkOutputStart + '..' + processResult.chunkOutputEnd);
			var curSlice = curChunk.slice(processResult.chunkOutputStart, processResult.chunkOutputEnd);
			fs.writeSync(tsDebugFile, curSlice, 0, curSlice.length);
		}
		
		if (processResult.outputBuffer) {
			console.log('writing extra buffer of size ' + processResult.outputBuffer.length);
			fs.writeSync(tsDebugFile, processResult.outputBuffer, 0, processResult.outputBuffer.length);
		}
		
		if (processResult.action == PBA_CLONE_CURRENT_CHUNK)
		{
			console.log('cloning chunk buffer');
			var chunkClone = new Buffer(curChunk.length);
			curChunk.copy(chunkClone);
			curChunk = chunkClone;
		}
	} while (processResult.action != PBA_GET_NEXT_CHUNK);
	
	curChunk = null;		// no longer need the chunk
	
	var chunkIndex = Math.floor(outputState.chunkStartOffset / FILE_CHUNK_SIZE);
	var videoKey;
	
	switch (outputState.chunkType) {
	case CHUNK_TYPE_PRE_AD:
		videoKey = preAdKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_AD:
		videoKey = adKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_BLACK:
		videoKey = blackKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_POST_AD:
		videoKey = postAdKey + '-' + chunkIndex;
		break;
	case CHUNK_TYPE_TS_HEADER:
		videoKey = preAdKey + '-header';
		break;		
	default:
		console.log('request completed');
		fs.closeSync(tsDebugFile);
		return;
	}

	console.log('getting ' + videoKey);
	memcache.get(videoKey, function (err, curChunk) {
		outputState.chunkStartOffset = chunkIndex * FILE_CHUNK_SIZE;
		outputStitchedSegment(outputLayout, outputState, curChunk, preAdKey, adKey, blackKey, postAdKey, tsDebugFile);
	});
}

function processStitchSegment(preAdKey, adKey, blackKey, postAdKey, segmentIndex, outputStart, outputEnd, outputFile) {

	
	memcache.get(preAdKey + '-metadata', function (err, preAdMetadata) {
		memcache.get(adKey + '-metadata', function (err, adMetadata) {
			memcache.get(blackKey + '-metadata', function (err, blackMetadata) {
				memcache.get(postAdKey + '-metadata', function (err, postAdMetadata) {
								
					console.log('preAdKey ' + preAdKey);
					console.log('adKey ' + adKey);
					console.log('blackKey ' + blackKey);
					console.log('postAdKey ' + postAdKey);
					
					if (!preAdMetadata) {
						console.log('failed to get pre ad segment from memcache ' + preAdKey);
						return;
					}

					if (!blackMetadata) {
						console.log('failed to get black segment from memcache ' + blackKey);
						return;
					}

					if (!postAdMetadata && outputEnd == 0) {
						console.log('failed to get post ad segment from memcache ' + postAdKey);
						return;
					}
				
					if (adMetadata == null)
						console.log('adMetadata is null');
					else
						console.log('adMetadata length ' + adMetadata.length);

					// build the layout of the output TS
					var outputLayout = stitcher.buildLayout(
						preAdMetadata,
						postAdMetadata,
						[{
							adChunkType: CHUNK_TYPE_AD,
							ad: adMetadata,
							fillerChunkType: CHUNK_TYPE_BLACK,
							filler: blackMetadata,
							startPos: 0,
							endPos: 0, 
							alignment: ALIGN_LEFT
						}],
						segmentIndex,
						outputStart,
						outputEnd);
						
					// free the metadata buffers, we don't need them anymore
					preAdMetadata = null;
					adMetadata = null;
					blackMetadata = null;
					postAdMetadata = null;
					
					// output the TS					
					console.log('saving ts file to ' + outputFile);
					var tsDebugFile = fs.openSync(outputFile, 'w');
					outputStitchedSegment(outputLayout, {}, new Buffer(0), preAdKey, adKey, blackKey, postAdKey, tsDebugFile);
				});
			});
		});
	});
}

if (process.argv.length < 10) {
	console.log('Usage:\n\tnode TsStitcher.js <pre ad key> <ad key> <black key> <post ad key> <segment index> <output start> <output end> <output file>');
	process.exit(1);
}

preAdKey = process.argv[2];
adKey = process.argv[3];
blackKey = process.argv[4];
postAdKey = process.argv[5];
segmentIndex = parseInt(process.argv[6]);
outputStart = parseInt(process.argv[7]);
outputEnd = parseInt(process.argv[8]);
outputFile = process.argv[9];

var memcache = memjs.Client.create('localhost:11211');

processStitchSegment(preAdKey, adKey, blackKey, postAdKey, segmentIndex, outputStart, outputEnd, outputFile);
