
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
				KalturaLogger.error('Standard error: ' + stderr);
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
	}
};

