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
FFPROBE_PATH = '/web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh'
TS_PREPARER_PATH = 'node %s' % os.path.join(os.path.dirname(__file__), '../../native/node_addons/TsPreparer/TsPreparer.js')
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
preparedAdsPath = os.path.join(tempfile.gettempdir(), 'preparedAds')

# create required folders
try:
	os.mkdir(tempDownloadPath)
except OSError:
	pass
	
try:
	os.mkdir(preparedAdsPath)
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
		writeOutput("downloading %s to %s" % (url, path))
		startTime = time.time()
		urllib.urlretrieve(url, path)
		writeOutput( "download took %s" % (time.time() - startTime))
	return path

def executeCommand(cmdLine):
	writeOutput(cmdLine)
	startTime = time.time()
  	writeOutput(commands.getoutput(cmdLine))
	writeOutput('command took %s' % (time.time() - startTime))

outputFileName = os.path.join(preparedAdsPath, outputKey + '.ts')
if not os.path.exists(outputFileName):
	# download the ad
	sourceFile = getUrl(adUrl)

	# convert the ad
	cmdLine = ' '.join([FFMPEG_PATH, ' -i %s ' % sourceFile, encodingParams, ' -y %s' % outputFileName])
	executeCommand(cmdLine)

# save to memcache
cmdLine = ' '.join(map(lambda x: str(x), [TS_PREPARER_PATH, MEMCACHE_HOST, MEMCACHE_PORT, 0, outputKey, FFMPEG_PATH, FFPROBE_PATH, 'nocut', outputFileName]))
executeCommand(cmdLine)

writeOutput('done')
