const Promise = require('bluebird');
const exec = require('child_process').exec;
const TranscodingEngineResponse = require('./TranscodingEngineResponse');
const fs = require('fs');
const path = require('path');
const H264Verifier = require('../../tests/h264Testing/h264Verifier');
const KalturaTempFileHandler = require('../utils/KalturaTempFileHandler');
/**
 * class to handle transcoding
 */
class TranscodingEngine
{

	constructor(transcoderPath = 'ffmpeg')
	{
		this._transcoderPath = transcoderPath;
	}

	static validateFilePaths(sourceFilePath, pathToSave)
	{
		return new Promise(function (resolve, reject)
		{
			fs.exists(sourceFilePath, function (exists)
			{
				if (exists)
				{
					const dirPathToSave = path.dirname(pathToSave);
					fs.exists(dirPathToSave, function (pathexists)
					{
						if (pathexists)
							resolve(true);
						else
							reject(`[${dirPathToSave}] doesn\'t exists on the file system`);
					});
				}
				else
					reject(`File [${sourceFilePath}] doesn\'t exists on the file system`);
			});
		});
	}

	transcodeFile(commandLine, flavorId = null, adPath = null)
	{
		const This = this;
		return new Promise(function (resolve, reject)
		{
			const runCommandLine = `${This._transcoderPath} ${commandLine}`;

			KalturaLogger.log(`Transcode command that run is ${runCommandLine}`);
			function callback(error, stdout, stderr)
			{
				if (error)
					reject(error);

				else
				{
					KalturaTempFileHandler.onTranscodingFinshed(adPath);
					if (KalturaConfig.config.h264Verification.enabled === 'true')
						H264Verifier.verifyAd(flavorId, adPath);
					resolve(new TranscodingEngineResponse(stderr, ''));
				}
				/**
				 * ffmpeg sends all diagnostic messages (the "console output") to stderr because its actual output (the media stream) can go
				 * to stdout and mixing the diagnostic messages with the media stream would brake the output.
				 */
			}
			exec(runCommandLine, callback);
		});
	}
}
module.exports = TranscodingEngine;
