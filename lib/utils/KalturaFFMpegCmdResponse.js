/**
 * class to hold the response from FFMpegCmd request
 */
class KalturaFFMpegCmdResponse{

    constructor(commandLine)
    {
        this.commandLine = commandLine;
        //this.engine = //todo maybe add engine used
    }

}

module.exports = KalturaFFMpegCmdResponse;
