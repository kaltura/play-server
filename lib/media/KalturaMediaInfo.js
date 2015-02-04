var child_process = require('child_process');
var fs = require('fs');

var KalturaMediaInfo = {
	bin: 'mediainfo',

	config: {
		general: {
			bitrate: {
				names: ['overall bit rate'],
				callback: function(value){
					return KalturaMediaInfo.parseBitrate(value);
				}
			}
		},
		video: {
			duration: {
				names: ['duration'],
				callback: function(value){
					return KalturaMediaInfo.parseDuration(value);
				}
			},
			bitrate: {
				names: ['nominal bit rate'],
				callback: function(value){
					return KalturaMediaInfo.parseBitrate(value);
				}
			},
			width: {
				names: ['width'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['pixels']);
				}
			},
			height: {
				names: ['height'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['pixels']);
				}
			},
			frameRate: {
				names: ['frame rate'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['fps']);
				}
			},
			reframes: {
				names: ['format settings, reframes'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['frame', 'frames']);
				}
			},
			profile: {
				names: ['format profile'],
				callback: function(value){
					return KalturaMediaInfo.parseVideoProfile(value);
				}
			},			
			colorPrimaries: {
				names: ['color primaries'],
			},
			transferCharacteristics: {
				names: ['transfer characteristics'],
			},
			matrixCoefficients: {
				names: ['matrix coefficients'],
			},
			standard: {
				names: ['standard'],
			},
		},
		audio: {
			bitrate: {
				names: ['bit rate'],
				callback: function(value){
					return KalturaMediaInfo.parseBitrate(value);
				}
			},
			sampleRate: {
				names: ['sampling rate'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['khz']) * 1000;
				}
			},
			channels: {
				names: ['channel(s)'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['channel', 'channels']);
				}
			},
			profile: {
				names: ['format profile'],
				callback: function(value){
					return KalturaMediaInfo.parseAudioProfile(value);
				}
			},
		}		
	},
	
	parseRaw: function(data, callback){
		var sectionName = null;
		var lines = data.split('\n');
		var parsedAttributes = {};
		for(var i = 0; i < lines.length; i++){
			var line = lines[i].trim();
			
			if(!line.length){
				sectionName = null;
				continue;
			}
			
			var parts = line.split(':');
			if(parts.length == 1){
				sectionName = line.toLowerCase();
				parsedAttributes[sectionName] = {};
				continue;
			}

			var key = parts[0].trim().toLowerCase();
			var value = parts[1].trim();
			parsedAttributes[sectionName][key] = value;
		}
		
		var mediaInfo = {};
		
		for(sectionName in KalturaMediaInfo.config){
			if(!parsedAttributes[sectionName]){
				continue;
			}
			
			mediaInfo[sectionName] = {};
			var section = KalturaMediaInfo.config[sectionName];
			for(var configAttributeName in section){
				if(!section[configAttributeName]){
					continue;
				}
				var attribute = section[configAttributeName];
				for(var i = 0; i < attribute.names.length; i++){
					var attributeName = attribute.names[i];
					if(typeof parsedAttributes[sectionName][attributeName] === 'undefined'){
						continue;
					}
					
					var value = parsedAttributes[sectionName][attributeName];
					if(attribute.callback){
						value = attribute.callback(value);
					}
					mediaInfo[sectionName][configAttributeName] = value;
				}
			}
		}
		
		return mediaInfo;
	},
	
	parse: function(filePath, callback){
		var This = this;
		fs.stat(filePath, function (err, stats) {
			// TODO handle errors
			
			var fileSize = stats.size;
			var cmd = This.bin + ' ' + filePath;
			child_process.exec(cmd, function (error, stdout, stderr) {
				var mediaInfo = KalturaMediaInfo.parseRaw(stdout);
				mediaInfo.fileSize = fileSize;
				callback(mediaInfo);
			});
		});
	},
	
	parseValue: function(value){
		value = value.split(' / ')[0];			// support values like 'Sampling rate : 44.1 KHz / 22.05 KHz'
		var splittedValue = value.split(' ');
		
		return {
			units: splittedValue.pop().toLowerCase(),
			value: parseFloat(splittedValue.join(''))
		};
	},
	
	parseDuration: function(value){
		var units = {
			'ms': 	0.001,
			's': 	1,
			'mn': 	60,
			'h': 	60 * 60,
		};
		var splittedValue = value.split(' ');
		var result = 0;
		
		for (var i = 0; i < splittedValue.length; i++) {
			var curValue = splittedValue[i].trim();
			if (!curValue) {
				continue;
			}
			for (var curUnit in units) {
				if (!curValue.endsWith(curUnit)) {
					continue;
				}
				curValue = curValue.slice(0, curValue.length - curUnit.length);
				result += parseFloat(curValue) * units[curUnit];
				break;
			}
		}
		return result;
	},
	
	parseBitrate: function(value){
		var parsedValue = this.parseValue(value);
		switch(parsedValue.units){
			case 'bps':
				return parsedValue.value;
			case 'kbps':
				return parsedValue.value * 1024;
			case 'mbps':
				return parsedValue.value * 1024 * 1024;
			case 'gbps':
				return parsedValue.value * 1024 * 1024 * 1024;
		}
		return null;
	},
	
	parseVideoProfile: function(value){
		var splittedValue = value.split('@L');
		if(splittedValue.length != 2)
			return null;
		
		return {
			name: splittedValue[0],
			level: splittedValue[1]
		};
	},

	parseAudioProfile: function(value){
		return value.split(' / ')[0].split('@')[0];
	},
	
	parseItem: function(value, allowedUnits){
		var parsedValue = this.parseValue(value);
		for(var i = 0; i < allowedUnits.length; i++){
			if(parsedValue.units == allowedUnits[i]){
				return parsedValue.value;
			}
		}
	},
	
	compare: function(bitrate1, width1, height1, bitrate2, width2, height2){
	 	if(bitrate2 == 0 || bitrate1 == bitrate2){
	 		if(width1 > width2 && height1 > height2){
	 			return 1;
	 		} 				
	 		else if(width1 == width2 && height1 == height2){
	 			return 0;
	 		} 					
	 		else{
	 			return -1;
	 		} 				
	 	}
	 	else if(bitrate1 > bitrate2){
	 		return 1;
	 	} 			
	 	else{
	 		return -1;	
	 	}	 				
	 }
};

module.exports = KalturaMediaInfo;
