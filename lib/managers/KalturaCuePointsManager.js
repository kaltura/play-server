
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');
kaltura.client = require('../client/KalturaClient');

/**
 * @service cuePoints
 */
var KalturaCuePointsManager = function(){
	this.cuePoints = {};
	this.interval = null;
	this.lastUpdatedAt = null;
	
	this.initClient(KalturaConfig.config.client);
};
util.inherits(KalturaCuePointsManager, kaltura.KalturaManager);

/**
 * @type KalturaClient
 */
KalturaCuePointsManager.prototype.client = null;

/**
 * @type handle to setInterval
 */
KalturaCuePointsManager.prototype.interval = null;

/**
 * @type object
 * 
 * key: entry id
 * value: object
 *  - finishCallback: function called when entry is not required anymore and restorable action could be unstored
 *  - cuePoints: object (key: cue-point id, value: KalturaCuePoint)
 */
KalturaCuePointsManager.prototype.cuePoints = null;

/**
 * @type int timestamd in seconds, used to fetch cue-points that changed in last few seconds
 */
KalturaCuePointsManager.prototype.lastUpdatedAt = null;

/**
 * @type boolean indicates that the client session started and could be used
 */
KalturaCuePointsManager.prototype.sessionReady = null;


/**
 * Instantiate the client lib and start session
 */
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


/**
 * @param entryId
 */
KalturaCuePointsManager.prototype.verifyEntryRequired = function(entryId){
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	var This = this;
	var deleteCuePoint = function(){
		This.cuePoints[entryId].finishCallback();
		delete This.cuePoints[entryId];
		var cuePointsKey = KalturaCache.getCuePoints(entryId);
		KalturaCache.del(cuePointsKey);		
	};
	KalturaCache.get(entryRequiredKey, function(data){
		if(!data)
			deleteCuePoint();
	}, deleteCuePoint);
};


/**
 * @param cuePointsList KalturaCuePointListResponse
 * @param filter KalturaCuePointFilter
 * @param pager KalturaFilterPager
 */
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
			var entryId = cuePoint.entryId;
			if(!this.cuePoints[entryId]){
				continue;
			}
			this.lastUpdatedAt = Math.max(this.lastUpdatedAt, cuePoint.updatedAt);
			
			this.cuePoints[entryId].cuePoints[cuePoint.id] = cuePoint;

			var cuePointsKey = KalturaCache.getCuePoints(entryId);
			this.set(cuePointsKey, this.cuePoints[entryId].cuePoints, 600);
		}
	}
};


/**
 * List cue-points for all entries, executed periodically
 */
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


/**
 * Add entry to be watched
 * 
 * @action cuePoints.watch
 * 
 * @param entryId
 */
KalturaCuePointsManager.prototype.watch = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['entryId']);
	if(!params)
		return;

	KalturaLogger.dir(params);

	if(this.cuePoints[params.entryId]){
		response.done('Entry [' + params.entryId + '] already watched');
	}
	else{
		this.callRestorableAction('cuePoints', 'watchEntry', params);		
	}

	response.writeHead(200);
	response.done('OK');
};


/**
 * Restorable action, add entry to be watched
 * 
 * @param params.entryId
 * @param finishCallback function to be called when this entry watch is not needed anymore
 */
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
