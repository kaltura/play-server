
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

	var serverAdKey = KalturaCache.getAdMedia(serverAdId);
	var adTsPath = KalturaConfig.config.cloud.sharedBasePath + '/ad_ts/' + serverAdId;
	
	var writeTsFile = function(data){
		var fd = fs.createWriteStream(adTsPath);
		fd.on('finish', function () {
			  KalturaLogger.log('Ad ts saved to file system [' + adTsPath + ']');
		});
		
		KalturaUtils.writeToFileByLength(fd, data.metadata);
		KalturaUtils.writeToFileByLength(fd, data.data);
		KalturaUtils.writeToFileByLength(fd, data.header);

		fd.end();		
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
				kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache.binserverSet, serverAdKey, data, KalturaConfig.config.cache.adMedia, function(error){
					if(error){
						KalturaLogger.error('Failed to save in cache [' + serverAdKey + ']: ' + error);
						return;
					}			
					KalturaCache.set(KalturaCache.getMetadataReady(serverAdId), true, KalturaConfig.config.cache.adMedia);
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
				kaltura.tsPreparer.savePreparedTsToMemcache(KalturaCache.binserverSet, serverAdKey, data, KalturaConfig.config.cache.adMedia, function(error){
					if(error){
						KalturaLogger.error('Failed to save in cache [' + serverAdKey + ']: ' + err);
						return;
					}			
					KalturaCache.set(KalturaCache.getMetadataReady(serverAdId), true, KalturaConfig.config.cache.adMedia);
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
	var adPath = KalturaConfig.config.cloud.sharedBasePath + '/ad_transcode/' + serverAdId;
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
			
			var cmd = [
				ffmpegPath, 
				'-i',
				sourcePath, 
				encodingParams, 
				'-y',
				adPath];
			cmd = cmd.join(' ');
			
			cmd.exec(function(output){
				This.save(serverAdId, adPath);
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
 * @param encodingId
 */
KalturaAdManager.prototype.stitch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['serverAdId', 'encodingId', 'sharedFilePath']);
	if(!params)
		return;
	
	response.dir(params);

	var This = this;
		
	var encodingKey = KalturaCache.getEncodingParams(params.encodingId);
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
