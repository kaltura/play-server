/**
 * This file represents the different structures needed to support the different layouts
 */

/**
 * Dynamic clip is an ad break link
 * @param id the ad break link
 * @constructor
 */
DynamicClipData = function( id) {
	this.id = id;
}

DynamicClipData.prototype.toJSON = function()
{
	return '{"type": "dynamic", "id": "' + this.id + '"}';
}

DynamicClipDataArray = function(idsList)
{
	this.clips =  new Array();
	for (var i=0;  i< idsList.length; i++)
	{
		var clip = new DynamicClipData(idsList[i]);
		this.clips.push(clip);
	}
}

/**
 * Source clip is reference to the real content video link
 * @param offset of the original content timeline
 * @param path to the mp4
 * @constructor
 */
SourceClipData = function(offset, path)
{
	this.clipFrom = offset;
	this.path = path;
}

SourceClipData.prototype.toJSON = function()
{
	return '{"type": "source", "path": "' + this.path + '", "clipFrom": ' + this.clipFrom +'}';
}
/**
 * Helper constructor for SourceClipData as array
 * @param offset
 * @param pathList map from flavor id to path
 * @constructor
 */
SourceClipDataArray = function(offset, pathList) {
	this.clips = new Array();
	for (var i=0; i< pathList.length; i++){
		var clip = new SourceClipData(offset, pathList[i]);
		this.clips.push(clip);
	}
}

/**
 * Notification is used to call the play server's API ,
 * scheduled by the offset given according to requested videos
 * @param id
 * @param offset
 * @constructor
 */
NotificationData = function(id, offset) {
	this.id = id;
	this.offset = offset;
}

NotificationData.prototype.toJSON = function(){
	return '{"id":"' + this.id + '", "offset":' + this.offset + '}';
}


/**
 * Data model to hold the Manifest layout structure
 * @constructor
 */
ManifestLayoutData = function(numberOfFlavors){
	this.durations = new Array();
	this.sequences = new Array(numberOfFlavors);
	for (var i = 0 ; i < numberOfFlavors ; i++  )
		this.sequences[i] = new Array(); // clips
	this.notifications = new Array();
}

ManifestLayoutData.prototype.addSequence = function(duration, clipList){
	if (!clipList || !duration){
		throw new Error('Either clipList [' + clipList +'] or duration [' + duration + '] were not defined ');
	} else if ( clipList.length != this.sequences.length){
		throw new Error('ClipList length [' + clipList.length +'] did not match sequences length [' + this.sequences.length + ']');
	} else {
		this.durations.push(duration);
		for (var i = 0 ; i < clipList.length ; i++ )
			this.sequences[i].push(clipList[i]);
	}
}

ManifestLayoutData.prototype.addNotification = function(notification){
	if(!notification){
		throw new Error('Argument notification was not defined ');
	}
	this.notifications.push(notification);
}

ManifestLayoutData.prototype.toJSON = function(){
	var discontinuityString = '"discontinuity": false';
	var durationsString = '"durations": [' + this.durations.toString() + ']';
	var sequencesString = '"sequences": [ ';
	for (var seqI = 0 ; seqI < this.sequences.length ; seqI++ ){
		sequencesString += '{"clips": [';
		for (var clipI =0 ; clipI < this.sequences[seqI].length ; clipI++){
			sequencesString += this.sequences[seqI][clipI].toJSON();
			if (clipI != this.sequences[seqI].length-1 )
				sequencesString += ',';
		}
		sequencesString += '] }';
		if (seqI != this.sequences.length-1 )
			sequencesString += ',';
	}
	sequencesString += ' ]';
	var notificationsString = '"notifications": ['
	for (var notifI = 0; notifI < this.notifications.length ; notifI++){
		notificationsString += this.notifications[notifI].toJSON();
		if (notifI != this.notifications.length-1 )
			notificationsString += ',';
	}
	notificationsString += ']';

	return '{' + discontinuityString + ',' + durationsString + ',' + sequencesString + ',' + notificationsString + '}';

}


/**
 * Data model to hold the Ad break layout structure
 * @constructor
 */
AdBreakLayoutData = function(){
	this.clipIds = new Array();
	this.durations = new Array();
	this.notifications = new Array();
}

AdBreakLayoutData.prototype.addClip = function(id, duration){
	if (!id || !duration){
		throw new Error('Either id [' + id +'] or duration [' + duration + '] were not defined ');
	} else {
		this.clipIds.push(id);
		this.durations.push(duration);
	}
}

AdBreakLayoutData.prototype.addNotification = function(notification){
	if(!notification){
		throw new Error('Argument notification was not defined ');
	}
	this.notifications.push(notification);
}

AdBreakLayoutData.prototype.toJSON = function(){
	var clipIdsString = '"clipIds": ["' + this.clipIds.join('","') + '"]';
	var durationsString = '"durations": [' + this.durations.toString() + ']';
	var notificationsString = '"notifications": ['
	for (var notifI = 0; notifI < this.notifications.length ; notifI++){
		notificationsString += this.notifications[notifI].toJSON();
		if (notifI != this.notifications.length-1 )
			notificationsString += ',';
	}
	notificationsString += ']';
	return '{' + clipIdsString + ',' + durationsString + ',' + notificationsString + '}';
}

/**
 * Data model to hold the Ad path links layout structure
 * @constructor
 */
AdPathLayoutData = function(){
	this.path = null;
}

AdPathLayoutData.prototype.setPath = function(path){
	if (!path){
		throw new Error('Argument path was not defined ');
	}
	this.path = path;
}

AdPathLayoutData.prototype.toJSON = function(){
	return '{ "path": "' + this.path + '"}';
}
