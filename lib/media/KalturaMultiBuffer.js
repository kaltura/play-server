var fs = require('fs');
require('../utils/KalturaConfig');

var KalturaMultiBuffer = function() {
	this.buffers = [];
};

KalturaMultiBuffer.prototype.readFilesInternal = function(fileList, curIndex, callback) {
	if (curIndex >= fileList.length) {
		callback(null);
		return;
	}
	
	var This = this;
	fs.readFile(fileList[curIndex], function (err, data) {
		if (err) {
			callback(err);
			return;
		}
		
		This.buffers.push(data);
		This.readFilesInternal(fileList, curIndex + 1, callback);
	});
};

KalturaMultiBuffer.prototype.readFiles = function(fileList, callback) {
	this.readFilesInternal(fileList, 0, callback);
};

KalturaMultiBuffer.prototype.writeFileInternal = function(fd, bufferIndex, callback) {
	if (bufferIndex >= this.buffers.length) {
		fs.closeSync(fd);
		callback();
		return;
	}
	
	var This = this;
	fs.write(fd, this.buffers[bufferIndex], 0, this.buffers[bufferIndex].length, null, function (err, written, buffer) {
		if (err) {
			fs.closeSync(fd);
			callback(err);
			return;
		}
		
		This.writeFileInternal(fd, bufferIndex + 1, callback);
	});
};

KalturaMultiBuffer.prototype.writeFile = function(outputFile, callback) {
	var This = this;
	fs.open(outputFile, 'w', function (err, fd) {
		if (err) {
			callback(err);
			return;
		}
		
		This.writeFileInternal(fd, 0, callback);
	});
};

KalturaMultiBuffer.prototype.writeTempFile = function(callback) {
	var This = this;
	var outputFilePath = KalturaConfig.config.cloud.sharedBasePath + '/tmp/' + KalturaUtils.getUniqueId();
	fs.open(outputFilePath, 'w', function (err, outputFileDesc) {
		if (err) {
			callback(err);
			return;
		}

		This.writeFileInternal(outputFileDesc, 0, function (err) {
			if (err) {
				callback(err);
			}
			else {
				callback(null, outputFilePath);
			}
		});
	});
};

KalturaMultiBuffer.prototype.getPosition = function(position) {
	if (position < 0 && this.buffers.length > 0) {
		// negative position indicates the end position
		return {
			index: this.buffers.length - 1,
			position: this.buffers[this.buffers.length - 1].length
		};
	}
	
	var curPos = 0;
	for (var i = 0; i < this.buffers.length; i++) {
		if (position >= curPos && position < curPos + this.buffers[i].length) {
			return { 
				index: i, 
				position: position - curPos
			};
		}
		curPos += this.buffers[i].length;
	}
	return null;
};

KalturaMultiBuffer.prototype.push = function(buffer) {
	this.buffers.push(buffer);
};

KalturaMultiBuffer.prototype.concat = function(multiBuffer) {
	var result = new KalturaMultiBuffer();
	result.buffers = this.buffers.concat(multiBuffer.buffers);
	return result;
};

KalturaMultiBuffer.prototype.slice = function(startPos, endPos) {
	var result = new KalturaMultiBuffer();
	// validate start/end positions
	if (startPos < 0 || (endPos > 0 && startPos >= endPos)) {
		return result;
	}
	
	// translate the positions to indexes
	startPos = this.getPosition(startPos);
	if (!startPos) {
		// start position exceeds the buffer length => return empty
		return result;
	}

	endPos = this.getPosition(endPos);
	if (!endPos) {
		// end position exceeds the buffer length => truncate it to the actual length
		endPos = this.getPosition(-1);
	}

	// generate the slice
	for (var curIndex = startPos.index; curIndex <= endPos.index; curIndex++) {
		var curStart = 0;
		if (curIndex == startPos.index) {
			curStart = startPos.position;
		}
		var curEnd = this.buffers[curIndex].length;
		if (curIndex == endPos.index) {
			curEnd = endPos.position;
		}
		result.buffers.push(this.buffers[curIndex].slice(curStart, curEnd));
	}
	
	return result;	
};

KalturaMultiBuffer.prototype.reverseWalk = function(endPos, callback) {
	if (this.buffers.length == 0) {
		return;
	}
	
	endPos = this.getPosition(endPos);
	if (!endPos) {
		// end position exceeds buffer length, truncate to the actual length
		endPos = this.getPosition(-1);
	}
	
	var curIndex;
	for (curIndex = endPos.index; curIndex >= 0; curIndex--) {
		var curEndPos = this.buffers[curIndex].length;
		if (curIndex == endPos.index) {
			curEndPos = endPos.position;
		}
		
		if (!callback(this.buffers[curIndex].slice(0, curEndPos))) {
			break;
		}
	}
};

KalturaMultiBuffer.prototype.toString = function() {
	var result = 'KalturaMultiBuffer {';
	for (var i = 0; i < this.buffers.length; i++) {
		if (i > 0) {
			result += ',';
		}
		result += this.buffers[i].length;
	}
	result += '}';
	return result;
};

module.exports = KalturaMultiBuffer;
