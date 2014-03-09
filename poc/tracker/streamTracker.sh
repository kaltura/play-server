SCRIPT=$(readlink -f "$0")
BASEDIR=$(dirname "$SCRIPT")
python "$BASEDIR/streamTracker.py" $@ >> "$BASEDIR/streamTracker.log" 2>> "$BASEDIR/streamTracker.log.err" &
