
var util = require('util');
var crypto = require('crypto');
var child_process = require('child_process');

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
		return crypto.createHash('md5').update(new Buffer(this)).digest('hex');
	};
}

if (typeof String.prototype.exec != 'function') {
	String.prototype.exec = function(callback, errorCallback) {
		var cmd = this;
		var childProcess = child_process.exec(cmd, function (error, stdout, stderr) {
			KalturaLogger.log('Command: ' + cmd);
			KalturaLogger.debug('Standard output: ' + stdout);
			
			if(stderr.length){
				KalturaLogger.error('Command: ' + cmd);
				KalturaLogger.error('Standard error: ' + stderr);
			}
			
		    if (error) {
		    	if(errorCallback){
		    		errorCallback(error);
		    	}
		    	else{
		    		KalturaLogger.error('Exec: ' + error);
		    	}
		    }
		    else if(callback){
		    	callback(stdout);
		    }
		});

		KalturaLogger.log('Started cli process [' + childProcess.pid + ']: ' + cmd);
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
	}
};

