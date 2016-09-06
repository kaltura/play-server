class PathsGenerator {

	/**
	 * Returns the local path for a filler that is a flavor asset in the
	 * @param fillerId
	 * @returns {string}
	 * @private
	 */
	static getOriginFillerLocalPath(fillerId)
	{
		return KalturaConfig.config.cloud.sharedBasePath + '/filler/' + fillerId;
	}

	static getBlackFillerLocalPath(cmdLine)
	{
		return KalturaConfig.config.cloud.sharedBasePath + '/filler/black_' + cmdLine.md5();
	}

	static generateSpecificTranscodedPath(path, commandLine)
	{
		const identifier = commandLine.md5();
		return `${path}_${identifier}`;
	}
}
module.exports = PathsGenerator;
