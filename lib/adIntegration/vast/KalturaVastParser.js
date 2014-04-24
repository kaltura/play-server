require('coffee-script/register');
require('../../vendor/vast-client-js');

var vastClient = require('../../vendor/vast-client-js/client');

KalturaVastParser = {	
	parse: function(vastUrl, playerConfig, headers, callback){				
		// TODO - apply playerConfig on the vastUrl	
		//TODO - pass headers to get function
		vastClient.get(vastUrl, callback);	
	}
};

module.exports = KalturaVastParser;