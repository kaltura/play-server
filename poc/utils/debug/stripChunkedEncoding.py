import sys
import os

if len(sys.argv) != 3:
	print 'Usage:\n\t%s <input file> <output file>' % os.path.basename(__file__)
	sys.exit(1)

inputData = file(sys.argv[1], 'rb').read()
outputFile = file(sys.argv[2], 'wb')

curPos = 0
while curPos < len(inputData):
	newLinePos = inputData.find('\n', curPos)
	curSize = int(inputData[curPos:newLinePos].strip(), 16)
	if curSize == 0:
		break
	curPos = newLinePos + 1
	outputFile.write(inputData[curPos:(curPos + curSize)])
	curPos += curSize
	curPos += 2			# skip the \r\n

outputFile.close()
