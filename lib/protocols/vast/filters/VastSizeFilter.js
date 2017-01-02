const AdCreativeAnalyzer = require('./AdCreativeAnalyzer');
require('../../../utils/KalturaLogger');

/* global KalturaLogger */
/**
 * This class accepts a list of ads and
 */
class VastSizeFilter
{
	/**
	 *	from the ad creative media files returns the most fitting ad URL
	 */
	static filter(flavorAttributes, ad)
	{
		// if (!VastSizeFilter._isValidAdStructure(ad))
		// 	return null;
		const creative = ad.creatives[0];

		if (creative && creative.type === 'nonlinear') {
			const varia = creative.variations[0];
			const url = varia.staticResource;
			return url;
		}

		const bestAdFile = VastSizeFilter._findBestAdFile(ad, flavorAttributes);
		if (bestAdFile.fileURL)
			return bestAdFile.fileURL.trim();

		return null;
	}

	static _isValidAdStructure(ad)
	{
		return ad.creatives &&
			ad.creatives.length > 0 &&
			ad.creatives[0].mediaFiles &&
			ad.creatives[0].mediaFiles.length > 0;
	}

	/**
	 * @returns {URL to ad}
	 * @private
	 */
	static _findBestAdFile(ad, flavorAttributes)
	{
		// todo - currently we take the first creative - but there can be multiple
		const bestRatioAdFiles = ad.creatives[0].mediaFiles;
		let adFileCandidate = null;
		let adFileCandidateScore = 0;
		for (let i = 0; i < bestRatioAdFiles.length; i++)
		{
			if (bestRatioAdFiles[i].apiFramework === 'VPAID')
			{
				KalturaLogger.debug('Skipping VPAID apiFramework');
				continue;
			}
			const currentAdFile = bestRatioAdFiles[i];
			if (!adFileCandidate)
			{
				adFileCandidate = currentAdFile;
				adFileCandidateScore = new AdCreativeAnalyzer(flavorAttributes, currentAdFile).calculatedScore;
			}
			else
			{
				const newCandidateScore = new AdCreativeAnalyzer(flavorAttributes, currentAdFile).calculatedScore;
				if (newCandidateScore > adFileCandidateScore)
				{
					adFileCandidateScore = newCandidateScore;
					adFileCandidate = currentAdFile;
				}
			}
		}
		return adFileCandidate;
	}

}
module.exports = VastSizeFilter;
