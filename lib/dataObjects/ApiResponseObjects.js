/**
 * This file is dedicated to represent a valid API response as an object
 * Expect only valid responses
 */

VodData = function(partnerId, flavorIds , entry, cuePointListResult, flavorURLs) {
	this.entry = entry;
	this.cuePointList = cuePointListResult;
	var flavorsData = new Array();
	// we start at 2 since 0 was entry and 1 was cuePointslist
	for (var i =0; i< flavorIds.length ; i++ ){
		var flavorId = flavorIds[i];
		var flavorDownloadUrl = flavorURLs[i];
		var flavorData = new FlavorURLData(flavorId, flavorDownloadUrl);
		flavorsData.push(flavorData);
	}
	this.flavorDataList = flavorsData;
	this.numOfFlavors = flavorIds.length;
	this.partnerId = partnerId;
}

/**
 * returns only the flavors URLs as an array
 * @returns {Array}
 */
VodData.prototype.getOnlyFlavorUrls = function(){
	var answer = new Array();
	for (var i=0; i < this.flavorDataList.length ; i++){
		answer.push(this.flavorDataList[i].url);
	}
	return answer;
}


FlavorURLData = function(id, url){
	this.url = url;
	this.id = id;
}