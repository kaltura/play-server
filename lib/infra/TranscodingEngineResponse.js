
/**
 * class to hold the response from transcodingEngine request
 */
    
class TranscodingEngineResponse{
    constructor(ffmpegResponse,linkToFile)
    {
        this.ffmpegResponse=ffmpegResponse;
        this.linkToFile=linkToFile;
    }
}


module.exports = TranscodingEngineResponse;