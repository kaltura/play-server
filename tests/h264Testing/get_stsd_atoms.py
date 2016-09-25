from mp4_utils import *
import sys

def processFile(inputFile):
    f = file(inputFile, 'rb')
    fileData = f.read(4096)
    atoms = parseAtoms(fileData, 0, len(fileData))
    moovAtom = getAtom(atoms, 'moov')
    if moovAtom == None:
        raise Exception('moov atom not found')
    startOffset, _, endOffset, _ = moovAtom
    if endOffset > len(fileData):
        fileData += f.read(endOffset - len(fileData))
    atoms = parseAtoms(fileData, 0, len(fileData))
    moovAtom = getAtom(atoms, 'moov')
    result = []
    for trak in moovAtom[3]['trak']:
        stsdAtom = getAtom(trak[3], 'mdia.minf.stbl.stsd')
        hdlrAtom = getAtom(trak[3], 'mdia.hdlr')
        
        mediaType = fileData[(hdlrAtom[0] + 0x10):(hdlrAtom[0] + 0x14)]
        stsdAtom = fileData[stsdAtom[0]:stsdAtom[2]]
        result.append((mediaType, stsdAtom))
	result.sort()	# sort by media type
	for mediaType, stsdAtom in result:
		print mediaType
		print stsdAtom.encode('hex')

processFile(sys.argv[1])
