require('coffee-script/register');
require('../../../vendor/vast-client-js');

var vastClient = require('../../../vendor/vast-client-js/client');

KalturaVastParser = {	
	parse: function(vastUrl, headers, callback){				
		vastClient.get(vastUrl, headers, callback);	
	}
};

module.exports = KalturaVastParser;