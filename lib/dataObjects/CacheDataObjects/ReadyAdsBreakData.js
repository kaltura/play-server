require('../PlayServerConstants');

class ReadyAdsBreakData
{
	constructor(count, blocked, filler)
	{
		this.ads = new Array(count);
		this.filler = filler;
		this.blocked = blocked;
	}

	setAd(index, ad)
	{
		this._validateIndex(index);
		this.ads[index] = ad;
	}

	getAd(index)
	{
		this._validateIndex(index);
		return this.ads[index];
	}

	getFiller()
	{
		return this.filler;
	}

	isBlocked()
	{
		return this.blocked;
	}

	_validateIndex(index)
	{
		if (index >= this.ads.length || index < 0)
			throw new Error(`Unexpected index received ${index} while count is ${this.ads.length}`);
	}

	isEmpty()
	{
		return this.ads.join(EMPTY_STRING).length === 0;
	}

	/**
	 * @ReadyAdsBreakData other
	 */
	merge(defaults)
	{
		if (this.ads.length !== defaults.ads.length)
			throw new Error(`Unexpected merge between two non fitting ReadyAdsBreakData objects this: ${this} , defaults: ${defaults}`);
		const isBlocked = defaults.isBlocked;
		const filler = this.filler || defaults.filler;
		const result = new ReadyAdsBreakData(this.ads.length, isBlocked, filler);
		for (let i = 0; i < this.ads.length; i++)
		{
			if (defaults.getAd(i))
				result.setAd(i, this.getAd(i) || defaults.getAd(i));
		}
		return result;
	}
}
module.exports = ReadyAdsBreakData;

