/**
 * This is an abstract class and should be used for hierarchy only
 *
 */
const TinyUrl = require('../infra/TinyUrl');
class BaseURLIdentifier
{
	constructor()
	{
		if (new.target === BaseURLIdentifier)
			KalturaLogger.error('Should not initiate BaseURLIdentifier');
		if (this.fromBase64 === 'undefined')
			KalturaLogger.error('Extending BaseURLIdentifier must implement fromBase64');
	}

	/**
	 * Encodes the BaseURLIdentifier to base 64 - should be used with fromBase64 to decode
	 * @returns {*}
	 */
	toBase64()
	{
		const stringRepresentation = JSON.stringify(this);
		return KalturaUtils.encodeString(stringRepresentation);
	}
}
module.exports = BaseURLIdentifier;
