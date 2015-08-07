#!/bin/bash - 
#===============================================================================
#          FILE: 1.sh
#         USAGE: ./1.sh 
#   DESCRIPTION: 
#       OPTIONS: ---
#  REQUIREMENTS: ---
#          BUGS: ---
#         NOTES: ---
#        AUTHOR: Jess Portnoy (), <jess.portnoy@kaltura.com>
#  ORGANIZATION: Kaltura, inc.
#       CREATED: 08/07/2015 05:08:41 PM BST
#      REVISION:  ---
#===============================================================================

#set -o nounset# Treat unset variables as an error
PATH=/usr/local/bin:$PATH
BASEDIR=`pwd`
cd native/vendor/id3lib-3.8.3
./configure 
make
make clean
cd $BASEDIR/native/node_addons/TsPreparer
node-gyp configure
node-gyp build
cd $BASEDIR/native/node_addons/TsStitcher
node-gyp configure
node-gyp build

cd $BASEDIR/native/node_addons/TsId3Reader
node-gyp configure
node-gyp build


