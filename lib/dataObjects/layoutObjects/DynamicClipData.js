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
		return `{"type": "dynamic", "id": "${this.id}"}`;
	}
}
module.exports = DynamicClipData;
