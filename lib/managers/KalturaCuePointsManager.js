
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
kaltura.client = require('../client/KalturaClient');

var KalturaCuePointsManager = function(config){
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
KalturaCuePointsManager.prototype.sessionReady = null;

KalturaCuePointsManager.prototype.initClient = function(config){
	KalturaLogger.log('Initializing client');
	var clientConfig = new kaltura.client.KalturaConfiguration(parseInt(config.partnerId));
	
	for(var configKey in config)
		clientConfig[configKey] = config[configKey];

	clientConfig.setLogger(KalturaLogger);
	clientConfig.clientTag = 'play-server-' + this.hostname;

	var This = this;
	var type = kaltura.client.enums.KalturaSessionType.ADMIN;
	this.sessionReady = false;
	this.client = new kaltura.client.KalturaClient(clientConfig);
	this.client.session.start(function(ks){
		This.sessionReady = true;
		This.client.setKs(ks);
	}, config.secret, config.userId, type, config.partnerId, config.expiry, config.privileges);
};

KalturaCuePointsManager.prototype.verifyEntryRequired = function(entryId){
	var entryRequiredKey = this.cache.getEntryRequired(entryId);
	var This = this;
	var deleteCuePoint = function(){
		This.cuePoints[entryId].finishCallback();
		delete This.cuePoints[entryId];
		var cuePointsKey = This.cache.getCuePoints(entryId);
		This.cache.del(cuePointsKey);		
	};
	this.cache.get(entryRequiredKey, function(data){
		if(!data)
			deleteCuePoint();
	}, deleteCuePoint);
};

KalturaCuePointsManager.prototype.handleCuePointsList = function(cuePointsList, filter, pager){
	if(!this.run){
		return;
	}
	
	if(cuePointsList.objectType == 'KalturaAPIException'){
		KalturaLogger.error('Client [cuePoint.list][' + cuePointsList.code + ']: ' + cuePointsList.message);
	}
	else{
		var This = this;
		
		if(cuePointsList.objects.length == pager.pageSize){
			pager.pageIndex++;
			this.client.cuePoint.listAction(function(nextCuePointsList){
				This.handleCuePointsList(nextCuePointsList, filter, pager);
			}, filter, pager);
		}
		
		for(var i = 0; i < cuePointsList.objects.lemgth; i++){
			var cuePoint = cuePointsList.objects[i];
			if(!this.cuePoints[entryId]){
				continue;
			}
			
			this.cuePoints[entryId].cuePoints[cuePoint.id] = cuePoint;

			var cuePointsKey = this.cache.getCuePoints(entryId);
			this.set(cuePointsKey, this.cuePoints[entryId].cuePoints, 600);
		}
	}
};

KalturaCuePointsManager.prototype.loop = function(){
	if(!this.sessionReady)
		return;
	
	var entryIds = [];
	for(var entryId in this.cuePoints){
		entryIds.push(entryId);
		this.verifyEntryRequired(entryId);
	}

	if(!entryIds.length){
		clearInterval(this.interval);
		return;
	}
	
	var filter = new kaltura.client.objects.KalturaAdCuePointFilter();
	filter.entryIdIn = entryIds.join(',');
	filter.updatedAtGreaterThanOrEqual = this.lastUpdatedAt;

	var pager = new kaltura.client.objects.KalturaFilterPager();
	pager.pageSize = 500;
	
	var This = this;
	this.client.cuePoint.listAction(function(cuePointsList){
		This.handleCuePointsList(cuePointsList, filter, pager);
	}, filter, pager);
};

KalturaCuePointsManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['entryId']);
	if(!params)
		return;

	KalturaLogger.dir(params);

	if(this.cuePoints[params.entryId]){
		response.end('Entry [' + params.entryId + '] already watched');
	}
	else{
		this.callRestorableAction('cuePoints', 'watchEntry', params);		
	}

	response.writeHead(200);
	response.end('OK');
};

KalturaCuePointsManager.prototype.watchEntry = function(params, finishCallback){
	KalturaLogger.dir(params);
	
	this.cuePoints[params.entryId] = {
		finishCallback: finishCallback,
		cuePoints: {}
	};
	
	if(!this.interval){
		var This = this;
		this.interval = setInterval(function(){
			if(!This.run){
				clearInterval(This.interval);
				return;
			}

			This.loop();
		}, 10000);
	}
	
	this.loop();
};

module.exports.KalturaCuePointsManager = KalturaCuePointsManager;
