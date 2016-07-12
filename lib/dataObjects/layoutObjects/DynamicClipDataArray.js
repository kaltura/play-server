const DynamicClipData = require('./DynamicClipData');

/**
 * Helper class to handle insertion of DynamicClipData
 *
 */
class DynamicClipDataArray
{
	/**
	 *
	 * @constructor
	 * @param idsList
	 */
	constructor(idsList)
	{
		this.clips =  new Array();
		for (let i = 0; i < idsList.length; i++)
		{
			const clip = new DynamicClipData(idsList[i]);
			this.clips.push(clip);
		}
	}
}
module.exports = DynamicClipDataArray;
