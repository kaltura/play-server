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

	static generateSpecificTranscodedPath(path, commandLine)
	{
		const identifier = commandLine.md5();
		return `${path}_${identifier}`;
	}

	static generateApiServerFlavorURL(partnerId, flavorId, pathOnly, drmFormat)
	{
		let url = KalturaConfig.config.client.serviceUrl;
		if (drmFormat)
			url = url + '/' + drmFormat;
		url = url + `/p/${partnerId}/serveFlavor/flavorId/${flavorId}`;
		if (pathOnly)
			return url + '?pathOnly=1';
		return url;
	}
}
module.exports = PathsGenerator;
