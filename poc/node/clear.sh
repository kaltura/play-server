killall python
echo flush_all | nc 0 11211
rm ../tracker/prepareAd.log
rm ../tracker/prepareAd.log.err
rm ../tracker/streamTracker.log
rm ../tracker/streamTracker.log.err
rm main.log
