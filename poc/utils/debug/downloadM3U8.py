import urlparse
import urllib
import sys
import os

if len(sys.argv) < 3:
	print 'Usage\n\tpython downloadM3U8.py <url> <output m3u8> [<segment count>]'
	sys.exit(1)

url, outputFile = sys.argv[1:3]
segmentCount = 10
if len(sys.argv) >= 4:
	segmentCount = int(sys.argv[3])

def getUrlData(url):
	print 'Getting %s...' % url
	return urllib.urlopen(url).read()

origManifest = getUrlData(url)

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
		curLine = urlparse.urljoin(url, curLine)
		tsSegments.append((flavorInfo, curLine))
		flavorInfo = ''
	else:
		manifestHeader.append(curLine)

tsSegments = tsSegments[-segmentCount:]

resultManifest = '\n'.join(manifestHeader)
curIndex = 1
for flavorInfo, tsUrl in tsSegments:
	tsOutputFile = '%s-%s.ts' % (os.path.splitext(outputFile)[0], curIndex)
	file(tsOutputFile, 'wb').write(getUrlData(tsUrl))
	resultManifest += '%s\n%s' % (flavorInfo, os.path.basename(tsOutputFile))
	curIndex += 1
resultManifest += '\n#EXT-X-ENDLIST\n'
	
file(outputFile, 'wb').write(resultManifest)
