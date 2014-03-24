
var os = require('os');
var fs = require('fs');

var KalturaCache = require('./KalturaCache');
var KalturaLogger = require('./KalturaLogger');

KalturaConfig = {
	config: null,
	configFiles: {},
	
	init: function(){
		if(process.argv.length > 2){
			this.config = JSON.parse(process.argv[2]);
			return;
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

		this.config = ini.parseSync(cacheConfigPath);

		if(this.config.logger){
			KalturaLogger.init(this.config.logger);
		}
		if(this.config.memcache){
			KalturaCache.init(this.config.memcache);
		}
	},

	watchFiles: function(callback) {
		setInterval(function(){
			var handled = false;
			for(var filePath in this.configFiles){
				fs.lstat(filePath, function(err, stats) {
					if(handled){
						return;
					}
					if (err) {
						KalturaLogger.error(err);
					} else {
						if(this.configFiles[filePath] < stats.mtime){
							handled = true;
							KalturaConfig.init();
							callback();
						}
					}
				});
			}
		}, 30000);
	}
};
KalturaConfig.init();

module.exports = KalturaConfig;
