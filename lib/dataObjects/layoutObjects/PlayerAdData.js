/**
 * Data model to hold the ad data for player calls
 */
class PlayerAdData
{
	constructor(id, offset, duration)
	{
		this.id = id;
		this.offset = offset;
		this.duration = duration;
	}

	setAutoSkip(autoskip)
	{
		this.autoskip = autoskip;
	}

	setVastInformation(vastInfo)
	{
		this.vastInformation = vastInfo;
	}

	toJSON()
	{
		const copy = { id: this.id,
			offset: this.offset,
			duration: this.duration,
		};
		if (this.autoskip)
			copy.autoskip = this.autoskip;
		if (this.vastInformation)
			copy.vastInformation = this.vastInformation;
		return copy;
	}

}

module.exports = PlayerAdData;


