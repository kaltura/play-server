var fs = require('fs');
var util = require('util');
var tsId3Reader = require('../../../bin/Debug/TsId3Reader');

if (process.argv.length < 3) {
	console.log('Usage:\n\tnode ParseFile.js <input file>');
	process.exit(1);
}

var data = fs.readFileSync(process.argv[2]);

console.log(util.inspect(tsId3Reader.parseBuffer(data), {depth: null}));
