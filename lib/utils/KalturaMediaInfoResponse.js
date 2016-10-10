const util = require('util');
/**
 * class to hold the response from MediaInfo request
 */
class KalturaMediaInfoResponse
{
	constructor(jsonInfo)
	{
		this.jsonInfo = jsonInfo;
	}

	getDuration()
	{
		let durationInSeconds = -1;
		try {
			const mediaInfoObject = JSON.parse(this.jsonInfo);

			if (mediaInfoObject)
			{
				for (let i = 0; i < mediaInfoObject.streams.length; i++)
				{
					if (mediaInfoObject.streams[i]['codec_name'] === 'h264')
					{
						durationInSeconds = mediaInfoObject.streams[i]['duration'];
						durationInSeconds = parseFloat(durationInSeconds);
						return durationInSeconds;
					}
				}
			}
		}
		catch (e)
		{
			KalturaLogger.error(`Failed to parse media info as json for duration, got :${util.inspect(this.jsonInfo)}`);
		}
		return durationInSeconds;
	}

}
module.exports = KalturaMediaInfoResponse;
