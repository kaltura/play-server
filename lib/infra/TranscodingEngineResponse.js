/**
 * class to hold the response from transcodingEngine request
 */
class TranscodingEngineResponse
{
	constructor(pathToLog, pathToFile)
	{
		this.pathToLogFile = pathToLog;
		this.pathToAdFile = pathToFile;
	}
}
module.exports = TranscodingEngineResponse;
