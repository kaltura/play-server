#!/bin/bash
#
# An init.d script for running a Node.js process as a service using Forever as
# the process monitor. For more configuration options associated with Forever,
# see: https://github.com/nodejitsu/forever

echo `date`

#
# play-server              This shell script takes care of starting and stopping a Kaltura play-server Service
#
# chkconfig: 2345 13 87
# description: Kaltura play-server

### BEGIN INIT INFO
# Provides:          kaltura-batch
# Required-Start:    $local_fs $remote_fs $network
# Required-Stop:     $local_fs $remote_fs $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# X-Interactive:     true
# Short-Description: Start/stop Kaltura play-server
# Description:       Control the Kaltura play-server.
### END INIT INFO
 
NAME="play_server"
NODE_BIN_DIR="/usr/bin"
NODE_PATH="/opt/kaltura/play-server/node_modules"
APPLICATION_PATH="/opt/kaltura/play-server/main.js"
PIDFILE="/opt/kaltura/play-server/config/play-server.pid"
LOGFILE="/var/log/play-server.log"
MIN_UPTIME="5000"
SPIN_SLEEP_TIME="2000"
 
# Add node to the path for situations in which the environment is passed.
PATH=$NODE_BIN_DIR:$PATH
# Export all environment variables that must be visible for the Node.js
# application process forked by Forever. It will not see any of the other
# variables defined in this script.
export NODE_PATH=$NODE_PATH
 
start() {
    echo "Starting $NAME"
    forever \
      --pidFile $PIDFILE \
      -a \
      -l $LOGFILE \
      --minUptime $MIN_UPTIME \
      --spinSleepTime $SPIN_SLEEP_TIME \
      start $APPLICATION_PATH 2>&1 > /dev/null &
    RETVAL=$?
}
 
stop() {
    if [ -f $PIDFILE ]; then
        echo "Shutting down $NAME"
        # Tell Forever to stop the process.
        forever stop $APPLICATION_PATH 2>&1 > /dev/null
        # Get rid of the pidfile, since Forever won't do that.
        rm -f $PIDFILE
        RETVAL=$?
    else
        echo "$NAME is not running."
        RETVAL=0
    fi
}
 
restart() {
    stop
    start
}
 
status() {
    # On Ubuntu this isn't even necessary. To find out whether the service is
    # running, use "service my-application status" which bypasses this script
    # entirely provided you used the service utility to start the process.
    #
    # The commented line below is the obvious way of checking whether or not a
    # process is currently running via Forever, but in recent Forever versions
    # when the service is started during Chef provisioning a dead pipe is left
    # behind somewhere and that causes an EPIPE exception to be thrown.
    # forever list | grep -q "$APPLICATION_PATH"
    #
    # So instead we add an extra layer of indirection with this to bypass that
    # issue.
    echo `forever list` | grep -q "$APPLICATION_PATH"
    if [ "$?" -eq "0" ]; then
        echo "$NAME is running."
        RETVAL=0
    else
        echo "$NAME is not running."
        RETVAL=3
    fi
}
 
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        restart
        ;;
    *)
        echo "Usage: {start|stop|status|restart}"
        exit 1
        ;;
esac
exit $RETVAL