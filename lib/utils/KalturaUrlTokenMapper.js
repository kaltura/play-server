const _url = require('url');
const _qs  = require('querystring');
const APIRequestHelper = require('../managers/helpers/APIRequestHelper');

KalturaUrlTokenMapper = {
	
	// ability to format expressions
	formatFunctions : {
		timeFormat : function(value) {
			return KalturaUtils.seconds2npt(parseFloat(value));
		},
		dateFormat : function(value) {
			var date = new Date(value * 1000);
			return date.toDateString();
		},
		numberWithCommas : function(value) {
			return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}
	},
	
	mapDynamicTokens: function(request, cachedUrl, playerConfig){
		var data = {};
		data.configProxy = {};
		data.configProxy.flashvars = {};			
		if(playerConfig){
			for(var attr in playerConfig){
				data.configProxy.flashvars[attr] = playerConfig[attr];
			}			
		}
		data.utility = {};
		data.utility.random = Math.random();
		data.utility.timestamp = new Date().getTime();
		if(data.configProxy.flashvars.referrer){
			data.utility.referrer_url = data.configProxy.flashvars.referrer;
		}
		else{
			data.utility.referrer_url = request.headers['referer'];
		}
		
		if(data.utility.referrer_url != null){
			var parsedReferrerUrl = _url.parse(data.utility.referrer_url);
			data.utility.referrer_host = parsedReferrerUrl.host;			
		}
		
		if( request != null){
			data.mediaSession = {};
			data.mediaSession.userIPaddress = request.headers['x-forwarded-for'];
			data.mediaSession.userAgent = request.headers['user-agent'];					
		}
		
		var parsedUrl = _url.parse(cachedUrl, true);
		var queryString = parsedUrl.query;
		
		for(var attributeName in queryString){
			var attributeValue = KalturaUrlTokenMapper.evaluate(data, queryString[attributeName]);
			KalturaLogger.log("Evaluated attribute: [" + attributeName + "] value: [" + attributeValue + "]");		
			queryString[attributeName] = attributeValue;
		}
		
		parsedUrl.search = _qs.stringify(queryString);
		parsedUrl.query = queryString;
		return _url.format(parsedUrl);
	},
	
	mapFixedTokens: function(request, cuePoint, entry, metadata, playerConfig, callback) {
		this.doMapFixedTokens(request, cuePoint.id, cuePoint.sourceUrl, entry, metadata, playerConfig, callback);
	},

	mapTokensVod: function(request, cuePointId, cuePointUrl, partnerId, entryId, callback) {
		const metadataProfileId = this.extractMetaDataProfileId(cuePointUrl);
		let This = this;
		APIRequestHelper.getEntryAndMetadata(partnerId, entryId, metadataProfileId,
			(entryObj, metadataObj) => This.doMapFixedTokens(request, cuePointId, cuePointUrl, entryObj, metadataObj, null,
					(vastUrl) => callback(KalturaUrlTokenMapper.mapDynamicTokens(request, vastUrl, null)))
			, function (err) {
					KalturaLogger.error(`can't retrieve Entry data from API because ${err}`);
					callback(cuePointUrl);
			});
	},
	
	doMapFixedTokens: function(request, cuePointId, cuePointUrl, entry, metadata, playerConfig, callback){
		var cuePointUrlKey = KalturaCache.getKey(KalturaCache.CUE_POINT_URL_KEY_PREFIX, [cuePointId]);
		var data = {};
		var parsedUrl = _url.parse(cuePointUrl, true);
		var queryString = parsedUrl.query;		
		var defaultTokenValue = '<token_placeholder>';
		
		data.mediaProxy = {};
		data.mediaProxy.entryMetadata = metadata; 
		data.mediaProxy.entry = entry;

		for(var attributeName in queryString){
			var attributeValue = KalturaUrlTokenMapper.evaluate(data, queryString[attributeName], defaultTokenValue);
			KalturaLogger.log("Evaluated attribute: [" + attributeName + "] value: [" + attributeValue + "]");
			if (attributeValue === null || typeof attributeValue == 'undefined' || attributeValue === 'undefined') {
				queryString[attributeName] = '';
			}
			else if(typeof attributeValue != 'string' || attributeValue.indexOf(defaultTokenValue) < 0){
				queryString[attributeName] = attributeValue;
			}								
		}
		
		parsedUrl.search = _qs.stringify(queryString);
		parsedUrl.query = queryString;
		var cachedUrl =  _url.format(parsedUrl);
				
		KalturaLogger.log('Saving cue point url in cache: [' + cachedUrl + ']');
		KalturaCache.set(cuePointUrlKey, cachedUrl, KalturaConfig.config.cache.cuePoint);
				
		callback(cachedUrl);	
	},

	/**
	 * Emulates kaltura evaluate function
	 *
	*/
	evaluate : function(data, objectString, defaultTokenValue, limit) {
		var _this = this;
		var result;

		var isCurlyBracketsExpresion = function(str) {
			if (typeof str == 'string') {
				return (str.charAt(0) == '{' && str.charAt(str.length - 1) == '}');
			}
			return false;
		};

		// Limit recursive calls to 5
		limit = limit || 0;
		if (limit > 4) {
			KalturaLogger.log('recursive calls are limited to 5');
			return objectString;
		}

		if (typeof objectString !== 'string') {
			return objectString;
		}
		// Check if a simple direct evaluation:
		if (isCurlyBracketsExpresion(objectString) && objectString.split('{').length == 2) {
			result = _this.evaluateExpression(data, objectString.substring(1, objectString.length - 1), defaultTokenValue);
		} else if (objectString.split('{').length > 1) { // Check if we are doing a string based evaluate concatenation:
			// Replace any { } calls with evaluated expression.
			result = objectString.replace(/\{([^\}]*)\}/g, function(match, contents, offset, s) {
				return _this.evaluateExpression(data, contents, defaultTokenValue);
			});
		} else {
			// Echo the evaluated string:
			result = objectString;
		}

		if (result === 0) {
			return result;
		}
		// Return undefined to string: undefined, null, ''
		if (result === "undefined" || result === "null" || result === "")
			result = undefined;

		if (result === "false") {
			result = false;
		}
		if (result === "true") {
			result = true;
		}
		/*
		 * Support nested expressions
		 * Example: <Plugin id="fooPlugin" barProperty="{mediaProxy.entry.id}">
		 * {fooPlugin.barProperty} should return entryId and not {mediaProxy.entry.id}
		 */
		if (isCurlyBracketsExpresion(result)) {
			result = this.evaluate(data, result, defaultTokenValue, limit++);
		}
		return result;
	},
	/**
	 * Normalize evaluate expression
	 */
	getEvaluateExpression : function(data, expression, defaultTokenValue) {
		var _this = this;
		// Check if we have a function call:
		if (expression.indexOf('(') !== -1) {
			var fparts = expression.split('(');
			return _this.evaluateStringFunction(fparts[0],
			// Remove the closing ) and evaluate the Expression
			// should not include ( nesting !
			_this.getEvaluateExpression(data, fparts[1].slice(0, -1)));
		}
		var deepValue = function(obj, path){
		    for (var i=0, path=path.split('.'), len=path.length; i<len; i++){
		    	if(obj && obj.hasOwnProperty(path[i]))
		    		obj = obj[path[i]];
		    	else
		    		return defaultTokenValue;
		    };
		    return obj;
		};
		
		return deepValue(data,expression);
	},
	/**
	 * Maps a token to data property.
	 *
	 *
	 * @param {object} data 
	 * @param {string} expression The expression to be evaluated
	 */
	evaluateExpression : function(data, expression, defaultTokenValue) {
		// Search for format functions
		var formatFunc = null;
		if (expression.indexOf('|') !== -1) {
			var expArr = expression.split('|');
			expression = expArr[0];
			formatFunc = expArr[1];
			if (typeof this.formatFunctions[formatFunc] == 'function') {
				formatFunc = this.formatFunctions[formatFunc];
			} else {
				formatFunc = null;
			}
		}

		var evalVal = this.getEvaluateExpression(data, expression, defaultTokenValue);
		if (evalVal === null || typeof evalVal == 'undefined' || evalVal === 'undefined') {
			return '';
		}
		// Run by formatFunc
		if (formatFunc) {
			return formatFunc(evalVal);
		}
		return evalVal;
	},
	evaluateStringFunction : function(functionName, value) {
		switch (functionName) {
		case 'encodeUrl':
			return encodeURI(value);
			break;
		case 'conditional':
			return value;
			break;
		}
	},

	extractMetaDataProfileId : function(url) {
		var parsedUrl = _url.parse(url, true);
		var queryString = parsedUrl.query;
		return queryString.metaDataProfileId;
	}

};