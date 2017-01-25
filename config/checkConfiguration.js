const ini = require('node-ini');

function validateRecursively(template, real, fileName)
{
	for (let attribute in template)
	{
		// first we check it exists in both
		if (!real.hasOwnProperty(attribute))
		{
			console.log(`Missing ${attribute} on ${fileName}`);
		}
		else
		{
			if (typeof template[attribute][Symbol.iterator] === 'function' )
				validateRecursively(template[attribute], real[attribute], fileName);
		}
	}
}

let realConfig = ini.parseSync('./config.ini');
let templateConfig = ini.parseSync('./config.ini.template');

validateRecursively(templateConfig, realConfig, 'config.ini');

realConfig = ini.parseSync('./managers.ini');
templateConfig = ini.parseSync('./managers.ini.template');

validateRecursively(templateConfig, realConfig, 'managers.ini');
