var url = require('url');

require('../../utils/KalturaUtils');

KalturaM3U8Parser = {
	/**
	 * Parse m3u8 manifest
	 * @param manifestContent
	 * @returns object {headers, segments, footers}
	 */
	parseM3U8 : function(manifestContent, masterUrl){
		var manifest = {
			headers: {},
			segments: [],
			footers: {}
		};
			
		var segmentInfo = {};
		var lastSequenceNum = null;
		var extMediaSequence = null;
		var skipFirstSegment = false; //skip first segment to avoid 404 errors on ts
		var m3u8Lines = manifestContent.split('\n');
		for(var i = 0; i < m3u8Lines.length; i++){
			var m3u8Line = m3u8Lines[i].trim();
			if(m3u8Line.length == 0)
				continue;
			
			if(m3u8Line[0] != '#'){
				if(!skipFirstSegment){
					skipFirstSegment = true;
					continue;
			}
			if(lastSequenceNum == null){
				extMediaSequence = manifest.headers['EXT-X-MEDIA-SEQUENCE'] * 1;
				lastSequenceNum = extMediaSequence;
			}
					
			segmentInfo.url = m3u8Line;
			segmentInfo.resolvedUrl = url.resolve(masterUrl, m3u8Line);
			segmentInfo.sequence = lastSequenceNum;
			manifest.segments.push(segmentInfo);
			segmentInfo = {};
			lastSequenceNum += 1;
			continue;
		}
					
		var splittedLine = m3u8Line.substr(1).split(':', 2);
		if(splittedLine.length < 2)
			splittedLine.push('');
		
			var key = splittedLine[0];
			var value = splittedLine[1];
				
			switch(key){
				case 'EXT-X-ENDLIST':
					manifest.footers[key] = value;
					break;
					
				case 'EXTINF':
					if(value.substr(-1) == ','){
						value = value.trim(0, value.length - 1);
					}						
					value = parseFloat(value);
					segmentInfo[key] = value;
					segmentInfo.duration = parseInt(value * 1000);
					break;
						
				case 'EXT-X-DISCONTINUITY':
					if(value.substr(-1) == ','){
						value = value.trim(0, value.length - 1);
					}
												
					segmentInfo[key] = value;
					break;

				case 'EXT-X-MEDIA-SEQUENCE':
					value = (parseInt(value) + 1).toString();
						
					manifest.headers[key] = value;
					break;	
						
				default:
					manifest.headers[key] = value;
			}
		}
		return manifest;
	},
		
		
	/**
	 * Build m3u8 manifest
	 * 
	 * @param headers
	 * @param segments
	 * @param footers
	 * @returns string
	 */
	buildM3U8 : function(headers, segments, footers) {
		result = '';
		
		for(var key in headers){
			var value = headers[key];
			result += "#" + key;
			if(value.length > 0)
				result += ":" + value;
			result += '\n';
		}
				
		for(var i = 0; i < segments.length; i++){
			var segment = segments[i];
			segmentUrl = segment.url;				
			result += '#EXTINF:' + (segment.duration / 1000).toFixed(3) + ',\n';
			result += segmentUrl + '\n';
		}
		
		for(var key in footers){
			var value = footers[key];
			result += '#' + key;
			if(value.length > 0)
				result += ':' + value;
			result += '\n';
		}
			
		return result;
	},
	
	/**
	 * @param attributes
	 * @returns Array
	 */
	splitM3U8TagAttributes : function(attributes) {
		var result = [];
		var commaPos;
		var quotePos;
		while (attributes.length) {
			commaPos = attributes.indexOf(',');
			quotePos = attributes.indexOf('"');
			if (quotePos >= 0 && quotePos < commaPos) {
				quoteEndPos = attributes.indexOf('"', quotePos + 1);
				commaPos = attributes.indexOf(',', quoteEndPos);
			}
			if (commaPos < 0) {
				result.push(attributes);
				break;
			}
			result.push(attributes.slice(0, commaPos));
			attributes = attributes.slice(commaPos + 1);
		}
		return result;
	},

	/**
	 * @param currentLine
	 * @returns object
	 */
	parseM3U8TagAttributes : function(currentLine) {
		var attributes = currentLine.split(':', 2)[1];
		attributes = KalturaM3U8Parser.splitM3U8TagAttributes(attributes);
		var result = {};
		for (var i = 0; i < attributes.length; i++) {
			var splittedAtt = attributes[i].split('=', 2);
			if (splittedAtt.length > 1) {
				var value = splittedAtt[1].trim();
				if (value.startsWith('"') && value.endsWith('"'))
					value = value.slice(1, -1);
				result[splittedAtt[0]] = value;
			} else {
				result[splittedAtt[0]] = '';
			}
		}
		return result;
	}
			
};

module.exports = KalturaM3U8Parser;
