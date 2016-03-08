
var util = require('util');

var kaltura = module.exports = require('./KalturaBase');
kaltura.client = require('./client/KalturaClient');
require('./utils/KalturaUiConfParser');

var KalturaManager = function() {
};
util.inherits(KalturaManager, kaltura.KalturaBase);

/**
 * @type KalturaClient
 */
KalturaManager.prototype.client = null;

/**
 * @type KalturaConfiguration
 */
KalturaManager.prototype.clientConfig = null;

/**
 * @type boolean indicates that the client session started and could be used
 */
KalturaManager.prototype.sessionReady = null;

/**
 * Instantiate the client lib and start session
 */
KalturaManager.prototype.initClient = function(config, callback){
	KalturaLogger.log('Initializing client');
	this.clientConfig = new kaltura.client.KalturaConfiguration(parseInt(config.partnerId));
	
	for(var configKey in config)
		this.clientConfig[configKey] = config[configKey];

	this.clientConfig.setLogger(KalturaLogger);
	this.clientConfig.clientTag = 'play-server-' + this.hostname;

	var This = this;
	
	var type = kaltura.client.enums.KalturaSessionType.ADMIN;
	this.sessionReady = false;
	this.client = new kaltura.client.KalturaClient(this.clientConfig);
	var ksTimer = config.expiry;
	if(!ksTimer){
		ksTimer =  86400*1000 - 1000;
	}		
	this.client.session.start(function(ks){
		if(ks){
			This.client.setKs(ks);
			This.sessionReady = true;
			setTimeout(function(){ This.initClient(config, callback); }, ksTimer, config, callback);
			if(callback){
				callback();
			}			
		}
		else{
			KalturaLogger.error('Failed to start client session');
			ksTimer = 2*1000;
			setTimeout(function(){ This.initClient(config, callback); }, ksTimer, config, callback);
			if(callback){
				callback();
			}
		}

	}, config.secret, config.userId, type, config.partnerId, config.expiry, config.privileges);
};

KalturaManager.prototype.impersonate = function(partnerId){
	this.clientConfig.partnerId = partnerId;
	this.client.setConfig(this.clientConfig);		
};

KalturaManager.prototype.unimpersonate = function(config){
	this.clientConfig.partnerId = config.partnerId;
	this.client.setConfig(this.clientConfig);	
};

KalturaManager.prototype.getMissingParams = function(params, requiredParams){
	var missingParams = [];
	for(var i = 0; i < requiredParams.length; i++){
		var requiredParam = requiredParams[i];
		if(typeof params[requiredParam] === 'undefined'){
			missingParams.push(requiredParam);
		}
	}
	return missingParams;
};


KalturaManager.prototype.parsePlayServerParams = function(response, playServerParams, requiredParams){
	if (playServerParams.signature != this.getSignature(playServerParams.data)) {
		response.error('Wrong signature');
		this.errorResponse(response, 403, 'Forbidden\n');
		return null;
	}
	
	var str = new Buffer(playServerParams.data, 'base64').toString('ascii');
	var params = JSON.parse(str);
	params.partnerId = playServerParams.partnerId;
	var missingParams = this.getMissingParams(params, requiredParams);
	if(missingParams.length){
		response.error('Missing arguments [' + missingParams.join(', ') + ']');
		this.errorMissingParameter(response);
		return null;
	}
		
	return params;
};

KalturaManager.prototype.start = function(){
	this.run = true;
};

KalturaManager.prototype.stop = function(){
	this.run = false;
};

KalturaManager.prototype.restore = function(request, response, params){
	params = this.parsePlayServerParams(response, params, ['action', 'params']);
	if(!params)
		return;

	KalturaLogger.dir(params);
	
	this.callRestorableAction(params.service, params.action, params.params);

	response.debug('Restored');
	response.writeHead(200);
	response.end();
};

/**
 * check if the play server feature is allowed for partner
 * @param partner id
 * @param permissonName
 * @param callback
 */
KalturaManager.prototype.isPermissionAllowedForPartner = function(partnerId, permissonName, callback){
	var This = this;
	
	var checkIfPermissionAllowed = function(){
		var filter = new kaltura.client.objects.KalturaPermissionFilter();
		filter.nameEqual = permissonName;
		
		pager = new kaltura.client.objects.KalturaFilterPager();
		pager.pageSize = 1;
		
		This.impersonate(partnerId);
		This.client.permission.listAction(function(result) {
			This.unimpersonate(KalturaConfig.config.client);
			if(!result){
				callback(false);
			}
			else if(result.objectType == 'KalturaAPIException'){
				KalturaLogger.error('Client [permission.list][' + result.code + ']: ' + result.message);
				callback(false);
			}
			else{
				if(result.totalCount && result.objects[0].name == permissonName){
					callback(true);
				}
				else{
					callback(false);
				}	
			}
		}, filter, pager);
	};
	
	if(!This.sessionReady){
		This.initClient(KalturaConfig.config.client, function(){
			checkIfPermissionAllowed();
		});
	}
	else{
		checkIfPermissionAllowed();
	}
};

/**
 * Get flavor asset download URL
 * @param partner id
 * @param flavor asset id
 * @param callback
 */
KalturaManager.prototype.getFlavorUrl = function(partnerId, flavorAssetId, callback){
	var This = this;
	
	var callGetFlavorUrl = function(){		
		This.impersonate(partnerId);
		This.client.flavorAsset.getUrl(function(result) {
			This.unimpersonate(KalturaConfig.config.client);
			if(!result){
				callback(null);
			}
			else if(result.objectType == 'KalturaAPIException'){
				KalturaLogger.error('Client [flavor.getUrl][' + result.code + ']: ' + result.message);
				callback(null);
			}
			else{	
				callback(result);
			}
		}, flavorAssetId);
	};
	
	if(!This.sessionReady){
		This.initClient(KalturaConfig.config.client, function(){
			callGetFlavorUrl();
		});
	}
	else{
		callGetFlavorUrl();
	}
};

/**
 * get the current ui conf config file from Kaltura and store it in the cache
 * @param uiConfId
 * @param entryId
 * @param partnerId
 * @param callback
 */
KalturaManager.prototype.loadUiConfConfig = function(uiConfId, entryId, partnerId, callback){
	var callUiConfGetService = function(uiConfId){
		try{
			This.impersonate(partnerId);
			This.client.uiConf.get(function(result){
				This.unimpersonate(KalturaConfig.config.client);
				if(!result){
					callback(null);
				}
				else if(result.objectType == 'KalturaAPIException'){
					KalturaLogger.error('Client [uiConf.get][' + result.code + ']: ' + result.message);
					callback(null);
				}
				else{
					var uiConfConfig = KalturaUiConfParser.parseUiConfConfig(uiConfId, JSON.parse(result.config));
					var uiConfConfigId = KalturaCache.getUiConfConfigId(uiConfConfig);
					var uiConfConfigKey = KalturaCache.getKey(KalturaCache.UI_CONF_CONFIG_KEY_PREFIX, [uiConfConfigId]);
					KalturaCache.set(uiConfConfigKey, uiConfConfig, KalturaConfig.config.cache.masterManifest, function(){
						if(callback){
							callback(uiConfConfig);
						}										
					});			
				}
			}, uiConfId);
		}
		catch(e){
			KalturaLogger.error('Client failed to retrive ui conf [' + uiConfId + '] for entry [' + entryId + ']');
			callback(null);
		}
	};
	
	var This = this;
	
	if(!This.sessionReady){
		This.initClient(KalturaConfig.config.client, function(){
			callUiConfGetService(uiConfId);
		});
	}
	else{
		callUiConfGetService(uiConfId);
	}
};

module.exports.KalturaManager = KalturaManager;
