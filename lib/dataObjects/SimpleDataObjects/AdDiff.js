class AdDiff
{
	constructor(diffMinus, percentage)
	{
		this.absolute = Math.abs(diffMinus);
		this.signed = diffMinus;
		this.percentage = percentage;
	}
}
module.exports = AdDiff;

