
var os = require('os');
var fs = require('fs');
var ini = require('node-ini');
var http = require('http');

var KalturaServer = function(){
	KalturaLogger.log('Initializing');
	this.configFiles = {};
	var config = this.loadConfig();
	this.init(config);
	this.startWebServer();
};

KalturaServer.prototype = require('./KalturaBase');
KalturaServer.prototype.hostname = os.hostname();
KalturaServer.prototype.webServer = null;
KalturaServer.prototype.configFiles = null;

KalturaServer.prototype.loadConfig = function() {

	if(process.argv.length > 2){
		this.config = JSON.parse(process.argv[2]);
		return this.config;
	}
	
	var configDir = './config';
	var cacheDir = './cache';

	if (!fs.existsSync(cacheDir)) {
		fs.mkdirSync(cacheDir);
	}

	var files = fs.readdirSync(configDir);
	var This = this;

	var configData = '';
	var pattern = /.+\.ini$/;
	for ( var index in files) {
		if(!pattern.test(files[index]))
			continue;
		
		var filePath = configDir + '/' + files[index];
		configData += os.EOL;
		configData += fs.readFileSync(filePath, 'utf-8');

		fs.lstat(filePath, function(err, stats) {
			if (err) {
				KalturaLogger.error(err);
			} else {
				This.configFiles[filePath] = stats.mtime;
			}
		});
	}

	var cacheConfigPath = cacheDir + '/config.ini';
	fs.writeFileSync(cacheConfigPath, configData);

	return ini.parseSync(cacheConfigPath);
};

KalturaServer.prototype.startWebServer = function() {
    this.webServer = http.createServer();
};

module.exports.extend = function(){
	return new KalturaServer();
};
