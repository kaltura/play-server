const Promise = require('bluebird');
const fs = require('fs');
require('../dataObjects/PlayServerConstants');

/**
 * class to handle transcoding tmp files
 */
class KalturaTempFileManager
{
	/**
	 * returns the FILE_STATUS of a file which can be - READY/PROCESSING/DOESNT_EXIST
	 * @param filePath
	 * @returns {Promise.<TResult>}
	 */
	static getFileStatus(filePath)
	{
		return KalturaTempFileManager._isFileExist(filePath).
		then(KalturaTempFileManager._returnFileReady, KalturaTempFileManager._returnFileNotReady);
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
		return KalturaTempFileManager._isFileExist(KalturaTempFileManager._getTempFilePath(filePath)).
			then(KalturaTempFileManager._returnFileProcessing, KalturaTempFileManager._returnFileDoesntExist);
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
					KalturaLogger.log(`File ${filePath} exist on local disk`);
					resolve(true);
				}
				else
				{
					KalturaLogger.log(`File ${filePath} doesnt exist on local disk`);
					reject(filePath);
				}
			}
			fs.access(filePath, fs.constants.F_OK, callback);
		});
	}

	static _getTempFilePath(filePath)
	{
		return `${filePath}.tmp`;
	}

	/**
	 * renames a file
	 * @param oldPath - the file old path
	 * @param newPath - the file new path
	 * @private
	 */
	static _renameTranscodedFile(oldPath, newPath)
	{
		fs.rename(oldPath, newPath,
			function (err)
			{
				if (err === null)
					KalturaLogger.log(`Renamed ${oldPath} to ${newPath}`);
				else
					KalturaLogger.error(`Failed to rename ${oldPath} to ${newPath}`);
			}
		);
	}

	static onTranscodingFinshed(filePath)
	{
		KalturaTempFileManager._renameTranscodedFile(KalturaTempFileManager._getTempFilePath(filePath), filePath);
	}

}
module.exports = KalturaTempFileManager;
