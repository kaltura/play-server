var crypto = require('crypto');
var querystring = require('querystring');

require('../utils/KalturaUtils');
require('../utils/KalturaConfig');
require('../utils/KalturaLogger');

var KalturaEncryption = function() {
};

KalturaEncryption.prototype = {
	encrypt : function(params, encryptedParams){
		var cipher = crypto.createCipher('AES-256-CBC', KalturaConfig.config.cloud.secret);

		var encrypted;
		try{
			encrypted = cipher.update(querystring.stringify(encryptedParams), 'utf8', 'base64');
			encrypted += cipher.final('base64');
		}
		catch(exception){
			KalturaLogger.error(exception.stack);
			return null;
		}

		params.e = encrypted.split('/').join('_');
		return params;
	},

	decrypt : function(params){
		var decipher = crypto.createDecipher('AES-256-CBC', KalturaConfig.config.cloud.secret);

		var encrypted = params.e.split('_').join('/');
		delete params.e;

		var decrypted;
		try{
			decrypted = decipher.update(encrypted, 'base64', 'utf8');
			decrypted += decipher.final('utf8');
		}
		catch(exception){
			KalturaLogger.error(exception.stack);
			return null;
		}

		var decryptedParams = querystring.parse(decrypted);

		for(var key in decryptedParams){
			params[key] = decryptedParams[key];
		}

		return params;
	}
};

module.exports.KalturaEncryption = KalturaEncryption;

