killall python
killall node
service memcached restart
rm ../tracker/prepareAd.log
rm ../tracker/prepareAd.log.err
rm ../tracker/streamTracker.log
rm ../tracker/streamTracker.log.err
rm main.log
rm -rf /tmp/playErrorLog/*
rm -rf /tmp/downloadedTS/*
rm -rf /tmp/tsFiles/*
rm -rf /tmp/manifests/*
rm /var/log/node/access_log
