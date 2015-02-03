
var util = require('util');
var crypto = require('crypto');
var child_process = require('child_process');
var os = require('os');
var fs = require('fs');
var url = require('url');
var http = require('follow-redirects').http;

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
	
	downloadMultiHttpUrls : function(urls, filePaths, successCallback, errorCallback) {
		var missingResults = urls.length;

		if(!filePaths){
			filePaths = [];
			for(var i = 0; i < urls.length; i++){
				filePaths[i] = os.tmpdir() + '/' + KalturaUtils.getUniqueId();
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

	downloadHttpUrl : function(urlStr, options, successCallback, errorCallback) {
		
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
				var fileDownloadingKey = KalturaCache.getFileDownloading(options.filePath);
				KalturaCache.add(fileDownloadingKey, true, KalturaConfig.config.cache.fileDownloadTimeout, function(){										
					tempPath = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();	
					KalturaLogger.log('File from url [' + urlStr + '], downloading to temp path[' + tempPath + ']');
					
					parsedUrl = url.parse(urlStr);
					options.hostname = parsedUrl.hostname;
					options.port = parsedUrl.port;
					options.path = parsedUrl.path;
					options.method = 'GET';

					var localFile = fs.createWriteStream(tempPath);
					var request = http.request(options, function(response) {
						response.pipe(localFile);

						localFile.on('finish', function() {
							localFile.close();
							KalturaLogger.log('Moving temp file[' + tempPath + '] to [' + options.filePath + ']');
							fs.rename(tempPath, options.filePath, function(){
								successCallback(options.filePath);
							});											
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
};

