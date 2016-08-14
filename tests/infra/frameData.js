/**
 * This is the data for each frame
 * Created by David.Winder on 8/07/2016.
 */


var frameData = {
    AbsoluteTime: null,
    contentTime: -1,
    ad: {
        index: null,
        adTime: null,
        status: [0,1,2,3] // status 0 is first 2 sec of ad, status 1 is middle, 2 is 2 last sec. status 3 is filler
    }
};


module.exports = frameData;