var _url = require('url');
var _qs  = require('querystring');

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
	
	mapTokens: function(sourceUrl, cuePointId, entry, entryMetadata, playerConfig, callback){
		var res = sourceUrl;
		var cuePointUrlKey = KalturaCache.getCuePointUrl(cuePointId);
		var data = {};
		
		KalturaCache.get(cuePointUrlKey, function(cachedUrl){
			if(cachedUrl){
				KalturaLogger.log('Cue point url found in cache: [' + cachedUrl + ']');
				KalturaCache.touch(cuePointUrlKey, KalturaConfig.config.cache.cuePoint);
				res = doMapTokens(cachedUrl, 'dynamic');
				callback(res);	
			}
			else{
				KalturaLogger.log('Cue point url not found in cache');
				res = doMapTokens(sourceUrl, 'fixed');		
				KalturaLogger.log('Saving cue point url in cache: [' + res + ']');
				KalturaCache.set(cuePointUrlKey, res, KalturaConfig.config.cache.cuePoint);
				
				res = doMapTokens(res, 'dynamic');
				callback(res);	
			}
		}, function (err) {
			KalturaLogger.log('Cue point url not found in cache: ' + err);
			res = doMapTokens(sourceUrl, 'fixed');
			KalturaLogger.log('Saving cue point url in cache: [' + res + ']');
			KalturaCache.set(cuePointUrlKey, res, KalturaConfig.config.cache.cuePoint);
			
			res = doMapTokens(res, 'dynamic');
			callback(res);	
		});
		
		var doMapTokens = function(url, type){
			
			buildEvaluationData(type);
			var parsedUrl = _url.parse(url, true);
			var queryString = parsedUrl.query;
			
			var defaultTokenValue = null;
			if(type == 'fixed')
				defaultTokenValue = '<token_placeholder>';
			
			for(var attributeName in queryString){
				var attributeValue = KalturaUrlTokenMapper.evaluate(data, queryString[attributeName], defaultTokenValue);
				KalturaLogger.log("Evaluated attribute: [" + attributeName + "] value: [" + attributeValue + "]");
				if(defaultTokenValue == null || attributeValue.indexOf(defaultTokenValue) < 0)					
					queryString[attributeName] = attributeValue;
			}
			
			parsedUrl.search = _qs.stringify(queryString);
			parsedUrl.query = queryString;
			return _url.format(parsedUrl);
		};
		
		var buildEvaluationData = function(type){
			
			if(type == 'fixed') { //set only fixed parameters
				data.mediaProxy = {};
				data.mediaProxy.entryMetadata = entryMetadata; 
				data.mediaProxy.entry = entry; 
			}
			else
			{
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
				data.utility.referrer_url = data.configProxy.flashvars.referrer;
				if(data.utility.referrer_url != null){
					var parsedReferrerUrl = _url.parse(data.utility.referrer_url);
					data.utility.referrer_host = parsedReferrerUrl.host;			
				}		
			}
		};
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
		    	if(obj.hasOwnProperty(path[i]))
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
};