const TranscodingEngine = require('../../infra/TranscodingEngine');
const KalturaMediaInfo = require('../../utils/KalturaMediaInfo');
const PathsGenerator = require('./PathsGenerator');
const KalturaFFMpegCmdGenerator  = require('../../utils/KalturaFFMpegCmdGenerator');
const fs = require('fs');
const Promise = require('bluebird');
const gTranscodingEngine = new TranscodingEngine('ffmpeg');
const gMediaInfo = new KalturaMediaInfo('ffprobe');

class TranscodingHelper {

	static getAdaptedTranscodingCommand(flavorId, jsonInfo, duration, apiConnector, partnerId, inPath, outDir)
	{
		return new Promise( function(resolve,reject){
			function successfullyGeneratedCommand(data)
			{
				KalturaLogger.log(`Generated command line for transcoding is ${data}`);
				const outPath = PathsGenerator.generateSpecificTranscodedPath(outDir, data);
				KalturaLogger.log(`Calculated ad path is  ${outPath}`);
				const commandLine = KalturaFFMpegCmdGenerator.fillCmdLineFormat(data, inPath, outPath);
				KalturaLogger.log(`Command that will be used for converting the ad is ${commandLine}`);
				resolve({command:commandLine, path:outPath});
			}

			function failedToGenerateCommand(err)
			{
				KalturaLogger.error(`Failed to generate transcoding commmand for path: ${inPath} , due to : ${err}`);
				reject(err);
			}
			KalturaFFMpegCmdGenerator.generateCommandLineFormat(flavorId, jsonInfo, duration, apiConnector, partnerId).then(
				successfullyGeneratedCommand, failedToGenerateCommand);
		});
	}

	static transcodeAndSaveToDisk(flavorId, jsonInfo, duration, apiConnector, partnerId, inPath, outDir)
	{
		return new Promise( function(resolve, reject)
		{
			function gotCommandResponse(response)
			{
				fs.access(response.path, fs.constants.F_OK,
					function (err)
					{
						if (err === null)
						{
							KalturaLogger.log(`File existed on local disk ${response.path}`);
							resolve(response.path);
						}
						else
						{
							gTranscodingEngine.transcodeFile(response.command).then(
								function (data)
								{
									KalturaLogger.log(`Managed to transcode and save file ${response.path}`);
									resolve(response.path);
								}, function (err)
								{
									reject(err);
								}
							);
						}
					}
				);
			}

			function failedToGetCommand(err)
			{
				reject(err);
			}

			TranscodingHelper.getAdaptedTranscodingCommand(flavorId, jsonInfo, duration, apiConnector, partnerId, inPath, outDir).then(
				gotCommandResponse, failedToGetCommand);
		});
	}

	static transcodeExistingFileToDisk(flavorId, apiConnector, partnerId, inPath, outDir, duration=null)
	{
		return new Promise( function(resolve,reject)
		{
			function parsedMediaInfo(mediaInfo)
			{
				TranscodingHelper.transcodeAndSaveToDisk(flavorId, mediaInfo.jsonInfo, duration, apiConnector, partnerId, inPath, outDir).then(
					function(transcodedPath){
						KalturaLogger.log(`Successfully genearted media info and transcoded ad to ${transcodedPath}`);
						resolve(transcodedPath);
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

	static transcodeBlackFillerToDisk(flavorId, duration, apiConnector, partnerId, outDir=null)
	{
		return TranscodingHelper.transcodeAndSaveToDisk(flavorId, null, duration, apiConnector, partnerId, null, outDir);
	}
}
module.exports = TranscodingHelper;