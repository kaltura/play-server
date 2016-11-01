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

class TranscodingHelper {

	static getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir)
	{
		return new Promise( function(resolve,reject){
			function successfullyGeneratedCommand(data)
			{
				KalturaLogger.log(`Generated command line for transcoding is ${data}`);
				const outPath = PathsGenerator.generateSpecificTranscodedPath(outDir, data);
				KalturaLogger.log(`Calculated path is  ${outPath}`);
				const tmpPath = KalturaTempFileHandler._getTempFilePath(outPath);
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

	static transcodeAndSaveToDisk(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir)
	{

		return new Promise( function(resolve, reject)
		{
			function gotCommandResponse(response)
			{
				const namespace = continuationLocalStorage.getNamespace('play-server');
				fs.access(response.path, fs.constants.F_OK,
					namespace.bind(function (err)
					{
						if (err === null)
						{
							KalturaLogger.log(`File existed on local disk ${response.path}`);
							resolve(new TranscodedFileInfo(response.path, durationInSeconds));
						}
						else
						{
							gTranscodingEngine.transcodeFile(response.command, flavorId, response.path).then(
								function (data)
								{
									KalturaLogger.log(`Managed to transcode and save file ${response.path}`);
									resolve(new TranscodedFileInfo(response.path, durationInSeconds));
								}, function (err)
								{
									reject(err);
								}
							);
						}
					})
				);
			}

			function failedToGetCommand(err)
			{
				reject(err);
			}

			TranscodingHelper.getAdaptedTranscodingCommand(flavorId, jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir).then(
				gotCommandResponse, failedToGetCommand);
		});
	}

	static transcodeExistingFileToDisk(flavorId, apiConnector, partnerId, inPath, outDir, durationInSeconds=null)
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
				TranscodingHelper.transcodeAndSaveToDisk(flavorId, mediaInfo.jsonInfo, durationInSeconds, apiConnector, partnerId, inPath, outDir).then(
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
		return TranscodingHelper.transcodeAndSaveToDisk(flavorId, null, durationInSeconds, apiConnector, partnerId, null, outDir);
	}
}
module.exports = TranscodingHelper;