/**
 * Use this class to compare between a list of video flavor attributes vs a reference flavor
  * getClosetFlavor function will return the one closest flavor from the list to the reference flavor
 */
class ClosestFlavorPicker
{
    _isSameOrientation  (VideoAttributes1, VideoAttributes2) {
        if (((VideoAttributes1.width === VideoAttributes1.height) && (VideoAttributes2.width === VideoAttributes2.height)) ||
            ((VideoAttributes1.width > VideoAttributes1.height) && (VideoAttributes2.width > VideoAttributes2.height)) ||
            ((VideoAttributes1.width < VideoAttributes1.height) && (VideoAttributes2.width < VideoAttributes2.height)))
            return 1;

        return 0;
    }

    _calculateFrameSizeDiff(VideoAttributes1, VideoAttributes2) {
        const refFrameSize = VideoAttributes2.width * VideoAttributes2.height;
        const contentFrameSize = VideoAttributes1.width * VideoAttributes1.height;
        return Math.abs(refFrameSize - contentFrameSize);
    }

    _calculateAspectRatioDiff(VideoAttributes1, VideoAttributes2) {
        const refAspectRatio = VideoAttributes2.height / VideoAttributes2.width;
        const contentAspectRatio = VideoAttributes1.height / VideoAttributes1.width;
        return Math.abs(refAspectRatio - contentAspectRatio);
    }

    _calculateBitrateDiff(VideoAttributes1, VideoAttributes2) {
        const refBitrate = VideoAttributes2.bitrate;
        const contentBitrate = VideoAttributes1.bitrate;
        return Math.abs(refBitrate - contentBitrate);
    }

    _orientation(flavorList, referenceFlavor) {
        for (var i = 0; i < flavorList.length; i++)
            if (!this._isSameOrientation(flavorList[i], referenceFlavor))
                flavorList[i].weight *= 1000;
    }

    _aspectRatio(flavorList, referenceFlavor) {
        for (var i = 0; i < flavorList.length; i++)
            flavorList[i].weight *= ((this._calculateAspectRatioDiff(flavorList[i], referenceFlavor) * 10) + 1);
    }

    _frameSize(flavorList, referenceFlavor) {
        for (var i = 0; i < flavorList.length; i++)
            flavorList[i].weight *= (1 + this._calculateFrameSizeDiff(flavorList[i], referenceFlavor));
    }

    _bitrate(flavorList, referenceFlavor) {
        for (var i = 0; i < flavorList.length; i++)
            flavorList[i].weight *= (1 + this._calculateBitrateDiff(flavorList[i], referenceFlavor));
    }

    _setDefaultWeight(flavorList) {
        for (var i = 0; i < flavorList.length; i++)
            flavorList[i].weight = 1;
    }

    getClosetFlavor(flavorList, referenceFlavor)
    {
        this._setDefaultWeight(flavorList);
        this._orientation(flavorList, referenceFlavor);
        this._aspectRatio(flavorList, referenceFlavor);
        this._frameSize(flavorList, referenceFlavor);
        this._bitrate(flavorList, referenceFlavor);

        flavorList.sort(function (flavor1, flavor2) {
            return flavor1.weight - flavor2.weight;
        });

        return flavorList[0];
    }
}

module.exports = ClosestFlavorPicker;
