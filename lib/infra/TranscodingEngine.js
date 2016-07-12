
const Promise = require("bluebird");
const exec = require('child_process').exec;
const TranscodingEngineResponse = require('./TranscodingEngineResponse');
const fs = require('fs');
const path = require('path');


/**
 * class to handle transcoding
 */
class TranscodingEngine
{

    constructor(ffmpegPath = 'ffmpeg')
    {
        this._ffmpegPath=ffmpegPath;
    }


    transcodeFile(commandLine , sourceFilePath , pathToSave)
    {
        const This = this;

        return new Promise(function(resolve,reject) {
            fs.exists(sourceFilePath, function (exists) {
                if (exists)
                {
                    let $dirPathToSave = path.dirname(pathToSave);
                    fs.exists($dirPathToSave, function (exists) {
                        if (exists)
                        {
                            commandLine = This._ffmpegPath + ' ' + commandLine;

                            function callback(error, stdout, stderr) {
                                if (error)
                                {
                                    reject(error);
                                }

                                else
                                {
                                    /*
                                     ffmpeg sends all diagnostic messages (the "console output") to stderr because its actual output (the media stream) can go
                                     to stdout and mixing the diagnostic messages with the media stream would brake the output.
                                     */
                                    //todo maybe calc here the link to the transcoded ad and sent to ctor instead of _pathtosave
                                    resolve(new TranscodingEngineResponse(stderr, pathToSave));
                                }
                            }

                            exec(commandLine, callback);
                        }
                        else
                        {
                            reject('[' + $dirPathToSave + '] doesnt exists on the file system');
                        }
                    });
                }
                else
                {
                    reject('File [' + sourceFilePath + '] doesnt exists on the file system');
                }
            });
        });
    }
}

module.exports = TranscodingEngine;
