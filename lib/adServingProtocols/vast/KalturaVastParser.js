require('coffee-script/register');
require('../../../vendor/vast-client-js');

var vastClient = require('../../../vendor/vast-client-js/client');

KalturaVastParser = {	
	parse: function(vastUrl, headers, timeout, callback){				
		vastClient.get(vastUrl, headers, timeout, callback);	
	}
};

module.exports = KalturaVastParser;