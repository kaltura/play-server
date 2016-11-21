const AdDiff = require('../../../dataObjects/SimpleDataObjects/AdDiff');
const AdDiffAnalizedData = require('../../../dataObjects/SimpleDataObjects/AdDiffAnalyzedData');
require('../../../utils/KalturaConfig');
require('../../../dataObjects/PlayServerConstants');

/* global TEN_RADIX KalturaConfig */
/**
 *	Calculates the diff between an ad and flavor id attributes in order to get the best selection as possible
 *  Since the algorithm is a bt complex here is a link to eplain it
 *  - https://kaltura.atlassian.net/wiki/display/AdStitching/Ad+Size+Choosing+algorithm
 */
class AdCreativeAnalyzer
{
	/**
	 *
	 * @param contentVideoAttributes
	 * @param adVideoAttributes
	 */
	constructor(contentVideoAttributes, adVideoAttributes)
	{
		this.config = KalturaConfig.config.filters;
		this.frameSizeWeight = parseInt(this.config.frameSizeWeightFactor, TEN_RADIX);
		this.ratioWeight = parseInt(this.config.ratioWeightFactor, TEN_RADIX);
		this.bitrateWeight = parseInt(this.config.bitRateWeightFactor, TEN_RADIX);

		this.totalConfigWeights = this.frameSizeWeight + this.ratioWeight + this.bitrateWeight;
		this.contentVideoAttributes = contentVideoAttributes;
		this.adVideoAttributes = adVideoAttributes;
		this.diff = this._calculateDiff();
		this.calculatedScore = this._calculateWeightScore();
	}

	/**
	 * In this function we try to calculate the weights that will later determine the best ad
	 * @private
	 */
	_calculateWeightScore()
	{
		let totalWeight = 0;
		totalWeight += this.frameSizeWeight * this.diff.frameSizeDiff.absolute;
		totalWeight += this.ratioWeight * (1 / (this.diff.ratioDiff.absolute + 0.01));
		totalWeight += this.bitrateWeight * this.diff.bitrateDiff.absolute;
		return totalWeight / this.totalConfigWeights;
	}
	/**
	 * Calculates all differences of the member ad and content and returns
	 * @returns {AdDiffAnalyzedData}
	 */
	_calculateDiff()
	{
		const ratioDiff = this._calculateAspectRatioDiff();
		const frameSizeDiff = this._calculateFrameSizeDiff();
		const bitrateDiff = this._calculateBitrateDiff();
		return new AdDiffAnalizedData(null, ratioDiff, frameSizeDiff, bitrateDiff);
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
		const distance = AdCreativeAnalyzer.distanceCalculation(adFrameSize, contentFrameSize, true);
		return new AdDiff(distance, adFrameSize * 100 / contentFrameSize);
	}

	_calculateAspectRatioDiff()
	{
		if (this.adVideoAttributes.height === 0 || this.adVideoAttributes.width === 0 || this.contentVideoAttributes.height === 0 || this.contentVideoAttributes.width === 0)
			return new AdDiff(1000, 1);
		const adAspectRatio = this.adVideoAttributes.height / this.adVideoAttributes.width;
		const contentAspectRatio = this.contentVideoAttributes.height / this.contentVideoAttributes.width;
		return new AdDiff(adAspectRatio - contentAspectRatio, adAspectRatio * 100 / contentAspectRatio);
	}

	_calculateBitrateDiff()
	{
		const adBitrate = this.adVideoAttributes.bitrate;
		const contentBitrate = this.contentVideoAttributes.bitrate;
		const distance = AdCreativeAnalyzer.distanceCalculation(adBitrate, contentBitrate, false);
		return new AdDiff(distance, adBitrate * 100 / contentBitrate);
	}

	static distanceCalculation(number, otherNumber, preferLarger = false)
	{
		if (number === 0 || otherNumber === 0)
			return 0;
		let power = Math.pow(otherNumber - number, 2);
		power = (-1 * power) / (2 * Math.pow(number, 2));
		let ans = number * Math.pow(3, power);
		let divisionFactor = 1;
		if (preferLarger)
			divisionFactor = number;
		ans = ans + ((number * otherNumber) / (Math.abs(otherNumber) + divisionFactor));
		return ans / number;
	}
}
module.exports = AdCreativeAnalyzer;
