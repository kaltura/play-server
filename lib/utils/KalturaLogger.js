
var os = require('os');
var fs = require('fs');
var util = require('util');
var unix = require('unix-dgram');
var dateFormat = require('dateformat');

var kaltura = {
	client: require('../client/KalturaClient')
};

var OBJECT_OBJECT_PREFIX = '[object Object].';
var OBJECT_PREFIX = 'Object.';

KalturaLogger = {
	config: null,
	hostname: os.hostname(),
	debugEnabled: false,
	largeDataDebugEnabled: false,
	useLogCompressor: false,
	accessLogFile: null,
	accessSock: null,
	logFile: null,
	logSock: null,
	errorFile: null,
	errorSock: null,

	accessRequestHeaders: ['referrer', 'user-agent', 'x-kaltura-f5-https', 'host', 'x-forwarded-for', 'x-forwarded-server', 'x-forwarded-host'],
	accessResponseHeaders: ['content-range', 'cache-control', 'x-kaltura-session'],

	init: function(){
		if(!KalturaConfig.config.logger || KalturaLogger.config)
			return;

		KalturaLogger.config = KalturaConfig.config.logger;
		
		if(KalturaLogger.config.debugEnabled){
			KalturaLogger.debugEnabled = parseInt(KalturaLogger.config.debugEnabled);
		}
		if(KalturaLogger.config.largeDataDebugEnabled){
			KalturaLogger.largeDataDebugEnabled = parseInt(KalturaLogger.config.largeDataDebugEnabled);
		}
		if(KalturaLogger.config.accessRequestHeaders){
			KalturaLogger.accessRequestHeaders = KalturaLogger.config.accessRequestHeaders.split(',');
		}
		if(KalturaLogger.config.accessResponseHeaders){
			KalturaLogger.accessResponseHeaders = KalturaLogger.config.accessResponseHeaders.split(',');
		}
		if (KalturaLogger.config.useLogCompressor)
			KalturaLogger.useLogCompressor = parseInt(KalturaLogger.config.useLogCompressor);
		
		if (KalturaLogger.useLogCompressor) {
            		KalturaLogger.initLogCompressor();
	        } else {
			if (KalturaLogger.config.accessLogName) {
				KalturaLogger.accessLogFile = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.accessLogName, 'a');
			}
			if (KalturaLogger.config.logName) {
				KalturaLogger.logFile = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.logName, 'a');
			}
			if (KalturaLogger.config.errorLogName) {
				KalturaLogger.errorFile = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.errorLogName, 'a');
			}
		}
	},

	initLogCompressor: function() {
		var logPath = KalturaLogger.config.logDir + '/logSock';
		if (KalturaLogger.config.logSock)
			logPath = KalturaLogger.config.logDir + '/' + KalturaLogger.config.logSock;
		KalturaLogger.logSock = unix.createSocket('unix_dgram');
		KalturaLogger.bindUdgSocket(KalturaLogger.logSock, logPath);

		var accessPath = KalturaLogger.config.logDir + '/accessSock';
		if (KalturaLogger.config.accessSock)
			accessPath = KalturaLogger.config.logDir + '/' + KalturaLogger.config.accessSock;
		KalturaLogger.accessSock = unix.createSocket('unix_dgram');
		KalturaLogger.bindUdgSocket(KalturaLogger.accessSock, accessPath);

		var errorPath = KalturaLogger.config.logDir + '/errorSock';
		if (KalturaLogger.config.errorSock)
			errorPath = KalturaLogger.config.logDir + '/' + KalturaLogger.config.errorSock;
		KalturaLogger.errorSock = unix.createSocket('unix_dgram');
		KalturaLogger.bindUdgSocket(KalturaLogger.errorSock, errorPath);
	},

	bindUdgSocket: function(udgSocket, udgPath) {
		udgSocket.on('error', function(err) {
            		console.error("Error while connecting/sending to Unix domain socket. Consider changing logCompressor configuration.");
        	});

		udgSocket.on('connect', function() {
			udgSocket.on('congestion', function() {console.log('congestion');});
			udgSocket.on('writable',   function() {console.log('writable');});
		});
		udgSocket.connect(udgPath);
	},

	
	notifyLogsRotate: function(){
                if (KalturaLogger.useLogCompressor)
			return;

		if(KalturaLogger.config.accessLogName){
			var newAccessLogHandler = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.accessLogName, 'a');
			var oldAccessLogHandler = KalturaLogger.accessLogFile;
			KalturaLogger.accessLogFile = newAccessLogHandler;
			fs.closeSync(oldAccessLogHandler);				
		}
		if(KalturaLogger.config.logName){
			var newLogHandler = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.logName, 'a');
			var oldLogHandler = KalturaLogger.logFile;
			KalturaLogger.logFile = newLogHandler;
			fs.closeSync(oldLogHandler);			
		}
		if(KalturaLogger.config.errorLogName){
			var newErrorLogHandler = fs.openSync(KalturaLogger.config.logDir + '/' + KalturaLogger.config.errorLogName, 'a');
			var oldErrorLogHandler = KalturaLogger.errorFile;
			KalturaLogger.errorFile = newErrorLogHandler;
			fs.closeSync(oldErrorLogHandler);			
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
	    
	    var millisec = date.getMilliseconds();

	    var year = date.getFullYear();

	    var month = date.getMonth() + 1;
	    month = (month < 10 ? "0" : "") + month;

	    var day  = date.getDate();
	    day = (day < 10 ? "0" : "") + day;

	    return year + "/" + month + "/" + day + " " + hour + ":" + min + ":" + sec + "." + millisec;
	},
	
	prefix: function(stackSource){
		var time = KalturaLogger.getDateTime();
		
		if(!stackSource)
			stackSource = new Error();
		var stack = stackSource.stack.split('\n');
		var stackLevel = 3;

		var line = stack[stackLevel].substr(stack[stackLevel].indexOf('at ') + 3);
		var identifier =  line.substr(0, line.indexOf('(')).trim();
		// this if else is to handle the Object prefix
		if (identifier.startsWith(OBJECT_OBJECT_PREFIX))
			identifier = identifier.substr(OBJECT_OBJECT_PREFIX.length);
		else if (identifier.startsWith(OBJECT_PREFIX))
			identifier = identifier.substr(OBJECT_PREFIX.length);
		// this next if else is for the case where the Object was not mantioned
		if (identifier.length == 0 && line.indexOf('/') != -1)
			identifier = line.substr(line.lastIndexOf('/') + 1);
		else if (identifier.length == 0 && line.indexOf('\\') != -1)
			identifier = line.substr(line.lastIndexOf('\\') + 1);
		return '[' + process.pid + '][' + time + '][' + identifier + ']';
	},
	
	write: function(str){
		if (KalturaLogger.logSock) {
			KalturaLogger.logSock.send(new Buffer(str + '\n'));
		} 
		else if(KalturaLogger.logFile){
			fs.writeSync(KalturaLogger.logFile, str + '\n');
		}
		else{
			console.log(str);
		}
	},
	
	writeError: function(str){
		this.write(str);
		if (KalturaLogger.errorSock) {
			KalturaLogger.errorSock.send(new Buffer(str + '\n'));
		} 
		else if(KalturaLogger.errorFile){
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

	access: function(request, response){
		var startTime = new Date().getTime();
		var responseSize = 0;
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
		var responseWrite = response.write;
		response.write = function(data) {
			if (data)
				responseSize = responseSize + data.length;
			responseWrite.apply(response, [data]);
		};
		
		var responseEnd = response.end;
		response.end = function(body){
			clearTimeout(timeout);
			if (body)
				responseSize = responseSize + body.length;
			var executionTime = (new Date().getTime()) - startTime;

       			function quoteVar(val) {
		                if (!val) return '-'; 
		                return '"' + val + '"';
        		}
			function getDefaultValue(header) {
				return '-';
			}
			function getRequestHeader(header) {
				return quoteVar(request.headers[header]);
			}
			function getResponseHeader(header) {	
				var value = savedHeaders[header];
				if (!savedHeaders[header] && response.getHeader(header))
					value = response.getHeader(header);
				return quoteVar(value);
			}

			var logLine = [request.ip, 
				getDefaultValue('remote-logname'),
				getDefaultValue('remote-user'),													
				'[' + dateFormat(new Date(), 'dd/mmm/yyyy:HH:MM:ss o') + ']',
				'"' + request.method + ' ' + request.url + ' HTTP/' + request.httpVersion + '"',
				response.statusCode,
				responseSize,									   
				Math.floor(executionTime / 1000) + '/' + (executionTime * 1000),
				getRequestHeader('referer'),
    				getRequestHeader('user-agent'),
				getRequestHeader('x-kaltura-f5-https'),
 				getRequestHeader('x-kaltura-f5-remote-addr'),
				getResponseHeader('x-kaltura'),
    				getRequestHeader('host'),
				getDefaultValue('pid'),
				getResponseHeader('x-kaltura-session'),
				getDefaultValue('apache-connection-status'),
				getDefaultValue('byte-received'),  
				getResponseHeader('content-range'),
				getRequestHeader('x-forwarded-for'),
				getRequestHeader('x-forwarded-server'),
				getRequestHeader('x-forwarded-host'),
				getResponseHeader('cache-control'),
				getDefaultValue('partner-id'),
				getRequestHeader('x-kaltura-f5-ext-ip'),
				getRequestHeader('x-kaltura-f5-ext-hops'),
				getDefaultValue('nginx-connection'),
				getResponseHeader('x-kaltura-session')].join(' ');
			
			if(KalturaLogger.accessSock) {
				KalturaLogger.accessSock.send(new Buffer(logLine + '\n'));
			}
			else if(KalturaLogger.accessLogFile){
				fs.writeSync(KalturaLogger.accessLogFile, logLine + '\n');
			}

			KalturaLogger.write('ACCESS: ' + logLine);
			responseEnd.apply(response, [body]);
		};
		
		response.log(request.url);
	    
		response.setHeader("X-Me", KalturaLogger.hostname);
		response.setHeader("X-Kaltura-Session", response.requestId);
	}
};

KalturaLogger.init();

util.inherits(KalturaLogger, kaltura.client.IKalturaLogger);
