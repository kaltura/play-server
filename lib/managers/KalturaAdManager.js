
var os = require('os');
var util = require('util');
var fs = require('fs');

var kaltura = module.exports = require('../KalturaManager');
kaltura.tsPreparer = require('../media/KalturaTsPreparer');
kaltura.tsPreparer.setLogger(KalturaLogger);

/**
 * @service ad
 */
var KalturaAdManager = function(){
};
util.inherits(KalturaAdManager, kaltura.KalturaManager);

/**
 * Save the ad media to cache
 * 
 * @param serverAdId
 * @param adPath
 */
KalturaAdManager.prototype.save = function(serverAdId, adPath){

	var serverAdKey = KalturaCache.getKey(KalturaCache.AD_MEDIA_KEY_PREFIX, [serverAdId]);
	var adTsPath = KalturaUtils.buildFilePath('ad_ts', serverAdId);
	
	var writeTsFile = function(data){
		KalturaUtils.createFilePath(adTsPath, function(){
			var fd = fs.createWriteStream(adTsPath);
			fd.on('finish', function () {
				  KalturaLogger.log('Ad ts saved to file system [' + adTsPath + ']');
			});
			
			KalturaUtils.writeToFileByLength(fd, data.metadata);
			KalturaUtils.writeToFileByLength(fd, data.data);
			KalturaUtils.writeToFileByLength(fd, data.header);

			fd.end();					
		});
	};
	
	var readTsFile = function(callback, errorCallback){		
		var readAllItems = function(fd, callback, errorCallback){
			var data = {};
			KalturaUtils.readFromFileByLength(fd, function(metadata){
				data.metadata = metadata;
				KalturaUtils.readFromFileByLength(fd, function(dataVal){
					data.data = dataVal;
					KalturaUtils.readFromFileByLength(fd, function(header){
						data.header = header;
						callback(data);
					}, errorCallback);
				}, errorCallback);				
			}, errorCallback);		
		};
				
		fs.open(adTsPath, 'r', function(err, fd){
			if(err){
				errorCallback(err);
				return;
			}
			readAllItems(fd, function(data){
				fs.close(fd);
				callback(data);
			}), function(err){
				fs.close(fd);
				callback(data);
			};
		});
	};
	
	fs.exists(adTsPath, function(exists){
		if(exists){
			KalturaLogger.debug('Ad prepared ts at [' + adTsPath + '] already exists on the file system');
			readTsFile(function(data){
				KalturaLogger.debug('Saving to cache [' + serverAdKey + ']');
				kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache, serverAdKey, data, KalturaConfig.config.cache.adMedia, function(error){
					if(error){
						KalturaLogger.error('Failed to save in cache [' + serverAdKey + ']: ' + error);
						return;
					}			
					KalturaCache.set(KalturaCache.getKey(KalturaCache.METADATA_READY_KEY_PREFIX, [serverAdId]), true, KalturaConfig.config.cache.adMedia);
				});							
			}, function(err){
				KalturaLogger.error('Failed to get ts data from file system [' + adTsPath + ']: ' + err);
				return;
			});
		}
		else{
			var ffprobePath = KalturaConfig.config.bin.binDir + '/ffprobe';
			if(KalturaConfig.config.bin.ffprobePath){
				ffprobePath = KalturaConfig.config.bin.ffprobePath;
			}

			KalturaLogger.debug('Saving path[' + adPath + '] server-ad [' + serverAdKey + ']');
			
			kaltura.tsPreparer.prepareTsFiles(ffprobePath, [adPath], function(err, data){
				if(err){
					KalturaLogger.error('Failed in prepareTsFiles for [' + serverAdKey + ']: ' + err);
					return;	
				}
				//permanently save ts's on file system
				writeTsFile(data);
			
				KalturaLogger.debug('Saving to cache [' + serverAdKey + ']');
				kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache, serverAdKey, data, KalturaConfig.config.cache.adMedia, function(error){
					if(error){
						KalturaLogger.error('Failed to save in cache [' + serverAdKey + ']: ' + error);
						return;
					}			
					KalturaCache.set(KalturaCache.getKey(KalturaCache.METADATA_READY_KEY_PREFIX, [serverAdId]), true, KalturaConfig.config.cache.adMedia);
				});				
			});			
		}		
	});
};


/**
 * Executes ffmpef 
 * 
 * @param serverAdId
 * @param sourcePath
 * @param encodingParams
 */
KalturaAdManager.prototype.exec = function(serverAdId, sourcePath, encodingParams){
	var adPath = KalturaUtils.buildFilePath('ad_transcode', serverAdId);
	var This = this;
	fs.exists(adPath, function(exists){
		if(exists){
			KalturaLogger.debug('File [' + adPath + '] already exists on the file system');
			This.save(serverAdId, adPath);
		}
		else{
			var ffmpegPath = KalturaConfig.config.bin.binDir + '/ffmpeg';
			if(KalturaConfig.config.bin && KalturaConfig.config.bin.ffmpegPath){
				ffmpegPath = KalturaConfig.config.bin.ffmpegPath;
			}
			var maxFfmpegProcesses = 10;
			if(KalturaConfig.config.ad.ffmpeg_max_processes){
					maxFfmpegProcesses = parseInt(KalturaConfig.config.ad.ffmpeg_max_processes);
			}
			var ffmpegProcessesCmd = KalturaConfig.config.bin.binDir + '/count_ffmpeg_processes.sh ' + ffmpegPath;
			ffmpegProcessesCmd.exec(function(numberOfProccesses){
				if(parseInt(numberOfProccesses.trim()) > maxFfmpegProcesses){
					KalturaLogger.error('Number of ffmpeg processes exceeded [' + numberOfProccesses + '], file ['+ adPath + ']');
					var sleepInterval = 2000;
                    if(KalturaConfig.config.ad.sleepInterval){
                        sleepInterval = parseInt(KalturaConfig.config.ad.sleepInterval);
                    }
                    setTimeout(This.exec, sleepInterval * 1000, serverAdId, sourcePath, encodingParams);
				}
				else{
					KalturaLogger.log('Number of ffmpeg processes is [' + numberOfProccesses + '], transcoding file ['+ adPath + ']');
					var tempPath = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();
					var cmd = [
								ffmpegPath + '-queued.sh', 
								'-i',
								sourcePath, 
								encodingParams, 
								'-y',
								tempPath];
							cmd = cmd.join(' ');
							
							cmd.exec(function(output){
								KalturaLogger.log('Moving temp file[' + tempPath + '] to [' + adPath + ']');
								KalturaUtils.createFilePath(adPath, function(){
									fs.rename(tempPath, adPath, function(){
										This.save(serverAdId, adPath);
									}, 
									function(error){
										KalturaLogger.error('Failed to transcode [' + sourcePath + '] encoding params [' + encodingParams + '],' + error);
									});																					
								});
						});			
				}					
			});	
		}
	});
};


/**
 * Stitch ad
 * 
 * @action ad.stitch
 * 
 * @param serverAdId
 * @param url
 * @param headers
 * @param renditionId
 */
KalturaAdManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['serverAdId', 'renditionId', 'sharedFilePath']);
	if(!params)
		return;
	
	response.dir(params);

	var This = this;
		
	var encodingKey = KalturaCache.getKey(KalturaCache.ENCODING_PARAMS_KEY_PREFIX, [params.renditionId]);
	KalturaCache.get(encodingKey, function(encodingParams){
		response.debug('handled');
		This.okResponse(response, 'OK', 'text/plain');
			
		This.exec(params.serverAdId, params.sharedFilePath, encodingParams);
	}, function(err){
		response.error(err);
		This.errorResponse(response, 500, err);
	});

};


module.exports.KalturaAdManager = KalturaAdManager;
