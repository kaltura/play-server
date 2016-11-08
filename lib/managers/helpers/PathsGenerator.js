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
