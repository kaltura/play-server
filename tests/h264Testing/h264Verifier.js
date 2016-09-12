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
		h264Verifier.writeToLog(`called insertFlavorsPathToCache with ${flavorIds} and ${flavorPaths}`);
		const testTime = KalturaConfig.config.h264Verfication.cacheTime;
		for (let i = 0; i < flavorIds.length; i++)
		{
			KalturaCache.set(flavorIds[i], flavorPaths[i], testTime,
				function () {
					h264Verifier.writeToLog(`inserted flavorId ${flavorIds[i]} with path ${flavorPaths[i]} to cache`);
				},
				function () {
					h264Verifier.writeToLog(`unable to insert flavorId ${flavorIds[i]} with path ${flavorPaths[i]} to cache`);
				}, null);
		}
	}

	static verifyAd(flavorId, adPath)
	{
		h264Verifier.writeToLog(`called verifyAd with ${flavorId} and ${adPath}`);
		KalturaCache.get(flavorId,
			function (flavorPath) {
				h264Verifier.writeToLog(`got flavorId ${flavorId} from cache`);
				h264Verifier.runVerification(flavorId, flavorPath, adPath);
			},
			function (err) {
				h264Verifier.writeToLog(`faild to get flavorId ${flavorId} from cache`);
				h264Verifier.writeToLog(`got err - ${err}`);
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
		h264Verifier.writeToLog(`called runVerification with ${flavorId} , ${flavorPath} , ${adPath}`);
		const scriptsPath = KalturaConfig.config.h264Verfication.scriptsPath;

		h264Verifier.execPythonScript(`${scriptsPath}get_stsd_atoms.py ${flavorPath}`).then(function (flavorOutput) {
			h264Verifier.writeToLog(`--------[${flavorId}][flavor]--------------`);
			h264Verifier.writeToLog(`[${flavorId}][flavor] ${flavorOutput}`);
			h264Verifier.writeToLog(`--------[${flavorId}][flavor]--------------`);

			h264Verifier.execPythonScript(`${scriptsPath}get_stsd_atoms.py ${adPath}`).then(function (adOutput) {
				h264Verifier.writeToLog(`--------[${flavorId}][ad][${adPath}] --------------`);
				h264Verifier.writeToLog(`[${flavorId}][ad][${adPath}] ${adOutput}`);
				h264Verifier.writeToLog(`--------[${flavorId}][ad][${adPath}] --------------`);
			}, function (adErr) {
				h264Verifier.writeToLog(`[error][flavorId][${flavorId}][adPath][${adPath}] - ${adErr}`);
			});
		}, function (flavorErr) {
			h264Verifier.writeToLog(`[error][flavorId][${flavorId}] - ${flavorErr}`);
		});
	}

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

	static writeToLog(str)
	{
		fs.appendFile(KalturaConfig.config.h264Verfication.logPath, `${str}\n`);
	}
}
module.exports = h264Verifier;
