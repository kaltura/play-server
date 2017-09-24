require('coffee-script/register');
require('../../../vendor/vast-client-js');

var vastClient = require('../../../vendor/vast-client-js/client');

KalturaVastParser = {	
	parse: function(vastUrl, headers, timeout, KalturaLogger, callback){				
		vastClient.get(vastUrl, headers, timeout, KalturaLogger, callback);	
	}
};

module.exports = KalturaVastParser;
