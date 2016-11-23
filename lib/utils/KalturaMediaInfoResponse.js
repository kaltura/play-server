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
			for (let i = 0; i < mediaInfoObject.streams.length; i++) {
				if (mediaInfoObject.streams[i].codec_type === 'video') {
					if (mediaInfoObject.streams[i].duration)
						return parseFloat(mediaInfoObject.streams[i].duration);
					else if (mediaInfoObject.format.duration)
						return parseFloat(mediaInfoObject.format.duration);
					return durationInSeconds;
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
