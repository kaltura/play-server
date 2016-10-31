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
                KalturaTinyUrl.debug("KalturaTinyUrl Insert fail due to - "+err);
            }, null);
        return tinyUrl;
    }

    static load(tinyUrl,callback)
    {
        KalturaCache.get(tinyUrl, function(value)
        {
            KalturaTinyUrl.debug("Return value is " +JSON.stringify(value));
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
