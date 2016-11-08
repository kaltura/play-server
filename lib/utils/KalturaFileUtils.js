const exec = require('child_process').exec;
const Promise = require('bluebird');
const fs = require('fs');
const path = require('path');

class KalturaFileUtils
{
	static findFile(dir, filenamePreFix, fileNameSuffix = null)
	{
		return new Promise(function (resolve, reject)
		{
			function callback(err, files)
			{
				if (err)
					reject(err);
				else
				{
					let result = null;
					for (let i = 0; i < files.length; i++)
					{
						if (KalturaFileUtils._checkPrefixAndSuffix(files[i], filenamePreFix, fileNameSuffix))
						{
							if (result != null)
								reject('Error - found more then one match');
							result = files[i];
						}
					}
					if (result != null)
						resolve(path.join(dir, result));
					else
						reject(null);
				}
			}
			fs.readdir(dir, callback);
		});
	}

	static _checkPrefixAndSuffix(fileName, prefix, suffix = null)
	{
		if (suffix !== null)
			return fileName.startsWith(prefix) && fileName.endsWith(suffix);

		return fileName.startsWith(prefix);
	}

	static touchFile(pathToFile)
	{
		return new Promise(function (resolve, reject)
		{
			function callback(error, result)
			{
				if (error)
					reject(error);
				else
					resolve(result);
			}
			fs.exists(pathToFile, function (exists)
			{
				if (exists)
				{
					const commandLine = `touch ${pathToFile}`;
					exec(commandLine, callback);
				}
				else
					reject(`File [${pathToFile}] doesn\'t exists on the file system`);
			});
		});
	}

	/**
	 * delete all files that were modified before this date
	 * @param dirPath
	 * @param day
	 * @param month : 0 to 11
	 * @param year
	 */
	static deleteOldFiles(dirPath, day, month, year)
	{
		const beforeDate = new Date(year, month, day).getTime();
		const reqParams = { dir: dirPath, date: beforeDate };

		return KalturaFileUtils._readDirPromise(reqParams).
		then(KalturaFileUtils._cleanOldFilesHelper);
	}

	static _readDirPromise(params)
	{
		return new Promise(function (resolve, reject)
		{
			function callback(err, dirFiles)
			{
				if (err)
					reject(err);
				else
					resolve({ files: dirFiles, date: params.date, dir: params.dir });
			}

			fs.readdir(params.dir, callback);
		});
	}

	static _cleanOldFilesHelper(params)
	{
		return new Promise(function (resolve, reject)
		{
			const promiseArr = [];
			for (let i = 0; i < params.files.length; i++)
				promiseArr.push(KalturaFileUtils._handleFilePromise(path.join(params.dir, params.files[i]), params.date));
			const allPromises = Promise.all(promiseArr);
			allPromises.then(function (results)
			{
				resolve(results);
			}
			, function (err)
			{
				reject(err);
			});
		});
	}

	static _handleFilePromise(filePath, beforeDate)
	{
		return new Promise(function (resolve, reject)
		{
			function callback(err, stat)
			{
				if (err)
					reject(err);
				else
				{
					const modifiedTime = new Date(stat.mtime).getTime();
					if (beforeDate > modifiedTime)
					{
						KalturaFileUtils._deleteFile(filePath).
						then(function (data)
						{
							resolve(`deleted ${data}`);
						}, function (error)
						{
							reject(error);
						});
					}
					else
						resolve(filePath);
				}
			}
			fs.stat(filePath, callback);
		});
	}

	static _deleteFile(filePath)
	{
		return new Promise(function (resolve, reject)
		{
			function callback(err)
			{
				if (err)
					reject(err);
				else
					resolve(filePath);
			}
			fs.unlink(filePath, callback);
		});
	}

	static checkFileExistsSync(filepath)
	{
		try
		{
			const stats = fs.statSync(filepath);
			return stats.isFile() || stats.isDirectory();
		}
		catch (e)
		{
			return false;
		}

	}
}
module.exports = KalturaFileUtils;
