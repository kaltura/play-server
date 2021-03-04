
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
var UDG_PREFIX = 'udg://';

var KalturaOutputWriter = function(fileName) {
	this.fileName = null;
	this.file = null;
	this.udg = null;
	if (fileName && fileName.startsWith(UDG_PREFIX)) {
		this.udg = unix.createSocket('unix_dgram');
		this.bindUdgSocket(this.udg, fileName.substr(UDG_PREFIX.length));
	}
	else if (fileName) {
		this.fileName = fileName;
		this.file = fs.openSync(fileName, 'a');
	}
	else {
		console.log('Error initialize log output writer for [' + fileName + ']');
	}
};

KalturaOutputWriter.prototype.bindUdgSocket = function(udgSocket, udgPath) {
	udgSocket.on('error', function(err) {
		console.error("Error while connecting/sending to Unix domain socket. Consider changing logCompressor configuration. Error for " + udgPath + ": [" + err + "]");
	});

	udgSocket.on('connect', function() {
		udgSocket.on('congestion', function() {console.log('congestion');});
		udgSocket.on('writable',   function() {console.log('writable');});
	});
	udgSocket.connect(udgPath);
};

KalturaOutputWriter.prototype.notifyLogsRotate = function() {
	if (this.udg) return;

	var newFileHandler = fs.openSync(this.fileName, 'a');
	var oldFileHandler = this.file;
	this.file = newFileHandler;
	fs.closeSync(oldFileHandler);	 
};

KalturaOutputWriter.prototype.write = function(str) {
	if (this.udg) {
		this.udg.send(new Buffer(str + '\n'));
	}
	else if(this.file){
		fs.writeSync(this.file, str + '\n');
	}
	else{
        	console.log(str);
	}
};




KalturaLogger = {
	config: null,
	hostname: os.hostname(),
	debugEnabled: false,
	largeDataDebugEnabled: false,
	logOutputWriter: null,
	errorOutputWriter: null,
	accessOutputWriter: null,


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

        	KalturaLogger.logOutputWriter =    new KalturaOutputWriter(KalturaLogger.config.logName);
		KalturaLogger.errorOutputWriter =  new KalturaOutputWriter(KalturaLogger.config.errorLogName);
		KalturaLogger.accessOutputWriter = new KalturaOutputWriter(KalturaLogger.config.accessLogName);
	},

	
	notifyLogsRotate: function(){
		KalturaLogger.logOutputWriter.notifyLogsRotate();
		KalturaLogger.errorOutputWriter.notifyLogsRotate();
		KalturaLogger.accessOutputWriter.notifyLogsRotate();	
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
		 KalturaLogger.logOutputWriter.write(str);
	},
	
	writeError: function(str){
		this.write(str);
		KalturaLogger.errorOutputWriter.write(str);
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
			
			KalturaLogger.accessOutputWriter.write(logLine + '\n');
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
