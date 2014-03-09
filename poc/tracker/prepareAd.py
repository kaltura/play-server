import videoMemcache
import tempfile
import memcache
import commands
import hashlib
import random
import urllib
import time
import sys
import os

FFMPEG_PATH = '/web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh'
MEMCACHE_HOST = 'localhost'
MEMCACHE_PORT = 11211

# XXXX TODO share this code (copied from streamTracker)

def writeOutput(msg):
	global lastTimestamp
	curTimestamp = time.time()
	duration = curTimestamp - lastTimestamp
	lastTimestamp = curTimestamp
	for curLine in msg.split('\n'):
		sys.stdout.write('%s [%s] [%s] %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), duration, sessionId, curLine))
		sys.stdout.flush()

# parse the command line
if len(sys.argv) < 4:
	print 'Usage:\n\tpython prepareAd.py <ad url> <output key> <encoding params>'
	sys.exit(1)

def quoteArgs(cmdArg):
	if cmdArg.endswith("'") or cmdArg.endswith('"'):
		return cmdArg
	return "'%s'" % cmdArg
	
sessionId = random.getrandbits(32)
lastTimestamp = time.time()

adUrl = sys.argv[1]
outputKey = sys.argv[2]
encodingParams = ' '.join(map(quoteArgs, sys.argv[3:]))

writeOutput('started, url=%s key=%s encoding-params=%s' % (adUrl, outputKey, encodingParams))

tempDownloadPath = os.path.join(tempfile.gettempdir(), 'downloadedTS')

# create required folders
try:
	os.mkdir(tempDownloadPath)
except OSError:
	pass

# connect to memcache
memcache = memcache.Client(['%s:%s' % (MEMCACHE_HOST, MEMCACHE_PORT)])

def md5(buf):
	m = hashlib.md5()
	m.update(buf)
	return m.digest().encode('hex')

def getUrl(url, fileExt = ''):
	path = os.path.join(tempDownloadPath, md5(url) + fileExt)
	if not os.path.exists(path):
		writeOutput("downloading %s" % (url))
		startTime = time.time()
		urllib.urlretrieve(url, path)
		writeOutput( "download took %s" % (time.time() - startTime))
	return path

def executeCommand(cmdLine):
	writeOutput(cmdLine)
	startTime = time.time()
  	writeOutput(commands.getoutput(cmdLine))
	writeOutput('command took %s' % (time.time() - startTime))

# get the ad
sourceFile = getUrl(adUrl)

# convert the ad
tempFileName = os.path.join(tempDownloadPath, outputKey + '.ts')
cmdLine = ' '.join([FFMPEG_PATH, ' -i %s ' % sourceFile, encodingParams, ' -y %s' % tempFileName])
executeCommand(cmdLine)

# save to memcache
videoMemcache.addVideoToMemcache(memcache, outputKey, tempFileName, True)

writeOutput('done')