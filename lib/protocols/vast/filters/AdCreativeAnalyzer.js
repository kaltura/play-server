const AdDiff = require('../../../dataObjects/SimpleDataObjects/AdDiff');
const AdDiffAnalizedData = require('../../../dataObjects/SimpleDataObjects/AdDiffAnalyzedData');

class AdCreativeAnalyzer
{
	/**
	 *
	 * @param contentVideoAttributes
	 * @param adVideoAttributes
	 */
	constructor(contentVideoAttributes, adVideoAttributes)
	{
		this.contentVideoAttributes = contentVideoAttributes;
		this.adVideoAttributes = adVideoAttributes;
		this.diff = this._calculateDiff();
		this.calculatedScore = this._calculateWeightScore();
		this.config = KalturaConfig.config.filters;
	}

	/**
	 * In this function we try to calculate the weights that will later determine the best ad
	 * @private
	 */
	_calculateWeightScore()
	{
		let totalWeight = 1;
		// orientation is the most important factor
		if (this.diff.sameOrientation)
			totalWeight *= this.config.orientationWeightFactor;
		// we seek the highest frame rate possible
		totalWeight *= this.config.frameSizeWeightFactor * this.diff.frameSizeDiff.percentage;
		// the larger the bitrate change the less we want to select it (+1 to avoid zero division)
		totalWeight *= this.config.bitRateWeightFactor * (1 / (this.diff.bitrateDiff.absolute + 1));
		totalWeight *= this.config.ratioWeightFactor * this.diff.ratioDiff.percentage;
		return totalWeight;
	}
	/**
	 * Calculates all differences of the member ad and content and returns
	 * @returns {AdDiffAnalyzedData}
	 */
	_calculateDiff()
	{
		const sameOrientation = this._isSameOrientation();
		const ratioDiff = this._calculateAspectRatioDiff();
		const frameSizeDiff = this._calculateFrameSizeDiff();
		const bitrateDiff = this._calculateBitrateDiff();
		return new AdDiffAnalizedData(sameOrientation, ratioDiff, frameSizeDiff, bitrateDiff);
	}

	// TODO consider inserting threshold for bitrate and aspect ratio

	/**
	 * Returns -1 if not with the same orientation otherwise 1
	 * @private
	 */
	_isSameOrientation()
	{
		return ((this.contentVideoAttributes.width === this.contentVideoAttributes.height) && (this.adVideoAttributes.width === this.adVideoAttributes.height)) ||
			((this.contentVideoAttributes.width > this.contentVideoAttributes.height) && (this.adVideoAttributes.width > this.adVideoAttributes.height)) ||
			((this.contentVideoAttributes.width < this.contentVideoAttributes.height) && (this.adVideoAttributes.width < this.adVideoAttributes.height));
	}

	/**
	 *
	 * @returns AdDiff
	 * @private
	 */
	_calculateFrameSizeDiff()
	{
		const adFrameSize = this.adVideoAttributes.width * this.adVideoAttributes.height;
		const contentFrameSize = this.contentVideoAttributes.width * this.contentVideoAttributes.height;
		return new AdDiff(Math.abs(adFrameSize - contentFrameSize), adFrameSize * 100 / contentFrameSize);
	}

	_calculateAspectRatioDiff()
	{
		const adAspectRatio = this.adVideoAttributes.height / this.adVideoAttributes.width;
		const contentAspectRatio = this.contentVideoAttributes.height / this.contentVideoAttributes.width;
		return new AdDiff(Math.abs(adAspectRatio - contentAspectRatio), adAspectRatio * 100 / contentAspectRatio);
	}

	_calculateBitrateDiff()
	{
		const adBitrate = this.adVideoAttributes.bitrate;
		const contentBitrate = this.contentVideoAttributes.bitrate;
		return new AdDiff(Math.abs(adBitrate - contentBitrate), adBitrate * 100 / contentBitrate);
	}
}
module.exports = AdCreativeAnalyzer;
