var util = require('util');
var crypto = require('crypto');
var child_process = require('child_process');
var os = require('os');
var fs = require('fs');
var url = require('url');
require('follow-redirects').maxRedirects = 12;
var http = require('follow-redirects').http;
http.globalAgent.maxSockets = Infinity;
var https = require('follow-redirects').https;
https.globalAgent.maxSockets = Infinity;
var mkdirp = require('mkdirp');
var path = require('path');

var DOWNLOAD_RETRY_INTERVAL = 2;

// add startsWith/endsWith functions to string
if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function(str) {
		return this.slice(0, str.length) == str;
	};
}

if (typeof String.prototype.endsWith != 'function') {
	String.prototype.endsWith = function(str) {
		return this.slice(-str.length) == str;
	};
}

if (typeof String.prototype.md5 != 'function') {
	String.prototype.md5 = function() {
		return crypto.createHash('md5').update(new Buffer(this.toString())).digest('hex');
	};
}

if (typeof String.prototype.exec != 'function') {
	String.prototype.exec = function(callback, errorCallback) {
		var cmd = this;
		var childProcess = child_process.exec(cmd, function (error, stdout, stderr) {
			KalturaLogger.log('Command: ' + cmd);
			KalturaLogger.debug('Standard output: ' + stdout);
			
			if(stderr.length){
				KalturaLogger.log('Standard error: ' + stderr);
			}
			
		    if (error) {
		    	if(errorCallback){
		    		errorCallback(error);
		    	}
		    	else{
		    		var exception = new Error();
		    		KalturaLogger.error('Exec: ' + error + '\n' + exception.stack);
		    	}
		    }
		    else if(callback){
		    	callback(stdout);
		    }
		});

		KalturaLogger.debug('Started cli process [' + childProcess.pid + ']: ' + cmd);
	};
}

if (typeof Array.prototype.unique != 'function') {
	Array.prototype.unique = function() {
	    return this.reduce(function(p, c) {
	        if (p.indexOf(c) < 0)
	        	p.push(c);
	        return p;
	    }, []);
	};
}

if (typeof Array.prototype.diff != 'function') {
	Array.prototype.diff = function(arr) {
		var retArr = [];
		
		thisLoop: for (var k = 0; k < this.length; k++) {
		    for (var i = 0; i < arr.length; i++) {
		    	if(this[k] == arr[i]){
		    		continue thisLoop;
		    	}
		    }
		    retArr.push(this[k]);
		}
		return retArr;
	};
}

if (typeof Buffer.prototype.md5 != 'function') {
	Buffer.prototype.md5 = function() {
		return crypto.createHash('md5').update(this).digest('hex');
	};
}

KalturaUtils = {
	getUniqueId : function(){
		return Math.floor(Math.random() * 10000000000000001).toString(36);
	},

	seconds2npt: function( sec, show_ms ) {
		if ( isNaN( sec ) ) {
			return '0:00:00';
		}
	
		var tm = KalturaUtils.seconds2Measurements( sec );
	
		// Round the number of seconds to the required number of significant
		// digits
		if ( show_ms ) {
			tm.seconds = Math.round( tm.seconds * 1000 ) / 1000;
		} else {
			tm.seconds = Math.round( tm.seconds );
		}
		if ( tm.seconds < 10 ){
			tm.seconds = '0' +	tm.seconds;
		}
		var hoursStr;
		if( tm.hours == 0 ){
			hoursStr = '';
		} else {
			if ( tm.minutes < 10 )
				tm.minutes = '0' + tm.minutes;
	
			hoursStr = tm.hours + ":";
		}
		return hoursStr + tm.minutes + ":" + tm.seconds;
	},

	seconds2Measurements: function ( sec ){
		var tm = {};
		tm.days = Math.floor( sec / ( 3600 * 24 ) );
		tm.hours = Math.floor( Math.round( sec ) / 3600 );
		tm.minutes = Math.floor( ( Math.round( sec ) / 60 ) % 60 );
		tm.seconds = Math.round(sec) % 60;
		return tm;
	},
	
	getHttpModuleByProtocol : function(protocol, urlStr){
		if(!protocol){
			var parsedUrl = url.parse(urlStr);
			protocol = parsedUrl.protocol;
		}
		if(protocol == 'https:'){
			return https;
		}
		return http;
	},
	
	downloadMultiHttpUrls : function(urls, filePaths, successCallback, errorCallback) {
		var missingResults = urls.length;

		if(!filePaths){
			filePaths = [];
			for(var i = 0; i < urls.length; i++){
				filePaths[i] = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();
			}
		}
		
		var singleSuccessCallback = function(){
			missingResults--;
			
			if(!missingResults){
				successCallback(filePaths);
			}
		};
		
		for(var i = 0; i < urls.length; i++){
			KalturaUtils.downloadHttpUrl(urls[i], {filePath: filePaths[i]}, singleSuccessCallback, errorCallback);
		}
	},

	getHttpUrl : function(urlStr, headers, successCallback, errorCallback) {
		var parsedUrl = url.parse(urlStr);
		var httpModule = KalturaUtils.getHttpModuleByProtocol(parsedUrl.protocol);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};
		if (headers){
			options.headers = headers;
		}

		var request = httpModule.request(options, function(response) {
			var fullData = '';
			response.on('data', function(data) {
				fullData += data;
			});
			response.on('end', function() {
				if(response.statusCode != 200){
					if(errorCallback){
						return errorCallback('Invalid http status: ' + response.statusCode);
					}
					else{
						KalturaLogger.error('Invalid http status: ' + response.statusCode + ' while trying to fetch ' + urlStr);
						return;
					}
				}
				if(successCallback){
					successCallback(fullData);
				}
			});
		});

		request.on('error', function(e) {
			if(errorCallback){
				errorCallback(e.message);
			}
		});

		request.end();
	},
	
	md5OnFile : function(urlStr, headers, bytes, successCallback, errorCallback) {
		KalturaLogger.log('Calculate md5 for [' + urlStr + '] bytes [' + bytes + ']');
		var parsedUrl = url.parse(urlStr);
		var httpModule = KalturaUtils.getHttpModuleByProtocol(parsedUrl.protocol);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};
		if (headers){
			options.headers = headers;
		}

		var hash = crypto.createHash('md5');
		
		var request = httpModule.request(options, function(response) {
			var length = 0;
			var actualMd5Length = 0;
			response.on('data', function(data) {	
				if(length < bytes){
					length += data.length; 					
					if (length >= bytes){
						var sliceData = data.slice(0, data.length - (length - bytes));
						hash.update(sliceData);
						actualMd5Length += sliceData.length;
						response.destroy();
					}
					else{
						hash.update(data);
						actualMd5Length += data.length;
					}
				}
			});
			response.on('end', function() {
				if(response.statusCode != 200){
					if(errorCallback){
						return errorCallback('Invalid http status: ' + response.statusCode);
					}
					else{
						KalturaLogger.error('Invalid http status: ' + response.statusCode + ' while trying to fetch ' + urlStr);
						return;
					}
				}
				if(successCallback){
					KalturaLogger.log('Downloaded [' + length + '] bytes, md5 calculated for [' + actualMd5Length + '] bytes');
					successCallback(hash.digest('hex'));
				}
			});
		});

		request.on('error', function(e) {
			if(errorCallback){
				errorCallback(e.message);
			}
		});

		request.end();
	},
	
	buildFilePath: function(baseDir, fileName){
		
		if(!fileName)
			return;
		var dir1 = fileName.substring(0,2);	
		var dir2 = fileName.substring(2,4);
		return path.join(KalturaConfig.config.cloud.sharedBasePath, baseDir, dir1, dir2, fileName);
	},
	
	createFilePath : function(filePath, successCallback, errorCallback) {
		var dirName= path.dirname(filePath);
		mkdirp(dirName, function (err) {
		    if (err){
		    	if(errorCallback){
		    		errorCallback(err);
		    	}
		    	else{
		    		KalturaLogger.error('Failed to create dir path: ' + err);
		    	}
		    }
		    else{
		    	successCallback();
		    }
		});
	},

	downloadHttpUrl : function(urlStr, options, successCallback, errorCallback) {
		if (typeof urlStr !== 'string' && !(urlStr instanceof String)){
			return errorCallback('Invalid type of url supplied - only string allowed , got :' + urlStr);
		}

		KalturaLogger.debug('Starting download [' + urlStr + ']');
		
		var watchFileOnFs = function(filePath, retries, successCallback, errorCallback){
			KalturaLogger.log('Watching file download to: [' + filePath + '] retries left' + '[' + retries + ']');
			setTimeout(function(){
				fs.exists(filePath, function(exists){
					if(exists){
						KalturaLogger.log('File from url [' + urlStr + '], already downloaded to [' + filePath + ']');
						successCallback(filePath);															
					}
					else{
						retries --;
						if(retries == 0)
							return errorCallback('download timeout');

						watchFileOnFs(filePath, retries, successCallback, errorCallback);						
					}
				});
			}, DOWNLOAD_RETRY_INTERVAL * 1000);			
		};
		
		var tempPath = null;

		fs.exists(options.filePath, function(exists){
			if(exists){
				KalturaLogger.log('File from url [' + urlStr + '], already downloaded to [' + options.filePath + ']');
				successCallback(options.filePath);
			}
			else{
				var fileDownloadingKey = KalturaCache.getKey(KalturaCache.FILE_DOWNLOADING_KEY_PREFIX, [options.filePath]);
				KalturaCache.add(fileDownloadingKey, true, KalturaConfig.config.cache.fileDownloadTimeout, function(){										
					tempPath = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();	
					KalturaLogger.log('File from url [' + urlStr + '], downloading to temp path[' + tempPath + ']');
					
					var parsedUrl = url.parse(urlStr);
					var httpModule = KalturaUtils.getHttpModuleByProtocol(parsedUrl.protocol);
					options.hostname = parsedUrl.hostname;
					options.port = parsedUrl.port;
					options.path = parsedUrl.path;
					options.method = 'GET';

					var localFile = fs.createWriteStream(tempPath);
					var request = httpModule.request(options, function(response) {
						response.pipe(localFile);

						localFile.on('finish', function() {
							localFile.close();
							KalturaUtils.createFilePath(options.filePath, function(){
								KalturaLogger.log('Moving temp file[' + tempPath + '] to [' + options.filePath + ']');
								fs.rename(tempPath, options.filePath, function(){
									successCallback(options.filePath);
								});																	
							}, errorCallback);		
					    });
						
						response.on('data', function() { /* do nothing */ });
						
						response.on('end', function() { /* do nothing */ });
					});
					
					request.on('error', function(e) {
						errorCallback(e.message);
					});

					request.end();
					
				}, function (err) {
					// retry check if file is on file system
					KalturaLogger.log('File from url [' + urlStr + '] already downloading');
					var retries = KalturaConfig.config.cache.fileDownloadTimeout / DOWNLOAD_RETRY_INTERVAL;
					watchFileOnFs(options.filePath, retries, successCallback, errorCallback);
				});																
							
			}
				
		});
	},
	
	readFromFileByLength : function(fd, callback, errorCallback){
		var buffer = new Buffer(4);
		fs.read(fd, buffer, 0, 4, null, function(err, bytesRead, buffer){
			if(err){
				errorCallback(err);
				return;
			}
			var length = buffer.readUInt32BE(0);
			var itemBuffer = new Buffer(length);
			fs.read(fd, itemBuffer, 0, length, null, function(err, bytesRead, itemBuffer){
				if(err){
					errorCallback(err);
					return;
				}
				callback(itemBuffer);
			});
		});						
	},
	
	writeToFileByLength : function(fd, data){
		var lBuffer = new Buffer(4);
		lBuffer.writeUInt32BE(data.length, 0);
		fd.write(lBuffer);
		fd.write(data);
	},
	
	getCurrentDc: function(){
		return os.hostname().substring(0, 2);
	},
	
	downloadHttpUrlForce: function(urlStr, downloadToBuffer, downloadToFile, callback, errorCallback){		
		KalturaLogger.debug('Starting download [' + urlStr + ']');

		parsedUrl = url.parse(urlStr);
		var options = {
			hostname : parsedUrl.hostname,
			port : parsedUrl.port,
			path : parsedUrl.path,
			method : 'GET',
		};

		var This = this;
		var httpModule = KalturaUtils.getHttpModuleByProtocol(parsedUrl.protocol);
		var request = httpModule.request(options, function(response) {
			if (response.statusCode != 200) {
				if(errorCallback){
					errorCallback('Invalid http status: ' + response.statusCode);
				}
				else{
					KalturaLogger.error('Failed to download url [' + urlStr + ']: Invalid http status: ' + response.statusCode);
				}
				
				return;
			}

			var localPath = null;
			if(downloadToFile){				
				localPath = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();
				KalturaLogger.log('Downloading from url [' + urlStr + '] to [' + localPath +']');
				var localFile = fs.createWriteStream(localPath);
				response.pipe(localFile);
			}
			
			var buffers = [];
			response.on('data', function(data) {
				if(downloadToBuffer){
					buffers.push(data);
				}				
			});
			response.on('end', function() {
				KalturaLogger.log('Finished downloading from url [' + urlStr + ']');
				if(callback){
					callback(buffers, localPath);
				}				
			});
		});

		request.on('error', function(e) {
			if(errorCallback){
				errorCallback('http error: ' + e.message);
			}
			else{
				KalturaLogger.error('Failed to download url [' + urlStr + ']: http error: ' + e.message);
			}
		});

		request.end();
	},

	encodeString: function(str){
		if (str && (typeof str === 'string' || str instanceof String))
		{
			//const uriEncoded = encodeURI(str);
			//return new Buffer(uriEncoded).toString('base64');
			return Buffer.from(str, 'utf8').toString('hex');
		}
		return str;
	},

	decodeString: function(str){
		if (str && (typeof str === 'string' || str instanceof String))
		{
			//const base64Decoded = new Buffer(str, 'base64').toString();
			//return decodeURI(base64Decoded);
			return Buffer.from(str, 'hex').toString();
		}
		return str;
	}
};

