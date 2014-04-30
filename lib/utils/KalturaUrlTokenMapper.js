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
	
	mapTokens: function(sourceUrl, entry, entryMetadata, playerConfig){
		var res = sourceUrl;
		var data = this.buildEvaluationData(entry, entryMetadata, playerConfig);
		//TODO: get cached url with replaced tokens by cuePoint id
		//TODO: need to replace only the fixed tokens first and cache the url
		var parsedUrl = _url.parse(sourceUrl, true);
		var queryString = parsedUrl.query;
		for(var attributeName in queryString){
			var attributeValue = this.evaluate(data, queryString[attributeName]);
			KalturaLogger.log("Evaluated attribute: [" + attributeName + "] value: [" + attributeValue + "]");
			queryString[attributeName] = attributeValue;
		}
		
		parsedUrl.search = _qs.stringify(queryString);
		parsedUrl.query = queryString;
		res = _url.format(parsedUrl);
		return res;	
	},
	
	buildEvaluationData: function(entry, entryMetadata, playerConfig){
		var data = {};
		data.mediaProxy = {};
		data.mediaProxy.entryMetadata = entryMetadata; 
		data.mediaProxy.entry = entry; 
		data.configProxy = {};
		data.configProxy.flashvars = {};
		if(playerConfig){
			for(var attr in playerConfig){
				data.configProxy.flashvars[attr] = playeConfig[attr];
			}			
		}
		//mediaSession plugin - TODO ?		
		return data;
	},

	/**
	 * Emulates kaltura evaluate function
	 *
	*/
	evaluate : function(data, objectString, limit) {
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
			result = _this.evaluateExpression(data, objectString.substring(1, objectString.length - 1));
		} else if (objectString.split('{').length > 1) { // Check if we are doing a string based evaluate concatenation:
			// Replace any { } calls with evaluated expression.
			result = objectString.replace(/\{([^\}]*)\}/g, function(match, contents, offset, s) {
				return _this.evaluateExpression(data, contents);
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
			result = this.evaluate(data, result, limit++);
		}
		return result;
	},
	/**
	 * Normalize evaluate expression
	 */
	getEvaluateExpression : function(data, expression) {
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
		    		return null;
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
	evaluateExpression : function(data, expression) {
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

		var evalVal = this.getEvaluateExpression(data, expression);
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