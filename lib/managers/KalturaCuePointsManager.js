
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
kaltura.client = require('../client/KalturaClient');

var KalturaCuePointsManager = function(config){
	KalturaLogger.log('Initializing');

	this.cuePoints = {};
	this.interval = null;
	this.lastUpdatedAt = null;
	
	if(config){
		this.init(config);
		this.initClient(config.client);
	}
};
util.inherits(KalturaCuePointsManager, kaltura.KalturaManager);

KalturaCuePointsManager.prototype.client = null;
KalturaCuePointsManager.prototype.interval = null;
KalturaCuePointsManager.prototype.cuePoints = null;
KalturaCuePointsManager.prototype.lastUpdatedAt = null;

KalturaCuePointsManager.prototype.initClient = function(config){
	KalturaLogger.log('Initializing client');
	var clientConfig = new kaltura.client.KalturaConfiguration(parseInt(config.partnerId));
	
	for(var configKey in config)
		clientConfig[configKey] = config[configKey];

	clientConfig.setLogger(KalturaLogger);
	clientConfig.clientTag = 'play-server-' + this.hostname;

	this.client = new kaltura.client.KalturaClient(clientConfig);
};

KalturaCuePointsManager.prototype.verifyEntryRequired = function(entryId){
	var entryRequiredKey = this.cache.getEntryRequired(entryId);
	var This = this;
	this.cache.get(entryRequiredKey, function(err, data){
		if (err || data === false){
			delete This.cuePoints[entryId];
		}
	});
};

KalturaCuePointsManager.prototype.handleCuePointsList = function(cuePointsList){
	KalturaLogger.dir(cuePointsList);
	
	if(cuePointsList.objectType == 'KalturaAPIException'){
		KalturaLogger.error('Client [cuePoint.list][' + cuePointsList.code + ']: ' + cuePointsList.message);
	}
	else{
		// TODO
	}
};

KalturaCuePointsManager.prototype.run = function(){
	
	var entryIds = [];
	for(var entryId in this.cuePoints){
		entryIds.push(entryId);
		this.verifyEntryRequired(entryId);
	}
	
	var filter = new kaltura.client.objects.KalturaAdCuePointFilter();
	filter.entryIdIn = entryIds.join(',');
	filter.updatedAtGreaterThanOrEqual = this.lastUpdatedAt;

	var pager = new kaltura.client.objects.KalturaFilterPager();
	pager.pageSize = 500;
	
	this.client.cuePoint.listAction(this.handleCuePointsList, filter, pager);
};

KalturaCuePointsManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params);
	if(!params)
		return;

	KalturaLogger.dir(params);
	if (!params.entryId) {
		this.errorMissingParameter(response);
		return;
	}

	if(this.cuePoints[params.entryId]){
		KalturaLogger.log('Request [' + response.requestId + '] entry [' + params.entryId + '] already watched');
		response.writeHead(200);
		response.end('Entry [' + params.entryId + '] already watched');
		return;
	}
	
	this.cuePoints[params.entryId] = {};
	
	if(!this.interval){
		var This = this;
		this.interval = setInterval(function(){
			This.run;
		}, 10000);
	}
	
	this.run();
};

module.exports.KalturaCuePointsManager = KalturaCuePointsManager;
