const fs = require('fs');
const util = require('util');
const Promise = require('bluebird');
const TranscodingEngine = require('../../infra/TranscodingEngine');
const KalturaMediaInfo = require('../../utils/KalturaMediaInfo');
const PathsGenerator = require('./PathsGenerator');
const KalturaFFMpegCmdGenerator = require('../../utils/KalturaFFMpegCmdGenerator');
const TranscodedFileInfo = require('../../dataObjects/SimpleDataObjects/TranscodedFileInfo');
const KalturaTempFileHandler = require('../../utils/KalturaTempFileHandler');
const gTranscodingEngine = new TranscodingEngine('ffmpeg');
const gMediaInfo = new KalturaMediaInfo('ffprobe');
/* global KalturaLogger EMPTY_STRING FILE_STATUS ERROR_FILE_IS_TRANSCODING */

class TranscodingHelper {

	static getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outFilePrefixPath, isAd = false)
	{
		return new Promise(
			function (resolve, reject)
			{
				function successfullyGeneratedCommand(data)
				{
					KalturaLogger.log(`Generated command line for transcoding is ${data}`);
					const outPath = PathsGenerator.getOutTranscodingPath(outFilePrefixPath, data, isAd);
					KalturaLogger.log(`Calculated path is  ${outPath}`);
					const tmpPath = KalturaTempFileHandler._getTempFilePath(outPath);
					KalturaLogger.log(`Calculated tmp path is  ${tmpPath}`);
					const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, inPath, tmpPath);
					KalturaLogger.log(`Command that will be used for converting the ad is ${commandLine}`);
					resolve({ command: commandLine, path: outPath });
				}

				function failedToGenerateCommand(err)
				{
					KalturaLogger.error(`Failed to generate transcoding command for path: ${inPath} , due to : ${util.inspect(err)}`);
					reject(err);
				}
				KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId).then(
					successfullyGeneratedCommand, failedToGenerateCommand);
			}
		);
	}

	static transcodeAndSaveToDisk(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isAd = false)
	{
		return new Promise(
			function (resolve, reject)
			{
				function tryTranscodeFile(path, command)
				{
					const tmpFilePath = KalturaTempFileHandler._getTempFilePath(path);
					try
					{
						fs.writeFileSync(`${tmpFilePath}`, EMPTY_STRING, { flag: 'wx' });
						KalturaLogger.log(`created tmp file ${tmpFilePath}`);
						gTranscodingEngine.transcodeFile(command, flavorId, path).then(
							function (data)
							{
								KalturaLogger.log(`Managed to transcode and save file ${path}`);
								resolve(new TranscodedFileInfo(path, durationInSeconds));
							},
							function (err)
							{
								reject(`Failed to transcode file to path ${path} due to error: ${util.inspect(err)}`);
							}
						);
					}
					catch (ex)
					{
						if (ex.code === 'EEXIST')
							reject(`${ERROR_FILE_IS_TRANSCODING} ${path}`);
						else
							reject(`Failed to create tmp file ${tmpFilePath} , due to ${util.inspect(ex)}`);
					}
				}

				function gotCommandResponse(response)
				{
					KalturaTempFileHandler.getFileStatus(response.path).then(function (status)
					{
						switch (status)
						{
							case FILE_STATUS.READY:
								KalturaLogger.log(`File existed on local disk ${response.path}`);
								resolve(new TranscodedFileInfo(response.path, durationInSeconds));
								break;
							case FILE_STATUS.PROCESSING:
								reject(`${ERROR_FILE_IS_TRANSCODING} ${response.path}`);
								break;
							case FILE_STATUS.DOESNT_EXIST:
								KalturaUtils.createFilePath(response.path,
									() => tryTranscodeFile(response.path, response.command),
									(err) => reject(`Failed to create filePath to path ${response.path} ,due to error: ${util.inspect(err)}`)
								);
								break;
							default:
								reject(`Error: File ${response.path} doesn't have status`);
								break;
						}
					}, function (err) {
						reject(`Failed to get file status ,due to error: ${util.inspect(err)}`);
					});
				}

				TranscodingHelper.getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isAd).then(
					gotCommandResponse, reject);
		});
	}

	static transcodeExistingFileToDisk(flavorId, apiConnector, partnerId, inPath, outDir, durationInSeconds = null, isAd = false)
	{
		return new Promise( function(resolve,reject)
		{
			function parsedMediaInfo(mediaInfo)
			{
				if (durationInSeconds === null)
				{
					durationInSeconds = mediaInfo.getDuration();
					if (durationInSeconds === -1)
						reject('Could not determine media info duration');
				}
				TranscodingHelper.transcodeAndSaveToDisk(flavorId, mediaInfo.jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isAd).then(
					function(transcodedFileInfo){
						KalturaLogger.log(`Successfully genearted media info and transcoded ad to ${transcodedFileInfo.filePath}`);
						resolve(transcodedFileInfo);
					},
					function(err){
						reject(err);
					}
				);
			}

			function failedToParseMediaInfo(err)
			{
				KalturaLogger.log(`Failed to parse media info from ${inPath} due to ${util.inspect(err)}`);
				reject(err);
			}
			gMediaInfo.mediaInfoExec(inPath).then(
				parsedMediaInfo, failedToParseMediaInfo);
		});
	}

	static transcodeBlackFillerToDisk(flavorId, durationInSeconds, apiConnector, partnerId, outDir=null)
	{
		return TranscodingHelper.transcodeAndSaveToDisk(flavorId, null, durationInSeconds, apiConnector, partnerId, null, outDir, false);
	}

}
module.exports = TranscodingHelper;