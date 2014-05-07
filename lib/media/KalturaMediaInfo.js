
var child_process = require('child_process');

var KalturaMediaInfo = {
	bin: 'mediainfo',

	config: {
		general: {
			bitrate: {
				names: ['overall bit rate', 'containerbitrate'],
				callback: function(value){
					return KalturaMediaInfo.parseBitrate(value);
				}
			}
		},
		video: {
			bitrate: {
				names: ['bit rate', 'videobitrate'],
				callback: function(value){
					return KalturaMediaInfo.parseBitrate(value);
				}
			},
			width: {
				names: ['width', 'videowidth'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['pixels']);
				}
			},
			height: {
				names: ['height', 'videoheight'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['pixels']);
				}
			},
			frameRate: {
				names: ['frame rate', 'videoframerate'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['fps']);
				}
			},
			reframes: {
				names: ['format settings, reframes', 'videoreframes'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['frame', 'frames']);
				}
			},
			profile: {
				names: ['format profile', 'videoprofile'],
				callback: function(value){
					return KalturaMediaInfo.parseVideoProfile(value);
				}
			}
		},
		audio: {
			bitrate: {
				names: ['bit rate', 'audiobitrate'],
				callback: function(value){
					return KalturaMediaInfo.parseBitrate(value);
				}
			},
			SampleRate: {
				names: ['sampling rate', 'audiosamplingrate'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['khz']) * 1000;
				}
			},
			channels: {
				names: ['channel(s)', 'audiochannels'],
				callback: function(value){
					return KalturaMediaInfo.parseItem(value, ['channel', 'channels']);
				}
			}
		}		
	},
	
	getRaw: function(filePath, callback){
		var cmd = this.bin + ' ' + filePath;
		cmd.exec(callback);
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
					mediaInfo[sectionName][configAttributeName] = attribute.callback(value);
				}
			}
		}
		
		callback(mediaInfo);
	},
	
	parse: function(filePath, callback){
		this.getRaw(filePath, function(data){
			KalturaMediaInfo.parseRaw(data, callback);
		});
	},
	
	parseValue: function(value){
		var splittedValue = value.split(' ');
		
		return {
			units: splittedValue.pop().toLowerCase(),
			value: parseFloat(splittedValue.join(''))
		};
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
	
	parseItem: function(value, allowedUnits){
		var parsedValue = this.parseValue(value);
		for(var i = 0; i < allowedUnits.length; i++){
			if(parsedValue.units == allowedUnits[i]){
				return parsedValue.value;
			}
		}
	},
};

module.exports = KalturaMediaInfo;
