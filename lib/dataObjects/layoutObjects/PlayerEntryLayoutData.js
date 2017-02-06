/**
 * Data model to hold the Manifest layout structure for the player
 */
class PlayerEntryLayoutData
{
	constructor()
	{
		this.sequences = [];
	}

	addAdSequence(adId, offset, duration)
	{
		this.sequences.push({ adId, offset, duration });
	}

	addSourceSequence(offset, duration)
	{
		this.sequences.push({ offset, duration });
	}

	addPreRollSequence(playerAdDataArray, duration)
	{
		this.sequences.push({ offset: 0, duration, ads: playerAdDataArray });
	}


	toJSON()
	{
		return { sequences: this.sequences };
	}

}

module.exports = PlayerEntryLayoutData;

