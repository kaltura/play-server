
var util = require('util');

var kaltura = module.exports = require('../KalturaManager');

var KalturaManifestManager = function(config){
	KalturaLogger.log('Initializing');
	
	if(config)
		this.init(config);
};
util.inherits(KalturaManifestManager, kaltura.KalturaManager);

KalturaManifestManager.prototype.startWatcherExclusive = function(entryId, manifestUrl, successCallback, failureCallback) {
	KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + ']');
	
	var This = this;
	var manifestRequiredKey = this.cache.getManifestRequired(entryId);
	this.cache.add(manifestRequiredKey, true, 60, function (err) {
		
		// someone else grabbed the lock
		if (err){
			KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] watcher already exists');
			setTimeout(function(){
				var manifestId = This.cache.getManifestId(manifestUrl);
				var manifestContentKey = This.cache.getManifestContent(manifestId);
				This.cache.get(manifestContentKey, function (err, data) {
					if (!err && data !== false){
						successCallback(data);
					}
					else if (err){
						failureCallback([err]);
					}
					else{
						failureCallback();
					}
				});
			}, 20000);			
		}
		else{
			KalturaLogger.log('Entry [' + entryId + '] url [' + manifestUrl + '] notify stream manager');
			
			var params = {
				entryId: entryId,
				url: manifestUrl
			};
			
			This.callPlayServerService('stream', 'watch', params, successCallback, failureCallback);
		}
	});
	
	// TODO start watch cue-point
};


KalturaManifestManager.prototype.master = function(request, response, params){
	KalturaLogger.dir(params);
	if (!params.url || !params.entryId) {
		this.errorMissingParameter(response);
		return;
	}
	
	var This = this;
	var manifestId = this.cache.getManifestId(params.url);
	var manifestContentKey = this.cache.getManifestContent(manifestId);
	KalturaLogger.log('Request [' + response.requestId + '] Checking cache [' + manifestContentKey + ']');
	this.cache.get(manifestContentKey, function (err, data) {
		if (!err && data !== false){
			KalturaLogger.log('Request [' + response.requestId + '] returned from cache');
			response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
			response.end(data);
		}
		else{
			KalturaLogger.log('Request [' + response.requestId + '] not found in cache');
			This.startWatcherExclusive(params.entryId, params.url, function (manifestContent) {
				KalturaLogger.log('Request [' + response.requestId + '] returned from stream service');
				response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
				response.end(manifestContent);
			}, function (errors) {
				var errMessage = 'Manifest not found';
				if(errors)
					errMessage = 'Manifest not found: \n\t' + (errors instanceof Array ? errors.join('\n') : errors);

				KalturaLogger.error('Request [' + response.requestId + '] ' + errMessage);
				This.errorFileNotFound(response);
			});
		}
	});
};

KalturaManifestManager.prototype.flavor = function(request, response, params){
	KalturaLogger.dir(params);
	if (!params.manifestId || !params.entryId) {
		this.errorMissingParameter(response);
		return;
	}

	var manifestRequiredKey = this.cache.getManifestRequired(params.entryId);
	this.cache.touch(manifestRequiredKey, true, 600);
	
	var This = this;
	var manifestContentKey = this.cache.getManifestContent(params.manifestId);
	this.cache.get(manifestContentKey, function (err, data) {
		if (!err && data !== false){
			KalturaLogger.log('Request [' + response.requestId + '] returned from cache');
			response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
			response.end(data);
		}
		else{
			KalturaLogger.log('Request [' + response.requestId + '] not found in cache');
			This.errorFileNotFound(response);
		}
	});
};

module.exports.KalturaManifestManager = KalturaManifestManager;
