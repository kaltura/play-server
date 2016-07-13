const SourceClipData = require('./SourceClipData');
/**
 * Helper constructor for SourceClipData as array
 * @param offset
 * @param pathList map from flavor id to path
 * @constructor
 */
class SourceClipDataArray
{
	constructor(offset, pathList)
	{
		this.clips = [];
		for (let i = 0; i < pathList.length; i++)
		{
			const clip = new SourceClipData(offset, pathList[i]);
			this.clips.push(clip);
		}
	}
}
module.exports = SourceClipDataArray;
