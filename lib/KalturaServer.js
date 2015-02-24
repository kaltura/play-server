
var os = require('os');
var fs = require('fs');
var url = require('url');
var path = require('path');
var mime = require('mime');
var util = require('util');
var http = require('http');
var https = require('https');
var cluster = require('cluster');
var querystring = require('querystring');

var kaltura = module.exports = require('./KalturaBase');

var KalturaServer = function(){
};
util.inherits(KalturaServer, kaltura.KalturaBase);

KalturaServer.prototype.hostname = os.hostname();
KalturaServer.prototype.httpWebServer = null;
KalturaServer.prototype.httpsWebServer = null;



KalturaServer.prototype.init = function() {
	this.startWebServers();
};

KalturaServer.prototype.startWebServers = function() {
    this.httpWebServer = http.createServer();
    
    if(KalturaConfig.config.cloud.httpsPort){
    	if(!KalturaConfig.config.cloud.keyFilePath || !KalturaConfig.config.cloud.certFilePath){
    		KalturaLogger.log('Unable to locate keyFilePath || certFilePath in the configuration file. Https listener will not be created');
    		return;
    	}
    	var keyFilePath = KalturaConfig.config.cloud.keyFilePath;
    	var certFielPath = KalturaConfig.config.cloud.certFilePath;
    	
    	var options = {
    			  key: fs.readFileSync(keyFilePath),
    			  cert: fs.readFileSync(certFielPath)
    	};
        
        this.httpsWebServer = https.createServer(options);
    }
};


var KalturaMainProcess = function(){
	KalturaLogger.log('\n\n_____________________________________________________________________________________________');
	KalturaLogger.log('Play-Server started'); // TODO add version
	
	this.init();
	this.run = true;
	this.childProcesses = {};

	cluster.setupMaster({
		args: [JSON.stringify(KalturaConfig.config)]
	});
	
	this.start();
	
	var This = this;
	
	process.on('SIGUSR1', function() {
		KalturaLogger.log('Got SIGUSR1. Invoke log rotate notification.');
		This.notifyLogsRotate();
	});
		
	KalturaConfig.watchFiles(function(){
		This.restart();
	});
};
util.inherits(KalturaMainProcess, KalturaServer);

KalturaMainProcess.prototype.start = function(){
	KalturaLogger.log('Starting all child processes');
	this.run = true;
	
	var numOfCores = os.cpus().length;
	var processes = [process.pid];
	for (var i = 0; i < numOfCores; i++) {
		var childProcess = this.spawn();
		processes.push(childProcess.process.pid);
		KalturaLogger.log('Started process [' + childProcess.process.pid + ']');
	}
	
	var serverProcessesKey = KalturaCache.getServerProcesses();
	var This = this;
	KalturaCache.get(serverProcessesKey, function(data){
		if(data){
			This.restoreServerProcesses(data);
		}

		This.storeServerProcesses(processes);
	});
};

KalturaMainProcess.prototype.storeServerProcesses = function(processes){
	var serverProcessesKey = KalturaCache.getServerProcesses();
	
	KalturaCache.set(serverProcessesKey, processes, KalturaConfig.config.cache.serverProcess, function(){
		setInterval(function(){
			KalturaCache.set(serverProcessesKey, processes, KalturaConfig.config.cache.serverProcess);
		}, (KalturaConfig.config.cache.serverProcess - 5) * 1000);
	});
};

KalturaMainProcess.prototype.restoreServerProcesses = function(processes){
	for(var i = 0; i < processes.length; i++){
		this.restoreServerProcess(processes[i]);
	}
};

KalturaMainProcess.prototype.restoreServerProcess = function(pid){
	var This = this;
	var processActionsKey = KalturaCache.getProcessActions(pid);
	KalturaCache.get(processActionsKey, function(actions){
		if(actions){
			This.restoreProcessActions(actions);
			KalturaCache.del(processActionsKey);
		}
	});
};

KalturaMainProcess.prototype.restoreProcessActions = function(actions){
	for(var actionId in actions){
		this.restoreAction(actions[actionId]);
	}
};

KalturaMainProcess.prototype.spawn = function(){
	var childProcess = cluster.fork();
	var This = this;
	childProcess.on('exit', function(code){
		This.onProcessExit(childProcess, code);
	});
	this.childProcesses[childProcess.process.pid] = childProcess;
	
	return childProcess;
};

KalturaMainProcess.prototype.onProcessExit = function(childProcess, code){
	var pid = childProcess.process.pid;
	delete this.childProcesses[pid];
	KalturaLogger.log('Process died [' + pid + '] , code [' + code + ']');
	
	if(this.run){
		var childProcess = this.spawn();
		KalturaLogger.log('Restarted process [' + childProcess.process.pid + ']');

		this.restoreServerProcess(pid);

		var processes = [];
		for (var pid in this.childProcesses) {
			processes.push(pid);
		}
		this.storeServerProcesses(processes);
	}
};

KalturaMainProcess.prototype.stop = function() {
	KalturaLogger.log('Stopping all child processes');
	this.run = false;
	for ( var pid in this.childProcesses) {
		this.childProcesses[pid].send('stop');
	}
};

KalturaMainProcess.prototype.restart = function() {
	KalturaLogger.log('Restarting all child processes');
	this.stop();
	this.start();
};

KalturaMainProcess.prototype.notifyLogsRotate = function() {
	KalturaLogger.log('Log rotate main process');
	KalturaLogger.notifyLogsRotate();
	for ( var pid in this.childProcesses) {
		KalturaLogger.log('Log rotate child process [' + pid + ']');
		this.childProcesses[pid].send('notifyLogsRotate');
	}
};

var KalturaChildProcess = function(){
	process.on('uncaughtException', function (err) {
	    KalturaLogger.error('Uncaught Exception: ' + err.stack);
	}); 

	var This = this;
	process.on('message', function(action) {
		if(typeof This[action] === 'function'){
			This[action].apply(This);
		}
	});
	  
	this.init();
	this.managers = {};
	this.start();
};
util.inherits(KalturaChildProcess, KalturaServer);

KalturaChildProcess.prototype.start = function(){
	this.startHttpServer();
	if(this.httpsWebServer){
		this.startHttpsServer();
	}
};

KalturaChildProcess.prototype.startHttpServer = function() {
	var httpPort = KalturaConfig.config.cloud.httpPort;
	KalturaLogger.log('Listening on port [' + httpPort + ']');
	var This = this;
	this.httpWebServer.on('request', function(request, response) {
		return This.handleRequest(request, response);
	});
	this.httpWebServer.listen(httpPort);
};

KalturaChildProcess.prototype.startHttpsServer = function() {
	var httpsPort = KalturaConfig.config.cloud.httpsPort;
	
	KalturaLogger.log('Listening on port [' + httpsPort + ']');
	var This = this;
	this.httpsWebServer.addListener('request', function(request, response) {
		return This.handleRequest(request, response);
	});
	this.httpsWebServer.listen(httpsPort);
};

KalturaChildProcess.prototype.stop = function(){
	for(var serviceName in this.managers){
		var service = this.managers[serviceName];
		KalturaLogger.log('Stopping service [' + serviceName + ']');
		service.stop();
	}
};

KalturaChildProcess.prototype.notifyLogsRotate = function(){
	KalturaLogger.notifyLogsRotate();
};

KalturaChildProcess.prototype.parseUrl = function(urlInfo) {
	var pathParts = urlInfo.pathname.split('/');
	if(pathParts.length < 5)
		return null;

	urlInfo.service = pathParts[3][0].toUpperCase() + pathParts[3].substr(1);
	urlInfo.action = pathParts[4];
	urlInfo.params = querystring.parse(urlInfo.query);
	urlInfo.params.partnerId = pathParts[2];
	
	var paramName = null;
	for(var i = 5; i < pathParts.length; i++){
		if(paramName == null){
			paramName = pathParts[i];
		}
		else{
			urlInfo.params[paramName] = pathParts[i];
			paramName = null;
		}
	}
	
	return urlInfo;
};

KalturaChildProcess.prototype.handleRequest = function(request, response) {
	KalturaLogger.access(request, response);
	
	var urlInfo = url.parse(request.url);
	var requestInfo = this.parseUrl(urlInfo);
	if(!requestInfo){
		var filePath = path.join(__dirname, 'web', urlInfo.pathname);
		var stat = fs.statSync(filePath);
		if(stat && stat.isFile()){
			response.writeHead(200, {
		        'Content-Type': mime.lookup(filePath),
		        'Content-Length': stat.size
		    });

		    var readStream = fs.createReadStream(filePath);
		    return readStream.pipe(response);
		}
			
		response.error('Failed to parse request');
		return this.errorFileNotFound(response);
	}

    var service = this.managers[requestInfo.service];
	if(!service){	
		var serviceClass = 'Kaltura' + requestInfo.service + 'Manager';
		var serviceModule = './managers/' + serviceClass;
		try{
			var module = require(serviceModule);
			service = new module[serviceClass]();
		}
		catch(err){
			response.error(err.stack);
			return this.errorFileNotFound(response);
		}

		if(!service){
			response.error('Service [' + requestInfo.service + '] not found');
			return this.errorFileNotFound(response);
		}
		
		service.start();
		this.managers[requestInfo.service] = service;
	}
			
	if(!service[requestInfo.action] || !(typeof service[requestInfo.action] === 'function')){
		response.error('Action [' + requestInfo.service + '.' + requestInfo.action + '] not found');
		return this.errorFileNotFound(response);
	}

	try{
		service[requestInfo.action].apply(service, [request, response, requestInfo.params]);
	}
	catch(err){
		response.error(err.stack);
		return this.errorResponse(response, 500, err.message);
	}
};

module.exports.KalturaMainProcess = KalturaMainProcess;
module.exports.KalturaChildProcess = KalturaChildProcess;