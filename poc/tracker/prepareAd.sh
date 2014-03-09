SCRIPT=$(readlink -f "$0")
BASEDIR=$(dirname "$SCRIPT")
python "$BASEDIR/prepareAd.py" $@ >> "$BASEDIR/prepareAd.log" 2>> "$BASEDIR/prepareAd.log.err" &
