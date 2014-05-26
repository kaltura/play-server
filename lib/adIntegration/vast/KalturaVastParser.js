require('coffee-script/register');
require('../../../vendor/vast-client-js');

var vastClient = require('../../../vendor/vast-client-js/client');

KalturaVastParser = {	
	parse: function(vastUrl, headers, callback){				
		vastClient.get(vastUrl, callback);	
	}
};

module.exports = KalturaVastParser;