
var os = require('os');
var fs = require('fs');
var util = require('util');

var kaltura = {
	client: require('../client/KalturaClient')
};

KalturaLogger = {
	config: null,
	hostname: os.hostname(),
	debugEnabled: false,
	accessLogFile: null,
	logFile: null,
	errorFile: null,

	accessRequestHeaders: ['referrer', 'user-agent', 'x-kaltura-f5-https', 'host', 'x-forwarded-for', 'x-forwarded-server', 'x-forwarded-host'],
	accessResponseHeaders: ['content-range', 'cache-control', 'x-kaltura-session'],

	init: function(){
		if(!KalturaConfig.config.logger || KalturaLogger.config)
			return;

		KalturaLogger.config = KalturaConfig.config.logger;
		
		if(KalturaLogger.config.debugEnabled){
			KalturaLogger.debugEnabled = parseInt(KalturaLogger.config.debugEnabled);
		}
		if(KalturaLogger.config.accessRequestHeaders){
			KalturaLogger.accessRequestHeaders = KalturaLogger.config.accessRequestHeaders.split(',');
		}
		if(KalturaLogger.config.accessResponseHeaders){
			KalturaLogger.accessResponseHeaders = KalturaLogger.config.accessResponseHeaders.split(',');
		}
		
		if(KalturaLogger.config.accessLogName){
			KalturaLogger.accessLogFile = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.accessLogName, 'a');		
		}
		
		if(KalturaLogger.config.logName){
			KalturaLogger.logFile = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.logName, 'a');
		}
		
		if(KalturaLogger.config.errorLogName){
			KalturaLogger.errorFile = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.errorLogName, 'a');			
		}
	},
	
	rotateLogFile: function(logFileName) {
		if(logFileName == KalturaLogger.config.accessLogName){
			var newLogHandler = fs.openSync(KalturaLogger.config.logDir + '/' + logFileName, 'a');
			var oldLogHandler = KalturaLogger.accessLogFile;
			KalturaLogger.accessLogFile = newLogHandler;
			fs.closeSync(oldLogHandler);
		}
		else if(logFileName == KalturaLogger.config.logName){
			var newLogHandler = fs.openSync(KalturaLogger.config.logDir + '/' + logFileName, 'a');
			var oldLogHandler = KalturaLogger.logFile;
			KalturaLogger.logFile = newLogHandler;
			fs.closeSync(oldLogHandler);
		}
		else if(logFileName == KalturaLogger.config.errorLogName){
			var newLogHandler = fs.openSync(KalturaLogger.config.logDir + '/' + logFileName, 'a');
			var oldLogHandler = KalturaLogger.errorFile;
			KalturaLogger.errorFile = newLogHandler;
			fs.closeSync(oldLogHandler);
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
		var time = KalturaLogger.getDateTime();
		
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
		if(KalturaLogger.logFile){
			fs.writeSync(KalturaLogger.logFile, str + '\n');
		}
		else{
			console.log(str);
		}
	},
	
	writeError: function(str){
		this.write(str);
		if(KalturaLogger.errorFile){
			fs.writeSync(KalturaLogger.errorFile, str + '\n');
		}
		else{
			console.error(str);
		}
	},
	
	debug: function(str, stackSource){
		if(KalturaLogger.debugEnabled){
			KalturaLogger.write(KalturaLogger.prefix(stackSource) + ' DEBUG: ' + str);
		}
	},
	
	log: function(str, stackSource){
		KalturaLogger.write(KalturaLogger.prefix(stackSource) + ' INFO: ' + str);
	},
	
	warn: function(str, stackSource){
		KalturaLogger.writeError(KalturaLogger.prefix(stackSource) + ' WARN: ' + str);
	},
	
	error: function(str, stackSource){
		KalturaLogger.writeError(KalturaLogger.prefix(stackSource) + ' ERROR: ' + str);
	},
	
	dir: function(object, stackSource, prefix){
		KalturaLogger.write(KalturaLogger.prefix(stackSource) + ' INFO: ' + (prefix ? prefix : '') + util.inspect(object, { showHidden: true, depth: null }));
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

		var timeout = setTimeout(function(){
			response.writeHead(408, {
				'Content-Type' : 'text/plain',
				'Access-Control-Allow-Origin' : '*'
			});
			response.end('Request Timeout!');
		}, KalturaConfig.config.cloud.requestTimeout * 1000);
		
		if(request.headers['x-forwarded-for']){
			var forwardeds = request.headers['x-forwarded-for'].split(',');
			request.ip = forwardeds[0].trim();
		}
		else{
			request.ip = request.connection.remoteAddress || 
			request.socket.remoteAddress ||
			request.connection.socket.remoteAddress;
		}
		
		var getStack = function(){
			return new Error();
		};
		
		response.log = function(msg){
			KalturaLogger.log('Request [' + response.requestId + '] ' + msg, getStack());
		};
		response.dir = function(object){
			KalturaLogger.dir(object, getStack(), 'Request [' + response.requestId + '] ');
		};
		response.error = function(msg){
			KalturaLogger.error('Request [' + response.requestId + '] ' + msg, getStack());
		};
		response.debug = function(msg){
			KalturaLogger.debug('Request [' + response.requestId + '] ' + msg, getStack());
		};

		var savedHeaders = {};
		var responseWriteHead = response.writeHead;
		response.writeHead = function (statusCode, reasonPhrase, headers) {		
			for (var i = 0; i < KalturaLogger.accessResponseHeaders.length; i++) {
				var curHeader = KalturaLogger.accessResponseHeaders[i];
				savedHeaders[curHeader] = response.getHeader(curHeader);
				if (headers && headers[curHeader])
					savedHeaders[curHeader] = headers[curHeader];
			}
			
			// call the original
			responseWriteHead.apply(response, [statusCode, reasonPhrase, headers]);
		};
		
		var responseEnd = response.end;
		response.end = function(body){
			clearTimeout(timeout);
			var executionTime = (new Date().getTime()) - startTime;
			var logLine = request.ip + ' ' + KalturaLogger.getDateTime() + ' "' + request.method + ' ' + request.url + ' HTTP/' + request.httpVersion + '" ' + response.statusCode;
			logLine += ' ' + Math.floor(executionTime / 1000) + '/' + (executionTime * 1000);

			// add the request headers
			for (var i = 0; i < KalturaLogger.accessRequestHeaders.length; i++) {
				var curHeader = KalturaLogger.accessRequestHeaders[i];
				logLine += ' ' + KalturaLogger.quoteVar(request.headers[curHeader]);
			}

			// add the response headers
			for (var i = 0; i < KalturaLogger.accessResponseHeaders.length; i++) {
				var curHeader = KalturaLogger.accessResponseHeaders[i];
				if (!savedHeaders[curHeader] && response.getHeader(curHeader))
					logLine += ' ' + KalturaLogger.quoteVar(response.getHeader(curHeader));
				else
					logLine += ' ' + KalturaLogger.quoteVar(savedHeaders[curHeader]);
			}

			if(KalturaLogger.accessLogFile){
				fs.writeSync(KalturaLogger.accessLogFile, logLine + '\n');
			}

			KalturaLogger.write('ACCESS: ' + logLine);
//			if(response.statusCode != 200){
//				logLine += ' ' + body;
//				KalturaLogger.writeError('ACCESS: ' + logLine, false);
//			}
			responseEnd.apply(response, [body]);
		};
		
		response.log(request.url);
	    
		response.setHeader("X-Me", KalturaLogger.hostname);
		response.setHeader("X-Kaltura-Session", response.requestId);
	}
};
KalturaLogger.init();

util.inherits(KalturaLogger, kaltura.client.IKalturaLogger);
