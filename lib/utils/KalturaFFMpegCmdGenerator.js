const util = require('util');

/**
 * return a command line that should be used by the transcoding engine to transcode the ad
 */
class KalturaFFMpegCmdGenerator
{
	/**
	 * returns a command line format (ex - "-i __inFileName__ -y __outFileName__")
	 * @param flavorId
	 * @param MediaInfoJson
	 * @param duration
	 * @param apiConnector
	 * @
	 * @returns {*}
	 */
	static generateCommandLineFormat(flavorId, MediaInfoJson, duration, apiConnector, impersonateId = null)
	{
		return apiConnector.handleApiRequest('flavorAsset', 'serveAdStitchCmd', [flavorId, MediaInfoJson, duration], impersonateId);
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
		function match(value)
		{
			if (value === '__inFileName__')
				return sourcePath;
			if (value === '__outFileName__')
				return outputPath;
			return null;
		}
		format = format.replace(/__inFileName__|__outFileName__/gi, match);
		return format;
	}

}
module.exports = KalturaFFMpegCmdGenerator;
