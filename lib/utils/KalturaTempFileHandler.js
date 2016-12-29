const Promise = require('bluebird');
const fs = require('fs');
const util = require('util');
require('../dataObjects/PlayServerConstants');

/* global KalturaLogger */

/**
 * class to handle transcoding tmp files
 */
class KalturaTempFileHandler
{
	/**
	 * returns the FILE_STATUS of a file which can be - READY/PROCESSING/DOESNT_EXIST
	 * @param filePath
	 * @returns {Promise.<TResult>}
	 */
	static getFileStatus(filePath)
	{
		return KalturaTempFileHandler._isFileExist(filePath).
		then(KalturaTempFileHandler._returnFileReady, KalturaTempFileHandler._returnFileNotReady);
	}

	static _returnFileReady()
	{
		return Promise.resolve(FILE_STATUS.READY);
	}

	static _returnFileProcessing()
	{
		return Promise.resolve(FILE_STATUS.PROCESSING);
	}

	static _returnFileDoesntExist()
	{
		return Promise.resolve(FILE_STATUS.DOESNT_EXIST);
	}

	static _returnFileNotReady(filePath)
	{
		return KalturaTempFileHandler._isFileExist(KalturaTempFileHandler._getTempFilePath(filePath)).
			then(KalturaTempFileHandler._returnFileProcessing, KalturaTempFileHandler._returnFileDoesntExist);
	}

	/**
	 * checks if $filePath exists
	 * @param filePath
	 * @private
	 */
	static _isFileExist(filePath)
	{
		return new Promise(function (resolve, reject)
		{
			function callback(err)
			{
				if (err === null)
				{
					KalturaLogger.debug(`File ${filePath} exist on local disk`);
					resolve(true);
				}
				else
				{
					KalturaLogger.debug(`File ${filePath} doesnt exist on local disk`);
					reject(filePath);
				}
			}
			fs.access(filePath, fs.constants.F_OK, callback);
		});
	}

	static getTmpFileSuffix()
	{
		return 'tmp';
	}

	static _getTempFilePath(filePath)
	{
		return `${filePath}.${KalturaTempFileHandler.getTmpFileSuffix()}`;
	}

	/**
	 * renames a file
	 * @param oldPath - the file old path
	 * @param newPath - the file new path
	 * @private
	 */
	static _renameTranscodedFile(oldPath, newPath, callback, errorCallback)
	{
		fs.rename(oldPath, newPath,
			function (err)
			{
				if (err === null)
				{
					KalturaLogger.log(`Renamed ${oldPath} to ${newPath}`);
					callback();
				}
				else
					errorCallback(`Failed to rename ${oldPath} to ${newPath} due to ${util.inspect(err)}`);
			}
		);
	}

	static onTranscodingFinished(filePath, callback, errorCallback)
	{
		KalturaTempFileHandler._renameTranscodedFile(
			KalturaTempFileHandler._getTempFilePath(filePath),
			filePath,
			callback,
			errorCallback
		);
	}

}
module.exports = KalturaTempFileHandler;
