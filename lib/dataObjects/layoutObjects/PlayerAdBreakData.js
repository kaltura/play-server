/**
 * Data model to hold the ad data for player calls
 */
class PlayerAdBreakData
{
	constructor()
	{
		this.ads = [];
	}

	addAd(playerAdData)
	{
		this.ads.push(playerAdData);
	}

	toJSON()
	{
		return { ads: this.ads };
	}

}

module.exports = PlayerAdBreakData;


