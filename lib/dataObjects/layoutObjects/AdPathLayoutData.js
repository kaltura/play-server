/**
 * Data model to hold the Ad path links layout structure
 */
class AdPathLayoutData
{
	/**
	 * @constructor
	 */
	constructor()
	{
		this.path = null;
	}

	setPath(path)
	{
		if (!path)
			KalturaLogger.error('Argument path was not defined ');
		this.path = path;
	}

	toJSON()
	{
		return `{ "path": "${this.path}"}`;
	}
}
module.exports = AdPathLayoutData;
