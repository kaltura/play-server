This file includes features per version in descending order (started on v2.0.0)
# v3.0.0 #

## VOD ##
- Issue Type: New Feature
- Issue Short Description: Enable support of ad-stitching to VOD content

## NGINX support ##
- Issue Type: New Feature
- Issue Short Description: Enable support of ad-stitching to VOD content

# v2.0.0 #

## Slating ##
- Issue Type: New Feature
- Issue Short Description: Ability to fill the gaps (when the ad time is done yet the ad break is not) with a pre-defined video.
- Issue ID: PLAT-4962

#### Configuration ####
- on UICONF configure on the "vast" section:
   + "slateType": "filler",
   + "slateContent": @flavor_id@

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

## UDP Sender ##
- Issue Type: New Feature
- Issue Short Description: Send UDP message when a beacon is triggered to the configured machine.

#### Configuration ####
- config.ini/[udpsender]/PORT
- config.ini/[udpsender]/HOST

## Enable Debug Play-Server ##
- Issue Type: New Feature
- Issue Short Description: Allow debugging of a single node isntance of play server 

#### Configuration ####
- config.ini/[bin][debug]/enabled
- config.ini/[bin][debug]/port

## Additional Configuration Changes From Last Version (v1.2.7) ##
- remove config.ini/[cache]/blackMedia 
- add config.ini/[cache]/fillerMedia = 600
- add config.ini/[cache]/lock = 100
- add managers.ini/[manifest][rendition]/maxRetries = 6
