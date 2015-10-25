#!/bin/bash
if [ $# -eq 1 ]; then
        FFMPEG_PATH=$1
else
        FFMPEG_PATH=/opt/kaltura/play-server/bin/ffmpeg
fi

_FULLPATH_=$(readlink -f $FFMPEG_PATH)
_MODULE_DIR_=$(dirname $_FULLPATH_)
FFMPEG_REAL_PATH=$_MODULE_DIR_/ffmpeg


echo `ps -e -ocmd|awk '{print $1}'|grep -c $FFMPEG_REAL_PATH`