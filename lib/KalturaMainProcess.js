
var os = require('os');
var cluster = require('cluster');

var KalturaMainProcess = function(){
	KalturaLogger.log('KalturaMainProcess [' + process.pid + '] initializing');
	this.run = true;
	this.childProcesses = {};

	cluster.setupMaster({
		args: [JSON.stringify(this.config)]
	});
	
	this.start();
	this.watchFiles();
};

KalturaMainProcess.prototype = require('./KalturaServer').extend();

KalturaMainProcess.prototype.start = function(){
	KalturaLogger.log('Starting all child processes');
	this.run = true;
	
	var numOfCores = os.cpus().length;
	var processes = [];
	for (var i = 0; i < numOfCores; i++) {
		var childProcess = this.spawn();
		processes.push(childProcess.process.pid);
		KalturaLogger.log('Started process [' + childProcess.process.pid + ']');
	}
	var serverProcessesKey = this.cache.getServerProcesses();
	var This = this;
	this.cache.get(serverProcessesKey, function(err, data){
		if(data && !err){
			This.restoreServerProcesses(data);
		}
		
		This.storeServerProcesses(processes);
	});
};

KalturaMainProcess.prototype.storeServerProcesses = function(processes){
	var serverProcessesKey = this.cache.getServerProcesses();
	var This = this;
	this.cache.del(serverProcessesKey, function(err){
		This.cache.add(serverProcessesKey, processes, 60, function(err){
			setTimeout(function(){
				This.cache.touch(serverProcessesKey, processes, 60);
			}, 50000);
		});
	});
};

KalturaMainProcess.prototype.restoreServerProcesses = function(processes){
	var This = this;
	for(var i = 0; i < processes.length; i++){
		var pid = processes[i];
		var processActionsKey = this.cache.getProcessActions(pid);
		this.cache.get(processActionsKey, function(err, actions){
			if(actions && !err){
				This.restoreProcessActions(actions);
			}
			This.cache.del(processActionsKey);
		});
	}
};

KalturaMainProcess.prototype.restoreProcessActions = function(actions){
	for(var actionId in actions){
		this.restoreAction(actions[actionId]);
	}
};

KalturaMainProcess.prototype.spawn = function(){
	var childProcess = cluster.fork();
	childProcess.on('exit', this.onProcessExit);
	this.childProcesses[childProcess.process.pid] = childProcess;
	
	return childProcess;
};

KalturaMainProcess.prototype.onProcessExit = function(childProcess, code, signal){
	KalturaLogger.dir(childProcess);
	delete this.childProcesses[childProcess.process.pid];
	KalturaLogger.log('Process died [' + childProcess.process.pid + '] , code [' + code + ']');
	
	if(this.run){
		var childProcess = this.spawn();
		KalturaLogger.log('Restarted process [' + childProcess.process.pid + ']');
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

KalturaMainProcess.prototype.watchFiles = function() {
	// TODO
};

module.exports = new KalturaMainProcess();
