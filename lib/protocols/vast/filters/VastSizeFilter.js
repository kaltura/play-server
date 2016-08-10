const KalturaAspectRatio = require('../../../media/KalturaAspectRatio');

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
		if (!VastSizeFilter._isValidAdStructure(ad))
			return null;
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

	static _selectAdFilesWithBestAspectRatio(adMediaFiles, flavorWidth, flavorHeight)
	{
		const aspectRatioKeys = [];
		const bestAdFiles = [];
		const relevantAdMediaFiles = [];
		for (let i = 0; i < adMediaFiles.length; i++)
		{
			//skip media files with apiFramework=VPAID
			if (adMediaFiles[i].apiFramework === 'VPAID')
			{
				KalturaLogger.log('Skipping VPAID apiFramework');
				continue;
			}
			const aspectRatio = KalturaAspectRatio.convertFrameSize(adMediaFiles[i].width, adMediaFiles[i].height);
			aspectRatioKeys.push(aspectRatio);
			relevantAdMediaFiles.push(adMediaFiles[i]);
		}

		const bestAspectRatio = KalturaAspectRatio.convertFrameSizeForAspectRatioKeys(flavorWidth, flavorHeight, aspectRatioKeys);

		for (let i = 0; i < aspectRatioKeys.length; i++)
		{
			if (aspectRatioKeys[i] === bestAspectRatio)
				bestAdFiles.push(relevantAdMediaFiles[i]);
		}
		return bestAdFiles;
	}

	static _chooseBetterFile(original, current, bestSoFar)
	{
		const currentWidthDiff = current.width - original.width;
		const bestSoFarWidthDiff = bestSoFar.width - original.width;

		const currentHeightDiff = current.height - original.height;
		const bestSoFarHeightDiff = bestSoFar.height - original.height;

		let currentAbsDiffValue = Math.abs(currentWidthDiff) + Math.abs(currentHeightDiff);
		let bestSoFarAbsDiffValue = Math.abs(bestSoFarWidthDiff) + Math.abs(bestSoFarHeightDiff);
		let currentDiffValue = currentWidthDiff + currentHeightDiff;
		let bestSoFarDiffValue = bestSoFarWidthDiff + bestSoFarHeightDiff;

		if ( // comparison by width and height
			(((currentDiffValue >= 0 && bestSoFarDiffValue >= 0) || (currentDiffValue < 0 && bestSoFarDiffValue < 0)) && (currentAbsDiffValue < bestSoFarAbsDiffValue)) ||
			(currentDiffValue >= 0 && bestSoFarDiffValue < 0)
		)
			return current;

		const currBitrateDiff = current.bitrate - original.bitrate;
		const bestSoFarBitrateDiff = bestSoFar.bitrate - original.bitrate;
		currentAbsDiffValue = currentAbsDiffValue + Math.abs(currBitrateDiff);
		bestSoFarAbsDiffValue = bestSoFarAbsDiffValue + Math.abs(bestSoFarBitrateDiff);
		currentDiffValue = currentDiffValue + currBitrateDiff;
		bestSoFarDiffValue = bestSoFarDiffValue + bestSoFarBitrateDiff;

		if ( //compare the bitrates & previous comparisons
			(((currentDiffValue >= 0 && bestSoFarDiffValue >= 0) || (currentDiffValue < 0 && bestSoFarDiffValue < 0)) && (currentAbsDiffValue < bestSoFarAbsDiffValue)) ||
			(currentDiffValue >= 0 && bestSoFarDiffValue < 0)
		)
			return current;

		return bestSoFar;
	}

	/**
	 * @returns {URL to ad}
	 * @private
	 */
	static _findBestAdFile(ad, flavorAttributes)
	{
		// todo - currently we take the first creative - but there can be multiple
		const bestRatioAdFiles = VastSizeFilter._selectAdFilesWithBestAspectRatio(ad.creatives[0].mediaFiles, flavorAttributes.width, flavorAttributes.height);
		let adFileCandidate = null;

		for (let i = 0; i < bestRatioAdFiles.length; i++)
		{
			const currentAdFile = bestRatioAdFiles[i];
			if (!adFileCandidate)
				adFileCandidate = currentAdFile;
			else
				adFileCandidate = VastSizeFilter._chooseBetterFile(flavorAttributes, currentAdFile, adFileCandidate);
		}
		return adFileCandidate;
	}

}
module.exports = VastSizeFilter;
