// consider doing something like:
//	http://stackoverflow.com/questions/10985350/how-do-i-use-node-js-http-proxy-for-logging-htttp-traffic-in-a-computer

var fs = require('fs');
var formatTime = require('./formatTime');

const PRINTED_REQUEST_HEADERS = ['referrer', 'user-agent', 'x-kaltura-f5-https', 'host', 'x-forwarded-for', 'x-forwarded-server', 'x-forwarded-host', 'x-kaltura-f5-https'];
const PRINTED_RESPONSE_HEADERS = ['content-range', 'cache-control', 'x-kaltura-session'];
const REQUEST_LOGGING_TIMEOUT = 30000;

function quoteVar(val) {
	if (!val) {
		return '-';
	}
	
	return '"' + val + '"';
}

var accessLogFile = fs.openSync('/var/log/node/access_log', 'a');

function writeLogLine(req, res, statusCode, startTime, savedHeaders) {
	var executionTime = (new Date().getTime()) - startTime;
	var i;

	// add basic info
	var logLine = req.connection.remoteAddress + ' ' + 
		formatTime.getDateTime() + ' ' + 
		quoteVar(req.method + ' ' + req.url + ' ' + 'HTTP/' + req.httpVersion) + ' ' + 
		statusCode + ' ' + 
		Math.floor(executionTime / 1000) + '/' + (executionTime * 1000);
		
	// add the request headers
	for (i = 0; i < PRINTED_REQUEST_HEADERS.length; i++) {
		var curHeader = PRINTED_REQUEST_HEADERS[i];
		logLine += ' ' + quoteVar(req.headers[curHeader]);
	}
		
	// add the response headers
	for (i = 0; i < PRINTED_RESPONSE_HEADERS.length; i++) {
		var curHeader = PRINTED_RESPONSE_HEADERS[i];
		if (!savedHeaders[curHeader] && res.getHeader(curHeader))
			logLine += ' ' + quoteVar(res.getHeader(curHeader));
		else
			logLine += ' ' + quoteVar(savedHeaders[curHeader]);
	}

	// write the log line to file
	logLine += '\n';
	
	fs.writeSync(accessLogFile, logLine);
}

function AccessLogWriter(req, res) {
	var savedHeaders = {};
	var startTime = new Date().getTime();
	
	// set a timer to write a log line in case the request hangs
	var completeTimerId = setTimeout(function () {
		writeLogLine(req, res, 0, startTime, savedHeaders);
	}, REQUEST_LOGGING_TIMEOUT);

	// hook writeHead in order to save response headers
	var origWriteHead = res.writeHead;
	res.writeHead = function (statusCode, reasonPhrase, headers) {		
		for (var i = 0; i < PRINTED_RESPONSE_HEADERS.length; i++) {
			var curHeader = PRINTED_RESPONSE_HEADERS[i];
			savedHeaders[curHeader] = res.getHeader(curHeader);
			if (headers && headers[curHeader])
				savedHeaders[curHeader] = headers[curHeader];
		}
		
		// call the original
		res.writeHead = origWriteHead;
		res.writeHead(statusCode, reasonPhrase, headers);
	};

	// hook end in order to print the log line on completion
	var origEnd = res.end;
	res.end = function(data, enc) {
		clearTimeout(completeTimerId);
		writeLogLine(req, res, res.statusCode, startTime, savedHeaders);
		
		// call the original
		res.end = origEnd;
		res.end(data, enc);
	};
}

module.exports = AccessLogWriter;
