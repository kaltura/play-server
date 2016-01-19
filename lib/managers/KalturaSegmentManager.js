
var os = require('os');
var util = require('util');
var fs = require('fs');

var kaltura = module.exports = require('../KalturaManager');
kaltura.tsPreparer = require('../media/KalturaTsPreparer');
kaltura.tsPreparer.setLogger(KalturaLogger);


/**
 * @service segment
 */
var KalturaSegmentManager = function(){
};
util.inherits(KalturaSegmentManager, kaltura.KalturaManager);

KalturaSegmentManager.MAX_DVR_LENGTH = 24 * 60 * 60;

/**
 * Stitch the segment
 * 
 * @param segmentId
 * @param offset
 * @param portion
 * @param inputFiles Array
 */
KalturaSegmentManager.prototype.exec = function(segmentId, cutOffset, portion, inputFiles, callback, errorCallback){
	var leftPortion = (portion == 'left');
		
	var ffmpegBin = KalturaConfig.config.bin.binDir + '/ffmpeg';
	var ffprobeBin = KalturaConfig.config.bin.binDir + '/ffprobe';
	if(KalturaConfig.config.bin.ffmpegPath){
		ffmpegBin = KalturaConfig.config.bin.ffmpegPath;
	}
	if(KalturaConfig.config.bin.ffprobePath){
		ffprobeBin = KalturaConfig.config.bin.ffprobePath;
	}
	
	KalturaLogger.debug('tsCutter: ' + JSON.stringify({
		ffmpegBin: ffmpegBin, 
		ffprobeBin: ffprobeBin, 
		cutOffset: cutOffset, 
		leftPortion: leftPortion, 
		inputFiles: inputFiles
	}));

	kaltura.tsPreparer.cutTsFiles(ffmpegBin, ffprobeBin, cutOffset, leftPortion, inputFiles, function(err, data){
		if(err){
			KalturaLogger.log('Failed to cutTsFiles, segmentId [' + segmentId + '] ');
			errorCallback(err);
			return;
		}		
		var segmentMediaKey = KalturaCache.getKey(KalturaCache.SEGMENT_MEDIA_KEY_PREFIX, [segmentId]);
		KalturaLogger.debug('Saving [' + segmentMediaKey + '] to cache');
		kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache.binserverSet, segmentMediaKey, data, KalturaSegmentManager.MAX_DVR_LENGTH, function(error){
			if(error){
				KalturaLogger.log('Failed to save [' + segmentMediaKey + '] to cache');
				errorCallback(err);
				return;
			}	
			callback();
		});
		
	});
};

/**
 * Execute stitch filler
 * 
 * @param renditionId
 * @param uiConfConfigId
 * @param fillerEncodingParams
 * @param fillerSourceFilePath
 * @param fillerOutputFilePath
 */
KalturaSegmentManager.prototype.execFiller = function(renditionId, uiConfConfigId, slateContent, fillerEncodingParams, fillerSourceFilePath, fillerOutputFilePath){	

	var ffmpegBin = KalturaConfig.config.bin.binDir + '/ffmpeg';
	if(KalturaConfig.config.bin.ffmpegPath){
		ffmpegBin = KalturaConfig.config.bin.ffmpegPath;
	}
	
	var getStitchFillerCmd = function(){
		if(fillerSourceFilePath){
			var cmd = [
				ffmpegBin,
				'-i',
				fillerSourceFilePath,
				fillerOutputFilePath, 
				'-y', 
				outputPath
			];
			cmd = cmd.join(' ');
			return cmd;			
		}
		else{
			var cmd = [
				ffmpegBin,
				fillerEncodingParams, 
				'-y', 
				fillerOutputFilePath
			];
			cmd = cmd.join(' ');
			return cmd;
		}			
	};
	
	var This = this;	
	fs.exists(fillerOutputFilePath, function(exists){
		if(exists){
			KalturaLogger.debug('File [' + fillerOutputFilePath + '] already exists on the file system');
			This.saveFiller(renditionId, uiConfConfigId, fillerOutputFilePath);
		}
		else{
			var cmd = getStitchFillerCmd();	
			
			if(fillerSourceFilePath){
				fs.exists(fillerSourceFilePath, function(exists){
					if(exists){
						cmd.exec(function(){	
							This.saveFiller(renditionId, uiConfConfigId, fillerOutputFilePath);
						});						
					}
					else{
						This.getFlavorUrl(params.partnerId, slateContent, function(fillerDownloadUrl){
							KalturaUtils.downloadHttpUrl(fillerDownloadUrl, {filePath: fillerSourceFilePath}, function(fillerSourceFilePath){
								cmd.exec(function(){	
									This.saveFiller(renditionId, uiConfConfigId, fillerOutputFilePath);
								});
							}, function(err){
								KalturaLogger.error('Failed to download filler [' + fillerSourceFilePath + ']');
								return;								
							});
						})
					}
				})
			}
			else{
				cmd.exec(function(){	
					This.saveFiller(renditionId, uiConfConfigId, fillerOutputFilePath);
				});
			}
		}
	});
};

/**
 * Prepare filler ts and save to memcache
 * 
 * @param renditionId
 * @param uiConfConfigId
 * @param fillerOutputFilePath
 */
KalturaSegmentManager.prototype.saveFiller = function(renditionId, uiConfConfigId, fillerOutputFilePath){	
	var ffprobeBin = KalturaConfig.config.bin.binDir + '/ffprobe';
	if(KalturaConfig.config.bin.ffprobePath){
		ffprobeBin = KalturaConfig.config.bin.ffprobePath;
	}
	
	kaltura.tsPreparer.prepareTsFiles(ffprobeBin, [fillerOutputFilePath], function(err, data){
		if(err){
			KalturaLogger.error('Failed to prepareTsFiles for filler media');
			return;
		}		
		var fillerMediaKey = KalturaCache.getKey(KalturaCache.FILLER_MEDIA_KEY_PREFIX, [renditionId, uiConfConfigId]);
		KalturaLogger.debug('Saving [' + fillerMediaKey + '] to cache');
		kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache.binserverSet, fillerMediaKey, data, KalturaSegmentManager.MAX_DVR_LENGTH, function(error){
			if(error){
				KalturaLogger.error('Failed to save [' + fillerMediaKey + '] to cache');
				return;
			}		
		});		
	});
};

/**
 * Stitch filler segment and save to cache
 * 
 * @action segment.stitchFiller
 * @param renditionId
 * @param slateContent
 */
KalturaSegmentManager.prototype.stitchFiller = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['renditionId', 'uiConfConfigId']);
	if(!params)
		return;
	
	response.dir(params);
	
	var This = this;
	var fillerEncodingParamsKey = KalturaCache.getKey(KalturaCache.FILLER_ENCODING_PARAMS_KEY_PREFIX, [params.renditionId, params.uiConfConfigId]);
	KalturaCache.get(fillerEncodingParamsKey, function(fillerEncodingParams){

		response.debug('Handled');
		This.okResponse(response, 'OK', 'text/plain');
		
		if(!fillerEncodingParams){
			return;
		}
			
		var encodingId = fillerEncodingParams.md5();
		var fileName = 'black-' + encodingId;
		var fillerSourceFilePath = null;
		if(params.slateContent){
			fileName = slateContent + '-' + encodingId;
			fillerSourceFilePath = KalturaConfig.config.cloud.sharedBasePath + '/filler/' + slateContent;
		}
		var fillerOutputPath = KalturaConfig.config.cloud.sharedBasePath + '/filler/' + fileName;		
		This.execFiller(params.renditionId, params.uiConfConfigId, params.slateContent, fillerEncodingParams, fillerSourceFilePath, fillerOutputPath);
	});
};


/**
 * Stitch pre and post ad segment and save to cache
 * 
 * @action segment.stitch
 * @param segmentId
 * @param url1
 * @param url2
 * @param url3
 * @param offset
 * @param portion
 */
KalturaSegmentManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['segmentId', 'url1', 'url2', 'url3', 'offset', 'portion']);
	if(!params)
		return;
	
	response.dir(params);
	
	var This = this;
	var urls = [params.url1, params.url2, params.url3];
	var localPaths = [];
	for(var i = 0; i < urls.length; i++){
		localPaths[i] = KalturaConfig.config.cloud.sharedBasePath + '/segments/' + urls[i].md5();
	}
	KalturaUtils.downloadMultiHttpUrls(urls, localPaths, function(localPaths){
		if(response.headersSent){
			response.debug('Headers where alreay sent to the client, attempting to exec stich segment, original request probably got timed out!!!');
			This.exec(params.segmentId, params.offset, params.portion, localPaths, function(){
				KalturaCache.set(KalturaCache.getKey(KalturaCache.METADATA_READY_KEY_PREFIX, [params.segmentId]), true, KalturaConfig.config.cache.adMedia);
			}, function(err){
				response.error('Failed to stitch segment: ' + err);
			});
		}
		else{
			if(!This.run){
				response.log('Canceled');
				This.okResponse(response, 'Stopped', 'text/plain');
				return;
			}
			This.exec(params.segmentId, params.offset, params.portion, localPaths, function(){
				KalturaCache.set(KalturaCache.getKey(KalturaCache.METADATA_READY_KEY_PREFIX, [params.segmentId]), true, KalturaConfig.config.cache.adMedia, function(){
					response.debug('Handled');
					This.okResponse(response, 'OK', 'text/plain');								
				}, function(err){
					This.errorResponse(response, 500, err);
				});
			}, function(err){
				This.errorResponse(response, 500, err);
			});
		}
	}, 
	function(err){
		This.errorResponse(response, 500, err);
	});
};

module.exports.KalturaSegmentManager = KalturaSegmentManager;
