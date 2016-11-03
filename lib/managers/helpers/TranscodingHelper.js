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
	static getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isFiller = true)
	{
		return new Promise( function(resolve,reject){
			function successfullyGeneratedCommand(data)
			{
				KalturaLogger.log(`Generated command line for transcoding is ${data}`);
				const outPath = TranscodingHelper.getOutPath(outDir, data, isFiller);
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

	static transcodeAndSaveToDisk(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isFiller = true)
	{
		return new Promise( function(resolve, reject)
		{
			function gotCommandResponse(response)
			{
				const namespace = continuationLocalStorage.getNamespace('play-server'); //todo
				//namespace.bind // todo
				KalturaTempFileHandler.getFileStatus(response.path).then( function (status)
				{
					switch (status)
					{
						case FILE_STATUS.READY:
							KalturaLogger.log(`File existed on local disk ${response.path}`);
							resolve(new TranscodedFileInfo(response.path, durationInSeconds));
							break;
						case FILE_STATUS.PROCESSING:
							KalturaLogger.log(`File is currently transcoding on local disk ${response.path}`);
							reject('File is currently transcoding on local disk');
							break;
						case FILE_STATUS.DOESNT_EXIST:
							KalturaUtils.createFilePath(response.path,
								function(){
									gTranscodingEngine.transcodeFile(response.command, flavorId, response.path).then(
										function (data){
											KalturaLogger.log(`Managed to transcode and save file ${response.path}`);
											resolve(new TranscodedFileInfo(response.path, durationInSeconds));
										}, function(err)
										{
											KalturaLogger.error(`Failed to transcode file to path ${response.path} due to error: ${err}`);
											reject(err);
										}
									);
								},
								function (err)
								{
									KalturaLogger.error(`Failed to create filePath to path ${response.path} ,due to error: ${err}`);
								});
							break;
						default:
							reject(`Error: File ${response.path} doesn't have status`);
							break;
					}
				}, function (err) {
					KalturaLogger.error(`Failed to get file status ,due to error: ${err}`);
					reject(err);
				});
			}

			function failedToGetCommand(err)
			{
				reject(err);
			}

			TranscodingHelper.getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isFiller).then(
				gotCommandResponse, failedToGetCommand);
		});
	}

	static transcodeExistingFileToDisk(flavorId, apiConnector, partnerId, inPath, outDir, durationInSeconds=null, isFiller=true)
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
				TranscodingHelper.transcodeAndSaveToDisk(flavorId, mediaInfo.jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir, isFiller).then(
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
		return TranscodingHelper.transcodeAndSaveToDisk(flavorId, null, durationInSeconds, apiConnector, partnerId, null, outDir, true);
	}

	static getOutPath(outDir, data, isFiller)
	{
		if (isFiller)
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