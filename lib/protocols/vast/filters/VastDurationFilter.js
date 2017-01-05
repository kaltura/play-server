require('../../../utils/KalturaLogger')

/* global KalturaLogger */

/**
 * Takes a vast parsed response object as argument and returns a list of ads that fit the duration given
 */
class VastDurationFilter
{
	/**
	 * filters ads by class logic (see class comments)
	 * @returns {Array}
	 */
	static filterOLD(vastObject, duration, durationCoefficient)
	{
		const adPod = [];
		let adPodDuration = 0;
		let selectedLowerDurCreative = null;
		let selectedLowerDurAd = null;
		let selectedHigherDurCreative = null;
		let selectedHigherDurAd = null;
		// find best matching creative according to cue point duration
		for (let adIdx = 0, adLen = vastObject.ads.length; adIdx < adLen; adIdx++)
		{
			const ad = vastObject.ads[adIdx];
			for (let creaIdx = 0, creaLen = ad.creatives.length; creaIdx < creaLen; creaIdx++)
			{
				const creative = ad.creatives[creaIdx];
				if (creative.type === 'linear')
				{
					// todo - don't see any reason to have the code mention the sequence 0 - from a grep in the production we seem to have 0 such cases

					creative.duration = VastDurationFilter._roundDuration(creative.duration, durationCoefficient);
					if (ad.sequence > 0)
					{
						adPod.push({ ad, creative });
						break;
					}
					else
					{
						//prepare single ad in case no ad pods will be selected
						if (creative.duration === duration)
						{
							selectedLowerDurCreative = creative;
							selectedLowerDurAd = ad;
							break;
						}
						if (creative.duration <= duration)
						{
							if (selectedLowerDurCreative === null ||
								selectedLowerDurCreative.duration < creative.duration)
							{
								selectedLowerDurCreative = creative;
								selectedLowerDurAd = ad;
							}
						}
						else
						{
							if (selectedHigherDurCreative == null ||
								selectedHigherDurCreative.duration > creative.duration)
							{
								selectedHigherDurCreative = creative;
								selectedHigherDurAd = ad;
							}
						}
					}
				}
			}
		}
		const filteredAds = [];
		if (adPod.length > 0)
		{
			// in case there was an ad pod
			adPod.sort(
				function (ad1, ad2)
				{
					return ad1.ad.sequence - ad2.ad.sequence;
				}
			);

			for (let adIdx = 0, adLen = adPod.length; adIdx < adLen; adIdx++)
			{
				adPodDuration += adPod[adIdx].creative.duration;
				filteredAds.push(adPod[adIdx].ad);

				if (adPodDuration >= duration)
					break;
			}
		}
		else
		{
			// in case a singular video was selected
			const selectedAd = selectedLowerDurAd || selectedHigherDurAd;
			filteredAds.push(selectedAd);
		}
		KalturaLogger.debug(`Duration fitrered result ads: ${JSON.stringify(filteredAds)}`);
		return filteredAds;
	}

	/**
	 * select optimal number of ads to fill the cue point duration
	 * Ad pod will get priority over single ad
	 */
	static filter(adServerResponse, duration, durationCoefficient, partnerId, entryId, cuePointId, sessionId)
	{
		const durationInSeconds = Math.round(duration / 1000);
		const adPod = [];
		let adPodDuration = 0;
		const selectedAdPod = [];
		let selectedLowerDurCreative = null;
		let selectedLowerDurAd = null;
		let selectedHigherDurCreative = null;
		let selectedHigherDurAd = null;
		// find best matching creative according to cue point duration
		for (let adIdx = 0, adLen = adServerResponse.ads.length; adIdx < adLen; adIdx++)
		{

			const ad = adServerResponse.ads[adIdx];
			for (let creaIdx = 0, creaLen = ad.creatives.length; creaIdx < creaLen; creaIdx++)
			{
				const creative = ad.creatives[creaIdx];
				if (creative.type === 'linear')
				{
					creative.duration = VastDurationFilter._roundDuration(creative.duration, durationCoefficient);
					if (ad.sequence > 0)
					{
						adPod.push({ ad, creative });
						break;
					}
					else
					{ //prepare single ad in case no ad pods will be selected
						if (creative.duration === durationInSeconds)
						{
							selectedLowerDurCreative = creative;
							selectedLowerDurAd = ad;
							break;
						}
						if (creative.duration <= durationInSeconds)
						{
							if (selectedLowerDurCreative == null ||
								selectedLowerDurCreative.duration < creative.duration)
							{
								selectedLowerDurCreative = creative;
								selectedLowerDurAd = ad;
							}
						}
						else
						{
							if (selectedHigherDurCreative == null ||
								selectedHigherDurCreative.duration > creative.duration)
							{
								selectedHigherDurCreative = creative;
								selectedHigherDurAd = ad;
							}
						}
					}
				}
			}
		}

		const selectedCreative = selectedLowerDurCreative || selectedHigherDurCreative;
		const selectedAd = selectedLowerDurAd || selectedHigherDurAd;

		adPod.sort(
			function (ad1, ad2)
			{
				return ad1.ad.sequence - ad2.ad.sequence;
			}
		);
		for (let adIdx = 0, adLen = adPod.length; adIdx < adLen; adIdx++)
		{
			adPodDuration += adPod[adIdx].creative.duration;
			selectedAdPod.push(adPod[adIdx]);
			if (adPodDuration >= durationInSeconds)
				break;
		}

		if (selectedAdPod.length > 0)
		{
			KalturaLogger.log(`Selected Creatives ${selectedAdPod.length} of total duration [${adPodDuration}] for partner [${partnerId}] entry [${entryId}] cue-point [${cuePointId}] session [${sessionId}]`);
			return selectedAdPod;
		}
		KalturaLogger.log('No Ad Pod selected');
		if (selectedCreative)
		{
			KalturaLogger.log(`Selected Creatives 1 of total duration [${selectedCreative.duration}] for partner [${partnerId}] entry [${entryId}] cue-point [${cuePointId}] session [${sessionId}]`);
			return [{ ad: selectedAd, creative: selectedCreative }];
		}
		KalturaLogger.log('No creative selected');
		return [];
	}






	static _roundDuration(duration, durationCoefficient)
	{
		const div = duration / durationCoefficient;
		const floor = Math.floor(div);
		if (div - floor > 0)
			return (floor + 1) * durationCoefficient;
		return duration;
	}

}
module.exports = VastDurationFilter;
