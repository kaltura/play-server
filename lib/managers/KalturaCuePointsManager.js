
var url = require('url');
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

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
 * @param entryId
 */
KalturaCuePointsManager.prototype.verifyEntryRequired = function(entryId){
	var entryRequiredKey = KalturaCache.getEntryRequired(entryId);
	var oldestSegmentTimeKey = KalturaCache.getOldestSegmentTime(entryId);
	var cuePointsKey = KalturaCache.getCuePoints(entryId);
	
	var This = this;
	var deleteCuePoint = function(){
		This.cuePoints[entryId].finishCallback();
		delete This.cuePoints[entryId];		
		KalturaCache.del(cuePointsKey);		
	};
	
	KalturaCache.get(entryRequiredKey, function(data){
		if(!data){
			KalturaLogger.log('Deleting cue points for entry ' + entryId);
			deleteCuePoint();
		}
		else{
			if(This.cuePoints[entryId] && This.cuePoints[entryId].cuePoints){
				KalturaCache.get(oldestSegmentTimeKey, function(oldestSegmentTime){
					if(oldestSegmentTime){
						var changed = false;
						for(var cuePointId in This.cuePoints[entryId].cuePoints){
							var cuePoint = This.cuePoints[entryId].cuePoints[cuePointId];
							if((cuePoint.startTime && oldestSegmentTime.offset > (cuePoint.startTime + cuePoint.duration)) || 
								(cuePoint.triggeredAt*1000 && oldestSegmentTime.timestamp > (cuePoint.triggeredAt*1000 + cuePoint.duration))){
								KalturaLogger.log('Deleting handled cue point from cache: ' + cuePointId);
								delete This.cuePoints[entryId].cuePoints[cuePointId];
								changed = true;
							}
						}
						if(changed)
							KalturaCache.set(cuePointsKey, This.cuePoints[entryId].cuePoints, KalturaConfig.config.cache.cuePoint);		
					}
				}, function(err){});		
			}
		}
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
		
		for(var i = 0; i < cuePointsList.objects.length; i++){
			var cuePoint = cuePointsList.objects[i];
			var entryId = cuePoint.entryId;
			if(!this.cuePoints[entryId]){
				continue;
			}
			this.lastUpdatedAt = Math.max(this.lastUpdatedAt, cuePoint.updatedAt);
			
			this.cuePoints[entryId].cuePoints[cuePoint.id] = cuePoint;

			var cuePointsKey = KalturaCache.getCuePoints(entryId);
			KalturaCache.set(cuePointsKey, this.cuePoints[entryId].cuePoints, KalturaConfig.config.cache.cuePoint);
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
		KalturaLogger.log('No entries left to monitor, clearing cue points interval for pId ' + process.pid);
		this.interval = null;
		return;
	}
	
	var filter = new kaltura.client.objects.KalturaAdCuePointFilter();
	filter.entryIdIn = entryIds.join(',');
	filter.statusEqual = kaltura.client.enums.KalturaCuePointStatus.READY;
	filter.cuePointTypeEqual = kaltura.client.enums.KalturaCuePointType.AD;
	if(this.lastUpdatedAt){
		//Added +1 to skip retrieving the last object fetched over and over again
		filter.updatedAtGreaterThanOrEqual = this.lastUpdatedAt + 1;
	}

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
	params = this.parsePlayServerParams(response, params, ['entryId', 'partnerId']);
	if(!params)
		return;

	response.dir(params);

	if(this.cuePoints[params.entryId]){
		response.writeHead(200);
		response.end('Entry [' + params.entryId + '] already watched');
		return;
	}
	else{
		this.callRestorableAction('cuePoints', 'watchEntry', params);		
	}

	response.writeHead(200);
	response.end('OK');
};


/**
 * Restorable action, add entry to be watched
 * 
 * @param params.entryId
 * @param finishCallback function to be called when this entry watch is not needed anymore
 */
KalturaCuePointsManager.prototype.watchEntry = function(params, finishCallback){
	KalturaLogger.log('watch CuePoints for entry ' + params.entryId);
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
				KalturaLogger.log('Run variable is false clearing cue points interval for pId ' + process.pid);
				This.interval = null;
				return;
			}
			
			This.loop();
		}, 10000);
	}
	
	this.loop();
};

module.exports.KalturaCuePointsManager = KalturaCuePointsManager;
