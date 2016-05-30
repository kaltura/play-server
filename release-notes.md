This file includes features per version in descending order (started on v2.0.0)

# v2.0.0 #

## Slating ##
- Issue Type: New Feature
- Issue Short Description: Ability to fill the gaps (when the ad time is done yet the ad break is not) with a pre-defined video.
- Issue ID: PLAT-4962

#### Configuration ####
- on UICONF configure on the "vast" section:
   + "slateType": "filler",
   + "slateContent": <flavor_id>

## Pass-through ##
- Issue Type: New Feature
- Issue Short Description: Allow returning to original video (non-ad) when ad timeline is complete yet cue-point time not over.
- Issue ID: PLAT-4961

#### Configuration ####
- None.

## Configurable Pre-Fetch Window ##
- Issue Type: Enhancement
- Issue Short Description: Pre-fetch window (time from which you are allowed to get the vast and download the ads) is configurable.
- Issue ID: PLAT-5369

#### Configuration ####
- managers.ini/[adIntegration]/preFetchWindow
