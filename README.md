## play-server

The Kaltura 'play-server' cloud manages all client HLS manifest and segment requests. 
This enables the swapping of individual segments with respective alternate pieces of content. Ads are configured against the Kaltura Ad cuepoint API, or represented directly on the ingest stream. Ad events include a VAST ad tag URL. After the play server reaches a time that includes an ad, a VAST request is made on the server to retrieve ads for each client that is consuming the stream. 

Ad tags should be configured with respective substitutions as described in:

[Integrating Kaltura with VAST adTag URL article] (http://knowledge.kaltura.com/integrating-kaltura-vast-adtag-url)

### Deployment
Please see [Deployment doc] (https://github.com/kaltura/play-server/blob/master/play_server_deployment.md)

### Copyright & License

All code in this project is released under the [AGPLv3 license](http://www.gnu.org/licenses/agpl-3.0.html) unless a different license for a particular library is specified in the applicable library path. 

Copyright © Kaltura Inc. All rights reserved.
