class PathsGenerator {

	/**
	 * Returns the local path for a filler that is a flavor asset in the
	 * @param fillerId
	 * @returns {string}
	 * @private
	 */
	static getOriginFillerLocalPath(fillerId)
	{
		return `${KalturaConfig.config.cloud.sharedBasePath}/filler/${fillerId}`;
	}

	static getBlackFillerLocalPrefixPath()
	{
		return `${KalturaConfig.config.cloud.sharedBasePath}/filler/black`;
	}

	static getCustomFillerLocalPrefixPath()
	{
		return `${KalturaConfig.config.cloud.sharedBasePath}/filler/filler`;
	}

	static generateSpecificTranscodedPath(path, commandLine)
	{
		const identifier = commandLine.md5();
		return `${path}_${identifier}`;
	}

	static getOutTranscodingPath(outDir, data, isAd)
	{
		if (!isAd)
			return PathsGenerator.generateSpecificTranscodedPath(outDir, data);
		const adFileId = outDir.substr(outDir.lastIndexOf('/') + 1);
		const transcodePath = KalturaUtils.buildFilePath('ad_transcode', adFileId);
		return PathsGenerator.generateSpecificTranscodedPath(transcodePath, data);
	}

	static generateApiServerFlavorURL(partnerId, flavorId, pathOnly, uriPrefixFormat)
	{
		let url = KalturaConfig.config.client.serviceUrl;
		if (uriPrefixFormat)
			url = url + '/' + uriPrefixFormat;
		url = url + `/p/${partnerId}/serveFlavor/flavorId/${flavorId}`;
		if (pathOnly)
			url = url + '?pathOnly=1';
		return url;
	}
}
module.exports = PathsGenerator;
