#!/bin/bash

_FULLPATH_=$(readlink -f $0)
_MODULE_DIR_=$(dirname $_FULLPATH_)

MAX_PROCS=20

NOW_START=`date +'%s'`

while [ `$_MODULE_DIR_/count_ffmpeg_processes.sh` -ge $MAX_PROCS ] ; do
	echo "`date +"%Y-%m-%d %T"` sleep $$ $_MODULE_DIR_/ffmpeg $@" >> /var/log/play/ffmpeg-queued.log
	sleep 1
done

echo "`date +"%Y-%m-%d %T"` run $$ $_MODULE_DIR_/ffmpeg $@" >> /var/log/play/ffmpeg-queued.log
$_MODULE_DIR_/ffmpeg "$@"
NOW_END=`date +'%s'`
echo "`date +"%Y-%m-%d %T"` took:`echo $NOW_START $NOW_END|awk '{print $2-$1}'` $$ $_MODULE_DIR_/ffmpeg $@" >> /var/log/play/ffmpeg-queued.log
