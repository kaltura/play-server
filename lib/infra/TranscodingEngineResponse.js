/**
 * class to hold the response from transcodingEngine request
 */
class TranscodingEngineResponse
{
	constructor(transcoderResponse, linkToFile)
	{
		this.transcoderResponse = transcoderResponse;
		this.linkToFile = linkToFile;
	}
}
module.exports = TranscodingEngineResponse;
