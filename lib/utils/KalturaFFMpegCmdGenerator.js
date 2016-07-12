const util = require('util');
const KalturaFFMpegCmdResponse = require('./KalturaFFMpegCmdResponse');

/**
 * return a command line that should be used by the transcoding engine to transcode the ad
 */
class KalturaFFMpegCmdGenerator
{


    static generateCommandLineFormat(flavorId ,MediaInfoJson , apiConnector )
    {
        return apiConnector.handleRequset(apiConnector.client.flavorAsset.serveAdStitchCmd ,[flavorId , MediaInfoJson]);
    }

 
    static fillCmdLineFormat(format ,sourcePath , outputPath)
    {
        return util.format(format , sourcePath , outputPath);
    }

}

module.exports = KalturaFFMpegCmdGenerator;