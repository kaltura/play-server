/* global DYNAMIC_FLAG */
require('../PlayServerConstants');
/**
 * Dynamic clip is an ad break link
 */
class DynamicClipData
{
	/**
	 * @param id
	 * @constructor
	 */
	constructor(id)
	{
		this.id = id;
	}

	toJSON()
	{
		return { type: DYNAMIC_FLAG, id: this.id };
	}
}
module.exports = DynamicClipData;
