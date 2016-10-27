const AdDiff = require('../../../dataObjects/SimpleDataObjects/addiff');
const AdDiffAnalizedData = require('../../../dataObjects/SimpleDataObjects/AdDiffAnalyzedData');
require('../../../utils/KalturaConfig');

class AdCreativeAnalyzer
{
	constructor(contentVideoAttributes, adVideoAttributes)
	{
		this.contentVideoAttributes = contentVideoAttributes;
		this.adVideoAttributes = adVideoAttributes;
	}

	/**
	 * Calculates all differences of the member ad and content and returns
	 * @returns {AdDiffAnalyzedData}
	 */
	getDiff()
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
