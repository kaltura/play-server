const fs = require('fs');
const util = require('util');
const Promise = require('bluebird');
const TranscodingEngine = require('../../infra/TranscodingEngine');
const KalturaMediaInfo = require('../../utils/KalturaMediaInfo');
const PathsGenerator = require('./PathsGenerator');
const KalturaFFMpegCmdGenerator = require('../../utils/KalturaFFMpegCmdGenerator');
const TranscodedFileInfo = require('../../dataObjects/SimpleDataObjects/TranscodedFileInfo');
const continuationLocalStorage = require('continuation-local-storage');

const gTranscodingEngine = new TranscodingEngine('ffmpeg');
const gMediaInfo = new KalturaMediaInfo('ffprobe');
const KalturaTempFileHandler = require('../../utils/KalturaTempFileHandler');

class TranscodingHelper
{
	static getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isAd = false)
	{
		return new Promise( function(resolve,reject){
			function successfullyGeneratedCommand(data)
			{
				KalturaLogger.log(`Generated command line for transcoding is ${data}`);
				const outPath = TranscodingHelper.getOutPath(outDir, data, isAd);
				KalturaLogger.log(`Calculated path is  ${outPath}`);
				const tmpPath = KalturaTempFileHandler._getTempFilePath(outPath);
				KalturaLogger.log(`Calculated tmp path is  ${tmpPath}`);
				const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, inPath, tmpPath);
				KalturaLogger.log(`Command that will be used for converting the ad is ${commandLine}`);
				resolve({command:commandLine, path:outPath});
			}

			function failedToGenerateCommand(err)
			{
				KalturaLogger.error(`Failed to generate transcoding commmand for path: ${inPath} , due to : ${err}`);
				reject(err);
			}
			KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId).then(
				successfullyGeneratedCommand, failedToGenerateCommand);
		});
	}

	static transcodeAndSaveToDisk(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isAd = false)
	{
		return new Promise( function(resolve, reject)
		{
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
								function(){
									try
									{
										fs.writeFileSync(`${response.path}.tmp`, '', { flag: 'wx' });
										KalturaLogger.log(`created tmp file ${response.path}.tmp`);
										gTranscodingEngine.transcodeFile(response.command, flavorId, response.path).then(
											function (data){
												KalturaLogger.log(`Managed to transcode and save file ${response.path}`);
												resolve(new TranscodedFileInfo(response.path, durationInSeconds));
											}, function(err)
											{
												reject(`Failed to transcode file to path ${response.path} due to error: ${err}`);
											}
										);
									}
									catch (ex)
									{
										reject(`Failed to create tmp file ${response.path}.tmp , due to ${ex}`);
									}
								},
								function (err)
								{
									reject(`Failed to create filePath to path ${response.path} ,due to error: ${err}`);
								});
							break;
						default:
							reject(`Error: File ${response.path} doesn't have status`);
							break;
					}
				}, function (err) {
					reject(`Failed to get file status ,due to error: ${err}`);
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
				KalturaLogger.log(`Failed to parse media info from ${inPath} due to ${err}`);
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

	static getOutPath(outDir, data, isAd)
	{
		if (!isAd)
			return PathsGenerator.generateSpecificTranscodedPath(outDir, data);
		else
		{
			const adFileId = outDir.substr(outDir.lastIndexOf('/') + 1);
			const transcodePath = KalturaUtils.buildFilePath('ad_transcode', adFileId);
			return PathsGenerator.generateSpecificTranscodedPath(transcodePath, data);
		}
	}
}
module.exports = TranscodingHelper;