class AdDiffAnalyzedData
{
	constructor(orientation, ratioDiff, frameSizeDiff, bitrateDiff)
	{
		this.sameOrientation = orientation;
		this.ratioDiff = ratioDiff;
		this.frameSizeDiff = frameSizeDiff;
		this.bitrateDiff = bitrateDiff;
	}
}
module.exports = AdDiffAnalyzedData;
