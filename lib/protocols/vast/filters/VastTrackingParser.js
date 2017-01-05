const KeyAndValue = require('../../../dataObjects/SimpleDataObjects/KeyAndValue');


class VastTrackingParser
{
	/**
	 * Returns an array of <key, value> of [type,url]
	 * @param ad
	 * @param creative
	 * @returns {Array}
	 */
	static getTrackingInformation(ad, creative)
	{
		const result = [];
		// first get all the impressions
		if (ad && ad.impressionURLTemplates)
		{
			for (let impressionIdx = 0; impressionIdx < ad.impressionURLTemplates.length; impressionIdx++)
			{
				if (ad.impressionURLTemplates[impressionIdx] && ad.impressionURLTemplates[impressionIdx].length > 0)
					result.push(new KeyAndValue('impression', ad.impressionURLTemplates[impressionIdx]));
			}
		}
		// now get all the tracking events
		const trackingEvents = creative.trackingEvents;
		for (const trackingEventKey in trackingEvents)
		{
			if (trackingEvents.hasOwnProperty(trackingEventKey))
			{
				const typedEvents = trackingEvents[trackingEventKey];
				for (let i = 0; i < typedEvents.length; i++)
					if (typedEvents[i] && typedEvents[i].length > 0)
						result.push(new KeyAndValue(trackingEventKey, typedEvents[i]));
			}
		}
		return result;
	}

}
module.exports = VastTrackingParser;
