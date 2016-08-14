/**
 * This script is to create MOCK video of play-server
 * Created by David.Winder on 8/7/2016.
 */
// install qrencode on centos
require('util');
var data = require('./data.json');
var frameData = require('./frameData');

var execSync = require('child_process').execSync;
function executeCommand(cmd) {
    console.log("execute command: " + cmd);
    return execSync(cmd).toString();
}
var FOLDER_NAME = 'video_files';
var FULL_MOVIE_NAME = 'fullMovieName';

class movieMaker {
    constructor() {}

    static generateQRcodeForVideo(absoluteStartTime, duration) {
        console.log('in generateQRcodeForVideo starting in absoluteStartTime: ' + absoluteStartTime + ' for duration ' + duration);
        for (var i = 0; i < duration; i++)
            movieMaker.generatorQR(absoluteStartTime, i, null , null);
    }

    static generateQRcodeForAd(absoluteStartTime, adData, num) {
        console.log('in generateQRcodeForAd with ad ' + num + ' starting in absoluteStartTime: ' + absoluteStartTime);
        for (var i = 0; i < adData.duration; i++)
            movieMaker.generatorQR(absoluteStartTime, i, adData, num);
    }

    static createFrameData(absoluteStartTime, i, adData, num) {
        frameData.AbsoluteTime = absoluteStartTime + i;
        frameData.ad = null;
        if (adData) {
            var status = 1;
            if (i < 2)
                status = 0;
            else if (i >= adData.duration - 2)
                status = 2;
            frameData.ad = {index: num, adTime: i+1, status: status};
        } else {
            frameData.contentTime += 1;
        }
        return frameData;
    }

    static deleteAllQRImage(numberOfQRs)
    {
        var cmd = 'rm -f ';
        for (var i = 0; i <= numberOfQRs; i++) {
            var index = ("0000" + i).slice(-4);
            cmd += 'rsqr' + index + '.png ';
        }
        executeCommand(cmd);
    }

    static generatorQR(absoluteStartTime, i, adData, num)
    {
        var StringData = JSON.stringify(movieMaker.createFrameData(absoluteStartTime, i, adData, num));
        var dataWithTags = StringData.replace(/\"/gi, "\'");
        var index = ("0000" + (i + absoluteStartTime)).slice(-4);
        var imageName = 'qr' + index + '.png';
        executeCommand('qrencode -o ' +imageName + ' -m 50 -s 10 -l H "' + dataWithTags + '"');
        executeCommand('ffmpeg -i ' + imageName + ' -vf scale=1000:1000 rs' + imageName);
        executeCommand('rm -f ' + imageName);
    }

    static createVideoAndDeleteQr(duration) {
        executeCommand('ffmpeg -f image2 -r 1 -i rsqr%4d.png -r 30 ' + FULL_MOVIE_NAME + '.mp4');
        movieMaker.deleteAllQRImage(duration);
    }

    static generateContentVideo(name, duration) {
        movieMaker.generateQRcodeForVideo(1, duration);
        let fileName = name + '.mp4';
        executeCommand('ffmpeg -f image2 -r 1 -i rsqr%4d.png -r 30 ' + fileName);
        executeCommand('mv -i ' + fileName + ' ' + FOLDER_NAME + '/');
        movieMaker.deleteAllQRImage(duration);
    }

    static generateAd(ad, i) {
        movieMaker.generateQRcodeForAd(1, ad, i);
        let fileName = ad.name + '.mp4';
        executeCommand('ffmpeg -f image2 -r 1 -i rsqr%4d.png -r 30 ' + fileName);
        executeCommand('mv -i ' + fileName + ' ' + FOLDER_NAME + '/');
        movieMaker.deleteAllQRImage(ad.duration);
    }


    static generateSeparateMovie(data) {
        executeCommand('mkdir ' + FOLDER_NAME);
        movieMaker.generateContentVideo(data.name, data.length);
        var Ads = data.Ads;
        for (var i = 0;Ads[i];i++)
            movieMaker.generateAd(Ads[i], i+1);
    }

    static generateFullMovie(data) {
        console.log("data is " + data.name);
        var Ads = data.Ads;
        var duration = 0, absoluteTime = 0, contentTime = 0;

        for (var i = 0;Ads[i];i++) {
            duration = Ads[i].startTime - contentTime;
            movieMaker.generateQRcodeForVideo(absoluteTime, duration);
            contentTime += duration;
            absoluteTime += duration;
            movieMaker.generateQRcodeForAd(absoluteTime, Ads[i], i);
            absoluteTime += Ads[i].duration;
        }
        // create the last segment for the movie
        duration = data.length + 1 - contentTime;
        movieMaker.generateQRcodeForVideo(absoluteTime, duration);
        absoluteTime += duration;
        console.log("absoluteTime is " + absoluteTime);
        movieMaker.createVideoAndDeleteQr(absoluteTime - 1);

    }
    
}

movieMaker.generateFullMovie(data);
//movieMaker.generateSeparateMovie(data);