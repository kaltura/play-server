/**
 * Created by moshe.maor on 10/20/2016.
 */
const picker = require ('../../lib/infra/ClosestFlavorPicker.js');
const chai = require('chai');
const expect = chai.expect; // we are using the "expect" style of Chai

const flavorList = [{bitrate: 1000, frameSize: 200, height: 480, width: 640 },
                {bitrate: 900, height: 480, width: 640 },
                {bitrate: 1500, height: 480, width: 640 },
                {bitrate: 700, height: 480, width: 640 },
                {bitrate: 1200, height: 480, width: 640 },
                {bitrate: 1000, height: 850, width: 640 },
                {bitrate: 900, height: 480, width: 640 },
                {bitrate: 1500, height: 720, width: 640 },
                {bitrate: 700, height: 480, width: 640 },
                {bitrate: 1200, height: 480, width: 640 },
                {bitrate: 900, height: 480, width: 640 },
                {bitrate: 1500, height: 480, width: 640 },
                {bitrate: 700, height: 480, width: 640 },
                {bitrate: 1200, height: 480, width: 640 },
                {bitrate: 1000, height: 480, width: 640 },
                {bitrate: 900, height: 480, width: 640 },
                {bitrate: 1500, height: 720, width: 640 },
                {bitrate: 700, height: 480, width: 640 },
                {bitrate: 1200, height: 480, width: 640 },
                {bitrate: 900, height: 480, width: 640 },
                {bitrate: 1500, height: 480, width: 640 },
                {bitrate: 700, height: 480, width: 640 },
                {bitrate: 1200, height: 480, width: 640 },
                {bitrate: 1000, height: 480, width: 640 },
                {bitrate: 900, height: 480, width: 640 },
                {bitrate: 1500, height: 720, width: 640 },
                {bitrate: 700, height: 480, width: 640 },
                {bitrate: 1200, height: 480, width: 640 }];

describe('Test closest flavor picker ', function(){

    const myPicker = new picker();

    function getPureObject(obj)
    {
        return {bitrate:obj.bitrate,height:obj.height,width:obj.width};
    }

    it('Validate flavor1',function()
    {
        expect(getPureObject(myPicker.getClosetFlavor(flavorList, {bitrate: 1200,height: 480,width: 640}))).to.deep.equal({bitrate: 1200,  height: 480, width: 640});
    });

    it('Validate flavor2',function()
    {
        expect(getPureObject(myPicker.getClosetFlavor(flavorList, {bitrate: 850, height: 480, width: 640 }))).to.deep.equal({bitrate: 900, height: 480, width: 640 });
    });

    it('Validate flavor3',function()
    {
        expect(getPureObject(myPicker.getClosetFlavor(flavorList, {bitrate: 1350, height: 700, width: 630 }))).to.deep.equal({bitrate:1500, height: 720, width: 640});
    });
});

