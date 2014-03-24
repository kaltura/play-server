
var os = require('os');
var fs = require('fs');
var util = require('util');

var KalturaUtils = require('./KalturaUtils');

var kaltura = {
	client: require('./client/KalturaClientBase')
};

KalturaLogger = {
	hostname: os.hostname(),
	debugEnabled: false,
	accessLogFile: null,
	logFile: null,
	errorFile: null,

	accessRequestHeaders: ['referrer', 'user-agent', 'x-kaltura-f5-https', 'host', 'x-forwarded-for', 'x-forwarded-server', 'x-forwarded-host'],
	accessResponseHeaders: ['content-range', 'cache-control', 'x-kaltura-session'],

	init: function(config){
		if(config.debugEnabled){
			this.debugEnabled = config.debugEnabled;
		}
		if(config.accessRequestHeaders){
			this.accessRequestHeaders = config.accessRequestHeaders.split(',');
		}
		if(config.accessResponseHeaders){
			this.accessResponseHeaders = config.accessResponseHeaders.split(',');
		}
		
		if(config.accessLogPath){
			this.accessLogFile = fs.openSync(config.accessLogPath, 'a');		
		}
		
		if(config.logPath){
			this.logFile = fs.openSync(config.logPath, 'a');			
		}
		
		if(config.errorPath){
			this.errorFile = fs.openSync(config.errorPath, 'a');			
		}
	},
	
	getDateTime: function () {
	    var date = new Date();

	    var hour = date.getHours();
	    hour = (hour < 10 ? "0" : "") + hour;

	    var min  = date.getMinutes();
	    min = (min < 10 ? "0" : "") + min;

	    var sec  = date.getSeconds();
	    sec = (sec < 10 ? "0" : "") + sec;

	    var year = date.getFullYear();

	    var month = date.getMonth() + 1;
	    month = (month < 10 ? "0" : "") + month;

	    var day  = date.getDate();
	    day = (day < 10 ? "0" : "") + day;

	    return year + "/" + month + "/" + day + " " + hour + ":" + min + ":" + sec;
	},
	
	prefix: function(stackSource){
		var time = this.getDateTime();
		
		if(!stackSource)
			stackSource = new Error();
		var stack = stackSource.stack.split('\n');
		var stackLevel = 3;
		var line = stack[stackLevel].trim().split(' ');
		line = line[1];
		if(line.startsWith('Object.'))
			line = line.substr(7);
		else if(line.indexOf('/') > 0)
			line = line.substr(line.lastIndexOf('/') + 1);
		else if(line.indexOf('\\') > 0)
			line = line.substr(line.lastIndexOf('\\') + 1);
		
		return '[' + process.pid + '][' + time + '][' + line + ']';
	},
	
	write: function(str){
		if(this.logFile){
			fs.writeSync(this.logFile, str);
		}
		else{
			console.log(str);
		}
	},
	
	debug: function(str, stackSource){
		if(this.debugEnabled)
			this.write(this.prefix(stackSource) + ' DEBUG: ' + str);
	},
	
	log: function(str, stackSource){
		this.write(this.prefix(stackSource) + ' INFO: ' + str);
	},
	
	error: function(str, stackSource){
		str = this.prefix(stackSource) + ' ERROR: ' + str;
		if(this.errorFile){
			fs.writeSync(this.errorFile, str);
		}
		else{
			console.error(str);
		}
	},
	
	dir: function(object, stackSource, prefix){
		this.write(this.prefix(stackSource) + ' INFO: ' + (prefix ? prefix : '') + util.inspect(object, { showHidden: true, depth: null }));
	},

	quoteVar: function(val) {
		if (!val) {
			return '-';
		}

		return '"' + val + '"';
	},
	
	access: function(request, response){
		var startTime = new Date().getTime();
		response.requestId = KalturaUtils.getUniqueId();

		if(request.headers['x-forwarded-for']){
			var forwardeds = request.headers['x-forwarded-for'].split(',');
			request.ip = forwardeds[0].trim();
		}
		else{
			request.ip = request.connection.remoteAddress || 
			request.socket.remoteAddress ||
			request.connection.socket.remoteAddress;
		}
		
		response.log = function(msg){
			KalturaLogger.log('Request [' + response.requestId + '] ' + msg);
		};
		response.dir = function(object){
			KalturaLogger.dir(object, null, 'Request [' + response.requestId + '] ');
		};
		response.error = function(msg){
			KalturaLogger.error('Request [' + response.requestId + '] ' + msg);
		};

		if(this.accessLogFile){
			var responseEnd = response.end;
			response.end = function(body){
				var executionTime = (new Date().getTime()) - startTime;
				var logLine = request.ip + ' ' + KalturaLogger.getDateTime() + ' "' + request.method + ' ' + request.url + ' HTTP/' + request.httpVersion + '" ' + response.statusCode;
				logLine += ' [' + response.requestId + ']';
				logLine += ' ' + Math.floor(executionTime / 1000) + '/' + (executionTime * 1000);
	
				// add the request headers
				for (var i = 0; i < KalturaLogger.accessRequestHeaders.length; i++) {
					var curHeader = KalturaLogger.accessRequestHeaders[i];
					logLine += ' ' + KalturaLogger.quoteVar(req.headers[curHeader]);
				}
	
				// add the response headers
				for (var i = 0; i < KalturaLogger.accessResponseHeaders.length; i++) {
					var curHeader = KalturaLogger.accessResponseHeaders[i];
					if (!savedHeaders[curHeader] && res.getHeader(curHeader))
						logLine += ' ' + KalturaLogger.quoteVar(res.getHeader(curHeader));
					else
						logLine += ' ' + KalturaLogger.quoteVar(savedHeaders[curHeader]);
				}
	
				fs.writeSync(this.accessLogFile, str);
				responseEnd.apply(response, [body]);
			};
		}
		
		response.log(request.url);
	    
		response.setHeader("X-Me", this.hostname);
		response.setHeader("X-Kaltura-Session", response.requestId);
	}
};

util.inherits(KalturaLogger, kaltura.client.IKalturaLogger);

module.exports = KalturaLogger;
