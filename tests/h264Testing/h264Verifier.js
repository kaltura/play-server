const Promise = require('bluebird');
const exec = require('child_process').exec;
const fs = require('fs');
require('../../lib/utils/KalturaConfig');
require('../../lib/utils/KalturaCache');

class h264Verifier
{
	/**
	 * @param flavorIds - array of flavor ids
	 * @param flavorPaths - array of flavor paths
	 */
	static insertFlavorsPathToCache(flavorIds, flavorPaths)
	{
		h264Verifier.writeToLog(`called insertFlavorsPathToCache with ${flavorIds} and ${flavorPaths}`, 'h264.log');
		const testTime = KalturaConfig.config.h264Verfication.cacheTime;
		for (let i = 0; i < flavorIds.length; i++)
		{
			KalturaCache.set(flavorIds[i], { path: flavorPaths[i] }, testTime,
				function () {
					h264Verifier.writeToLog(`inserted flavorId ${flavorIds[i]} with path ${flavorPaths[i]} to cache`, 'h264.log');
				},
				function () {
					h264Verifier.writeToLog(`unable to insert flavorId ${flavorIds[i]} with path ${flavorPaths[i]} to cache`, 'h264.log');
				}, null);
		}
	}

	static verifyAd(flavorId, adPath)
	{
		h264Verifier.writeToLog(`called verifyAd with ${flavorId} and ${adPath}`, 'h264.log');
		KalturaCache.get(flavorId,
			function (flavorPath) {
				h264Verifier.writeToLog(`got flavorId ${flavorId} from cache`, 'h264.log');
				h264Verifier.runVerification(flavorId, flavorPath.path, adPath);
			},
			function (err) {
				h264Verifier.writeToLog(`faild to get flavorId ${flavorId} from cache`, 'h264.log');
				h264Verifier.writeToLog(`got err - ${err}`, 'h264.log');
			});
	}

	/**
	 * runs verification on flavor and ad
	 * @param flavorId
	 * @param flavorObj
	 * @param adPath
	 */
	static runVerification(flavorId, flavorPath, adPath)
	{
		h264Verifier.writeToLog(`called runVerification with flavorId - ${flavorId} , flavorPath - ${flavorPath} , adPath - ${adPath}`, 'h264.log');
		const scriptsPath = KalturaConfig.config.h264Verfication.scriptsPath;

		h264Verifier.execPythonScript(`${scriptsPath}get_stsd_atoms.py ${flavorPath}`).then(function (flavorOutput) {
			h264Verifier.writeToLog(`--------[${flavorId}][flavor]--------------`, `${flavorId}.log`);
			h264Verifier.writeToLog(`${flavorOutput}`, `${flavorId}.log`);
			h264Verifier.writeToLog(`--------[${flavorId}][flavor]--------------`, `${flavorId}.log`);

			h264Verifier.execPythonScript(`${scriptsPath}get_stsd_atoms.py ${adPath}`).then(function (adOutput) {
				h264Verifier.writeToLog(`--------[ad][${adPath}]--------------`, `${flavorId}.log`);
				h264Verifier.writeToLog(`${adOutput}`, `${flavorId}.log`);
				h264Verifier.writeToLog(`--------[ad][${adPath}]--------------`, `${flavorId}.log`);
			}, function (adErr) {
				h264Verifier.writeToLog(`[error][flavorId][adPath][${adPath}] - ${adErr}`, `${flavorId}.log`);
			});
		}, function (flavorErr) {
			h264Verifier.writeToLog(`[error][flavorId][${flavorId}] - ${flavorErr}`, `${flavorId}.log`);
		});
	}

	static execPythonScript(commandLine)
	{
		h264Verifier.writeToLog(`called execPythonScript with ${commandLine}`, 'h264.log');
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

	static writeToLog(str, logFileName)
	{
		fs.appendFile(`${KalturaConfig.config.h264Verfication.logPath}${logFileName}`, `${str}\n`);
	}
}
module.exports = h264Verifier;
