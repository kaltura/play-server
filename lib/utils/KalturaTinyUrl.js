/**
 * Created by moshe.maor on 10/26/2016.
 */
const crypto = require ("crypto");
const continuationLocalStorage = require('continuation-local-storage');
require('./KalturaCache');
require('./KalturaConfig');

class KalturaTinyUrl
{
    static generateTinyUrl(url)
    {
        const str = JSON.stringify(url);
        const tinyUrl = crypto.createHash('md5').update(str).digest("hex");
        KalturaTinyUrl.debug(`Generating value ${tinyUrl} from ${str}`);
        return tinyUrl;
    }

    static insert(url,callback=null)
    {
        const tinyUrl = KalturaTinyUrl.generateTinyUrl(url);
        const ttl = KalturaConfig.config.cache.tinyUrlTtl;
        KalturaCache.set(tinyUrl, url, ttl, callback,
            function(err)
            {
                throw err;
            }, null);
        return tinyUrl;
    }

    static load(tinyUrl,callback)
    {
        KalturaCache.get(tinyUrl, function(value)
        {
            KalturaTinyUrl.debug("Return value is " + value);
            callback(value);
        }, function (err)
        {
            throw(err);
        });
    }

    static debug(str)
    {
        console.log(str);
        KalturaLogger.log(str);
    }
}

module.exports = KalturaTinyUrl;

function UT() {
    let tiny = "";
    tiny1 = KalturaTinyUrl.insert("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super");
    KalturaTinyUrl.load(tiny1, function (str) {
        console.log("Loading URL callback!");
    });
    tiny2 = KalturaTinyUrl.insert("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super1");
    KalturaTinyUrl.load(tiny2, function (str) {
        console.log("Loading URL callback!");
    });
    tiny3 = KalturaTinyUrl.insert("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super2");
    KalturaTinyUrl.load(tiny3, function (str) {
        console.log("Loading URL callback!");
    });
    tiny4 = KalturaTinyUrl.insert("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super3");
    KalturaTinyUrl.load(tiny4, function (str) {
        console.log("Loading URL callback!");
    });
    tiny5 = KalturaTinyUrl.insert("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super4");
    KalturaTinyUrl.load(tiny5, function (str) {
        console.log("Loading URL callback!");
    });
    tiny6 = KalturaTinyUrl.insert("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super5");
    KalturaTinyUrl.load(tiny6, function (str) {
        console.log("Loading URL callback!");
    });
    KalturaTinyUrl.load(tiny1, function (str) {
        console.log("Loading URL callback!");
    });
    KalturaTinyUrl.load(tiny2, function (str) {
        console.log("Loading URL callback!");
    });
    KalturaTinyUrl.load(tiny3, function (str) {
        console.log("Loading URL callback!");
    });
    KalturaTinyUrl.load(tiny4, function (str) {
        console.log("Loading URL callback!");
    });
}
//UT();