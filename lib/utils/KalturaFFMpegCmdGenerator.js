const util = require('util');

/**
 * return a command line that should be used by the transcoding engine to transcode the ad
 */
class KalturaFFMpegCmdGenerator
{
	/**
	 * returns a command line format (ex - "-i %s -y %s")
	 * @param flavorId
	 * @param MediaInfoJson
	 * @param apiConnector
	 * @returns {*}
	 */
	static generateCommandLineFormat(flavorId, MediaInfoJson, apiConnector)
	{
		return apiConnector.handleRequset('flavorAsset', 'serveAdStitchCmd', [flavorId, MediaInfoJson]);
	}

	/**
	 * fills the command line format with source path and output path
	 * @param format
	 * @param sourcePath
	 * @param outputPath
	 * @returns command line string
	 */
	static fillCmdLineFormat(format, sourcePath, outputPath)
	{
		return util.format(format, sourcePath, outputPath);
	}

}
module.exports = KalturaFFMpegCmdGenerator;
