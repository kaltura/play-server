const Promise = require('bluebird');
const exec = require('child_process').exec;
const fs = require('fs');
require('../../lib/utils/KalturaConfig');
require('../../lib/utils/KalturaCache');

/**
 * this class is used to verify that mp4s that compose a single flavor has the same h264 values
 */
class h264Verifier
{
	/**
	 * inserts the flavor ids and flavor paths to the cache
	 * @param flavorId
	 * @param flavorPath
	 */
	static insertFlavorPathToCache(flavorId, flavorPath)
	{
		h264Verifier.writeToLog(`called insertFlavorsPathToCache with ${flavorId} and ${flavorPath}`);
		const testTime = KalturaConfig.config.h264Verification.cacheTime;

		KalturaCache.set(flavorId, { path: flavorPath }, testTime,
			function () {
				h264Verifier.writeToLog(`inserted flavorId ${flavorId} with path ${flavorPath} to cache`);
			},
			function () {
				h264Verifier.writeToLog(`unable to insert flavorId ${flavorId} with path ${flavorPath} to cache`);
			}, null);
	}

	/**
	 * calls the verification function with the flavorPath and the adPath
	 * @param flavorId
	 * @param adPath
	 */
	static verifyAd(flavorId, adPath)
	{
		h264Verifier.writeToLog(`called verifyAd with ${flavorId} and ${adPath}`);
		KalturaCache.get(flavorId,
			function (flavorPath) {
				h264Verifier.writeToLog(`got flavorId ${flavorId} from cache`);
				h264Verifier.runVerification(flavorId, flavorPath.path, adPath);
			},
			function (err) {
				h264Verifier.writeToLog(`faild to get flavorId ${flavorId} from cache`);
				h264Verifier.writeToLog(`got err - ${err}`);
			});
	}

	/**
	 * runs the script on the flavor and the ad and calls verifyScriptOutput function on the results
	 * @param flavorId
	 * @param flavorObj
	 * @param adPath
	 */
	static runVerification(flavorId, flavorPath, adPath)
	{
		h264Verifier.writeToLog(`called runVerification with flavorId - ${flavorId} , flavorPath - ${flavorPath} , adPath - ${adPath}`);
		const scriptsPath = KalturaConfig.config.h264Verification.scriptsPath;

		h264Verifier.execPythonScript(`${scriptsPath}get_stsd_atoms.py ${flavorPath}`).then(function (flavorOutput) {
			h264Verifier.execPythonScript(`${scriptsPath}get_stsd_atoms.py ${adPath}`).then(function (adOutput) {
				h264Verifier.verifyScriptOutput(flavorId, adPath, flavorOutput, adOutput);
			}, function (adErr) {
				h264Verifier.writeToLog(`[error][flavorId][adPath][${adPath}] - ${adErr}`);
			});
		}, function (flavorErr) {
			h264Verifier.writeToLog(`[error][flavorId][${flavorId}] - ${flavorErr}`);
		});
	}

	/**
	 * verify the results
	 * @param flavorId
	 * @param adPath
	 * @param flavorOutput
	 * @param adOutput
	 */
	static verifyScriptOutput(flavorId, adPath, flavorOutput, adOutput)
	{
		const flavorArray = flavorOutput.split('\n');
		const videoResultArray = [];
		const audioResultArray = [];
		for (let i = 0; i < flavorArray.length; i++)
		{
			if (flavorArray[i] === 'vide')
				videoResultArray[flavorArray[i]] = i;
			if (flavorArray[i] === 'soun')
				audioResultArray[flavorArray[i]] = i;
		}
		const adArray = adOutput.split('\n');
		for (let i = 0; i < adArray.length; i++)
		{
			if (adArray[i] === 'vide')
				videoResultArray[adArray[i]] = i;
			if (adArray[i] === 'soun')
				audioResultArray[adArray[i]] = i;
		}
		if (videoResultArray.length !== 1 || audioResultArray.length !== 1)
		{
			let errorMsg = `*****[error] verification of flavor ${flavorId} and ad ${adPath} failed *****\n`;
			errorMsg += `[flavorId ${flavorId} output]\n${flavorOutput}\n[ad ${adPath} output]\n${adOutput}\n`;
			errorMsg += `****[error - end][${flavorId}][${adPath}]******`;
			h264Verifier.writeToLog(errorMsg);
		}
		else
			h264Verifier.writeToLog(`[success] verification of flavor ${flavorId} and ad ${adPath} success`);
	}

	/**
	 * function to exec python scripts
	 * @param commandLine
	 */
	static execPythonScript(commandLine)
	{
		h264Verifier.writeToLog(`called execPythonScript with ${commandLine}`);
		return new Promise(function (resolve, reject)
		{
			const runCommandLine = `python  ${commandLine}`;

			function callback(error, stdout)
			{
				if (error)
					reject(error);

				else
					resolve(stdout);
			}
			exec(runCommandLine, callback);
		});
	}

	/**
	 * writes str to a logFile, the logFilePath is defined in the config and must exist
	 * @param str
	 * @param logFileName
	 */
	static writeToLog(str)
	{
		fs.appendFile(`${KalturaConfig.config.h264Verification.logPath}`, `${str}\n`);
	}
}
module.exports = h264Verifier;
