const exec = require('child_process').exec;
const Promise = require('bluebird');
const fs = require('fs');
const KalturaMediaInfoResponse = require('./KalturaMediaInfoResponse');
const COMMAND_LINE = ' -show_streams -show_format -show_programs -v quiet -show_data -print_format json';

/**
 * class to that pulls mpeg info for every ad file that will be used later
 * todo we want this command to be cached as well
 */
class KalturaMediaInfo
{
	constructor(pathToMediaInfoExecutor = 'ffprobe')
	{
		this._pathToMediaInfoExecutor = pathToMediaInfoExecutor;
	}

	/**
	 * calculate the media info relevant to the ad
	 * @param pathToFile - the path to the file we wish to get the info from
	 */
	mediaInfoExec(pathToFile)
	{
		const This = this;

		return new Promise(function (resolve, reject)
		{
			function callback(error, result)
			{
				if (error)
					reject(error);
				else
				{
					const json = JSON.parse(result);
					resolve(new KalturaMediaInfoResponse(JSON.stringify(json)));
				}
			}
			fs.exists(pathToFile, function (exists)
			{
				if (exists)
				{
					const commandLine = `${This._pathToMediaInfoExecutor} -i ${pathToFile} ${COMMAND_LINE}`;
					exec(commandLine, callback);
				}
				else
					reject(`File [${pathToFile}] doesn\'t exists on the file system`);
			});
		});
	}
}
module.exports = KalturaMediaInfo;
