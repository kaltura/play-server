KalturaAspectRatio = {


	aspectRatioGroups: {
		'5:4': [1280/1024*1000],
		'4:3': [1280/960*1000, 1392./1040*1000],
		'3:2': [1280/854*1000,1152/768*1000,1280./848*1000],
		'8:5': [320/200*1000,1440./896*1000,1680./1040*1000,320./192*1000],
		'1024:600': [1024/600*1000,1024/592*1000],
		'16:9': [1360/768*1000,848/480*1000,1920/1080*1000,1366/768*1000,854/480*1000,1920/1072*1000], 
		'1.85:1': [1850], 
		'2048:1080': [2048/1080*1000,2048/1072*1000], 
		'2.35:1': [2350], 
		'2.37:1': [2370], 
		'2.39:1': [2390], 
		'2.55:1': [2550]},
		
	aspectRatioGroupsOrder: ['LOW', '5:4', '4:3', '3:2', '8:5', '1024:600', '16:9', '1.85:1', '2048:1080', '2.35:1', '2.37:1', '2.39:1', '2.55:1', 'HIGH'],
			
	convertFrameSize: function(width, height){
		return this.convertFrameSizeForGroups(width, height, this.aspectRatioGroups);
	},
	
	convertFrameSizeForGroups: function(width, height, aspectRatioGroups){
		var ratio = width*1000/height;
		var currentRatio = null, prevRatio = null, currentGroup = null, prevGroup = null;
		var lowerLimit = 1280/1024*1000*0.9;
		var upperLimit = 2550*1.1;
		var found = false;

		for(var group in aspectRatioGroups){
			if(prevGroup == null)
				prevGroup = group;
			
			var aspectRatioGroup = aspectRatioGroups[group];
			for(var i=0; i<aspectRatioGroup.length; i++){
				if(currentRatio == null){
					currentRatio = aspectRatioGroup[i];
					currentGroup = group;
				}
				prevRatio = currentRatio;
				prevGroup = currentGroup;
				currentRatio = aspectRatioGroup[i];
				currentGroup = group;
				if(aspectRatioGroup[i] >= ratio){
					found = true;
					break;
				}
			}
			if(found)
				break;
		}
		
		if(currentRatio == ratio)
			return currentGroup;
		else if (ratio < lowerLimit)
			return 'LOW';
		else if (ratio > upperLimit)
			return 'HIGH';
		else if(Math.abs(ratio-prevRatio) < Math.abs(ratio-currentRatio))
			return prevGroup;
		else
			return currentGroup;		
	},
	
	convertFrameSizeForAspectRatioKeys: function(width, height, aspectRatioGroupKeys){
		var aspectRatioGroups = {};
		for(var i=0; i<aspectRatioGroupKeys.length; i++)
			aspectRatioGroups[aspectRatioGroupKeys[i]] = this.aspectRatioGroups[aspectRatioGroupKeys[i]];
		return this.convertFrameSizeForGroups(width, height, aspectRatioGroups);
	},
	
	getBestAspectRatioForGroup: function(originalGroup, aspectRatioGroups){

		var originalGroupIndex =  this.aspectRatioGroupsOrder.indexOf(originalGroup);
		var selectedIndex = this.aspectRatioGroupsOrder.indexOf(aspectRatioGroups[0]);
		for(var i=0; i<aspectRatioGroups.lenght;i++){
			var index = this.aspectRatioGroupsOrder.indexOf(aspectRatioGroups[i]);
			if(originalGroupIndex == index)
				return originalGroup;
			else if(Math.abs(originalGroupIndex-index) < Math.abs(originalGroupIndex-selectedIndex)){
				selectedIndex = index;
			}
		}
		return this.aspectRatioGroupsOrder[selectedIndex];
	}
			
};

module.exports = KalturaAspectRatio;
