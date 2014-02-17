
var cluster = require('cluster');

var KalturaProcess = null;

if (cluster.isMaster) {
	KalturaProcess = require('./lib/KalturaMainProcess');
}
else{
	KalturaProcess = require('./lib/KalturaChildProcess');
}

