import urllib2
import urllib
import sys
import os
import re

def writeLog(msg):
	global log
	log += msg + '\r\n'
	print msg
	
# log http redirects
class MyHTTPRedirectHandler(urllib2.HTTPRedirectHandler):
	def http_error_302(self, req, fp, code, msg, headers):
		newurl = None
		if 'location' in headers:
			newurl = headers.getheaders('location')[0]
		elif 'uri' in headers:
			newurl = headers.getheaders('uri')[0]
		writeLog('Redirecting to %s' % newurl)
		return urllib2.HTTPRedirectHandler.http_error_302(self, req, fp, code, msg, headers)

	http_error_301 = http_error_303 = http_error_307 = http_error_302

def getUrlData(url, requestHeaders={}):
	writeLog('Getting %s...' % url)
	request = urllib2.Request(url, headers=requestHeaders)
	f = urllib2.urlopen(request)
	cookies = []
	for curHeader in f.info().headers:
		splittedHeader = curHeader.split(':', 1)
		if splittedHeader[0].strip().lower() == 'set-cookie':
			cookies.append(splittedHeader[1].strip())
	return (cookies, f.read())

def saveFlavorManifestDebugInfo(url, outputFile, segmentCount):
	global log
	
	cookies, origManifest = getUrlData(url)
	requestHeaders = {'Cookie': '; '.join(cookies)}

	# parse the manifest
	tsSegments = []
	manifestHeader = []
	flavorInfo = ''
	for curLine in origManifest.split('\n'):
		curLine = curLine.strip()
		if len(curLine) == 0:
			continue
		if curLine.startswith('#EXT-X-ENDLIST'):
			continue
		elif curLine.startswith('#EXTINF:') or curLine.startswith('#EXT-X-DISCONTINUITY'):
			flavorInfo += '\n' + curLine
		elif curLine[0] != '#':
			segIds = re.findall('segment(\d+)_', curLine)
			if len(segIds) > 0:
				segId = int(segIds[0])
			else:
				segId = None
			tsSegments.append([flavorInfo, curLine, segId])
			flavorInfo = ''
		else:
			manifestHeader.append(curLine)

	tsSegments = tsSegments[-segmentCount:]

	# get original URLs
	segId0 = None
	for curIndex in xrange(len(tsSegments)):
		if tsSegments[curIndex][-1] != None:
			segId0 = tsSegments[curIndex][-1] - curIndex
			origUrl = tsSegments[curIndex][1]
			break

	for curIndex in xrange(len(tsSegments)):
		if segId0 != None and tsSegments[curIndex][-1] == None:
			tsSegments[curIndex][-1] = re.sub('segment(\d+)_', 'segment%s_' % (segId0 + curIndex), origUrl)
		else:
			tsSegments[curIndex][-1] = None

	# get the TS files and generate the manifest
	origManifest = resultManifest = '\n'.join(manifestHeader)
	curIndex = 1
	for flavorInfo, tsUrl, origTsUrl in tsSegments:
		tsOutputFile = '%s-%s.ts' % (os.path.splitext(outputFile)[0], curIndex)	
		_, tsData = getUrlData(tsUrl, requestHeaders)
		writeLog('Saving to %s' % tsOutputFile)
		file(tsOutputFile, 'wb').write(tsData)
		
		if origTsUrl != None:
			origTsOutputFile = '%s-%s-orig.ts' % (os.path.splitext(outputFile)[0], curIndex)
			_, tsData = getUrlData(origTsUrl, requestHeaders)
			writeLog('Saving to %s' % origTsOutputFile)
			file(origTsOutputFile, 'wb').write(tsData)
		else:
			origTsOutputFile = tsOutputFile
			
		origManifest += '%s\n%s' % (flavorInfo, os.path.basename(origTsOutputFile))
		resultManifest += '%s\n%s' % (flavorInfo, os.path.basename(tsOutputFile))
		curIndex += 1
	resultManifest += '\n#EXT-X-ENDLIST\n'
	origManifest += '\n#EXT-X-ENDLIST\n'

	# write the manifests and the log
	file(outputFile, 'wb').write(resultManifest)
	splittedOutputFile = os.path.splitext(outputFile)
	file(splittedOutputFile[0] + '-orig' + splittedOutputFile[1], 'wb').write(origManifest)

	file(outputFile + '.log', 'wb').write(log)
	log = ''

if len(sys.argv) < 3:
	print 'Usage\n\tpython downloadM3U8.py <url> <output m3u8> [<segment count>]'
	sys.exit(1)

url, outputFile = sys.argv[1:3]
segmentCount = 10
if len(sys.argv) >= 4:
	segmentCount = int(sys.argv[3])

log = ''
	
cookieprocessor = urllib2.HTTPCookieProcessor()
opener = urllib2.build_opener(MyHTTPRedirectHandler, cookieprocessor)
urllib2.install_opener(opener)

_, origManifest = getUrlData(url)

if not '#EXT-X-STREAM-INF:' in origManifest:
	# flavor manifest
	saveFlavorManifestDebugInfo(url, outputFile, segmentCount)
	sys.exit(0)
	
# master manifest
curIndex = 0
outputFilePath, outputFileBase = os.path.split(outputFile)
for curLine in origManifest.split('\n'):
	curLine = curLine.strip()
	if len(curLine) == 0 or curLine[0] == '#':
		continue
	curPath = os.path.join(outputFilePath, str(curIndex))
	try:
		os.mkdir(curPath)
	except OSError:
		pass
	saveFlavorManifestDebugInfo(curLine, os.path.join(curPath, outputFileBase), segmentCount)
	curIndex += 1
	
file(outputFile, 'wb').write(origManifest)

