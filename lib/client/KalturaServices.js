// ===================================================================================================
//                           _  __     _ _
//                          | |/ /__ _| | |_ _  _ _ _ __ _
//                          | ' </ _` | |  _| || | '_/ _` |
//                          |_|\_\__,_|_|\__|\_,_|_| \__,_|
//
// This file is part of the Kaltura Collaborative Media Suite which allows users
// to do with audio, video, and animation what Wiki platfroms allow them to do with
// text.
//
// Copyright (C) 2006-2011  Kaltura Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
// @ignore
// ===================================================================================================
var util = require('util');
var kaltura = require('./KalturaClientBase');

/**
 *Class definition for the Kaltura service: baseEntry.
 * The available service actions:
 * @action  get  Get base entry by ID.
 *  	 .
*/
function KalturaBaseEntryService(client){
  KalturaBaseEntryService.super_.call(this);
  this.init(client);
};

util.inherits(KalturaBaseEntryService, kaltura.KalturaServiceBase);
module.exports.KalturaBaseEntryService = KalturaBaseEntryService;

/**
 * Get base entry by ID.
 *  	 .
 * @param  entryId  string    Entry id
 (optional).
 * @param  version  int    Desired version of the data
 (optional, default: -1).
 * @return  KalturaBaseEntry.
 */
KalturaBaseEntryService.prototype.get = function(callback, entryId, version){
  if(!version)
    version = -1;
  var kparams = {};
  this.client.addParam(kparams, "entryId", entryId);
  this.client.addParam(kparams, "version", version);
  this.client.queueServiceActionCall("baseentry", "get", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

/**
 *Class definition for the Kaltura service: liveStream.
 * The available service actions:
 * @action  get  Get live stream entry by ID.
 *  	 .
 * @action  createPeriodicSyncPoints  Creates perioding metadata sync-point events on a live stream
 *  	 .
*/
function KalturaLiveStreamService(client){
  KalturaLiveStreamService.super_.call(this);
  this.init(client);
};

util.inherits(KalturaLiveStreamService, kaltura.KalturaServiceBase);
module.exports.KalturaLiveStreamService = KalturaLiveStreamService;

/**
 * Get live stream entry by ID.
 *  	 .
 * @param  entryId  string    Live stream entry id (optional).
 * @param  version  int    Desired version of the data (optional, default: -1).
 * @return  KalturaLiveStreamEntry.
 */
KalturaLiveStreamService.prototype.get = function(callback, entryId, version){
  if(!version)
    version = -1;
  var kparams = {};
  this.client.addParam(kparams, "entryId", entryId);
  this.client.addParam(kparams, "version", version);
  this.client.queueServiceActionCall("livestream", "get", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};
/**
 * Creates perioding metadata sync-point events on a live stream
 *  	 .
 * @param  entryId  string    Kaltura live-stream entry id (optional).
 * @param  interval  int    Events interval in seconds  (optional).
 * @param  duration  int    Duration in seconds (optional).
 * @return  .
 */
KalturaLiveStreamService.prototype.createPeriodicSyncPoints = function(callback, entryId, interval, duration){
  var kparams = {};
  this.client.addParam(kparams, "entryId", entryId);
  this.client.addParam(kparams, "interval", interval);
  this.client.addParam(kparams, "duration", duration);
  this.client.queueServiceActionCall("livestream", "createPeriodicSyncPoints", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

/**
 *Class definition for the Kaltura service: permission.
 * The available service actions:
 * @action list Lists permission objects that are associated with an account.
 * Blocked permissions are listed unless you use a filter to exclude them.
 * Blocked permissions are listed unless you use a filter to exclude them.
 */
function KalturaPermissionService(client){
        KalturaPermissionService.super_.call(this);
        this.init(client);
}

util.inherits(KalturaPermissionService, kaltura.KalturaServiceBase);
module.exports.KalturaPermissionService = KalturaPermissionService;

/**
 * Lists permission objects that are associated with an account.
 * Blocked permissions are listed unless you use a filter to exclude them.
 * Blocked permissions are listed unless you use a filter to exclude them.
 * @param filter KalturaPermissionFilter A filter used to exclude specific types of permissions (optional, default: null).
 * @param pager KalturaFilterPager A limit for the number of records to display on a page (optional, default: null).
 * @return KalturaPermissionListResponse.
 */
KalturaPermissionService.prototype.listAction = function(callback, filter, pager){
        if(!filter){
                filter = null;
        }
        if(!pager){
                pager = null;
        }
        var kparams = {};
        if (filter !== null){
                this.client.addParam(kparams, 'filter', kaltura.toParams(filter));
        }
        if (pager !== null){
                this.client.addParam(kparams, 'pager', kaltura.toParams(pager));
        }
        this.client.queueServiceActionCall('permission', 'list', kparams);
        if (!this.client.isMultiRequest()){
                this.client.doQueue(callback);
        }
};

/**
 *Class definition for the Kaltura service: session.
 * The available service actions:
 * @action  start  Start a session with Kaltura's server.
 *  	 The result KS is the session key that you should pass to all services that requires a ticket.
 *  	 .
*/
function KalturaSessionService(client){
  KalturaSessionService.super_.call(this);
  this.init(client);
};

util.inherits(KalturaSessionService, kaltura.KalturaServiceBase);
module.exports.KalturaSessionService = KalturaSessionService;

/**
 * Start a session with Kaltura's server.
 *  	 The result KS is the session key that you should pass to all services that requires a ticket.
 *  	 .
 * @param  secret  string    Remember to provide the correct secret according to the sessionType you want (optional).
 * @param  userId  string     (optional).
 * @param  type  int    Regular session or Admin session (optional, enum: KalturaSessionType).
 * @param  partnerId  int     (optional, default: null).
 * @param  expiry  int    KS expiry time in seconds (optional, default: 86400).
 * @param  privileges  string     (optional, default: null).
 * @return  string.
 */
KalturaSessionService.prototype.start = function(callback, secret, userId, type, partnerId, expiry, privileges){
  if(!userId)
    userId = "";
  if(!type)
    type = 0;
  if(!partnerId)
    partnerId = null;
  if(!expiry)
    expiry = 86400;
  if(!privileges)
    privileges = null;
  var kparams = {};
  this.client.addParam(kparams, "secret", secret);
  this.client.addParam(kparams, "userId", userId);
  this.client.addParam(kparams, "type", type);
  this.client.addParam(kparams, "partnerId", partnerId);
  this.client.addParam(kparams, "expiry", expiry);
  this.client.addParam(kparams, "privileges", privileges);
  this.client.queueServiceActionCall("session", "start", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

/**
 *Class definition for the Kaltura service: uiConf.
 * The available service actions:
 * @action  get  Retrieve a UIConf by id
 *  	 .
*/
function KalturaUiConfService(client){
  KalturaUiConfService.super_.call(this);
  this.init(client);
};

util.inherits(KalturaUiConfService, kaltura.KalturaServiceBase);
module.exports.KalturaUiConfService = KalturaUiConfService;

/**
 * Retrieve a UIConf by id
 *  	 .
 * @param  id  int     (optional).
 * @return  KalturaUiConf.
 */
KalturaUiConfService.prototype.get = function(callback, id){
  var kparams = {};
  this.client.addParam(kparams, "id", id);
  this.client.queueServiceActionCall("uiconf", "get", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

/**
 *Class definition for the Kaltura service: metadata.
 * The available service actions:
 * @action  list  List metadata objects by filter and pager
 *  	 .
*/
function KalturaMetadataService(client){
  KalturaMetadataService.super_.call(this);
  this.init(client);
};

util.inherits(KalturaMetadataService, kaltura.KalturaServiceBase);
module.exports.KalturaMetadataService = KalturaMetadataService;

/**
 * List metadata objects by filter and pager
 *  	 .
 * @param  filter  KalturaMetadataFilter    
 (optional, default: null).
 * @param  pager  KalturaFilterPager    
 (optional, default: null).
 * @return  KalturaMetadataListResponse.
 */
KalturaMetadataService.prototype.listAction = function(callback, filter, pager){
  if(!filter)
    filter = null;
  if(!pager)
    pager = null;
  var kparams = {};
  if (filter != null)
    this.client.addParam(kparams, "filter", kaltura.toParams(filter));
  if (pager != null)
    this.client.addParam(kparams, "pager", kaltura.toParams(pager));
  this.client.queueServiceActionCall("metadata_metadata", "list", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

/**
 *Class definition for the Kaltura service: cuePoint.
 * The available service actions:
 * @action  add  Allows you to add an cue point object associated with an entry
 *  	 .
 * @action  list  List cue point objects by filter and pager
 *  	 .
*/
function KalturaCuePointService(client){
  KalturaCuePointService.super_.call(this);
  this.init(client);
};

util.inherits(KalturaCuePointService, kaltura.KalturaServiceBase);
module.exports.KalturaCuePointService = KalturaCuePointService;

/**
 * Allows you to add an cue point object associated with an entry
 *  	 .
 * @param  cuePoint  KalturaCuePoint     (optional).
 * @return  KalturaCuePoint.
 */
KalturaCuePointService.prototype.add = function(callback, cuePoint){
  var kparams = {};
  this.client.addParam(kparams, "cuePoint", kaltura.toParams(cuePoint));
  this.client.queueServiceActionCall("cuepoint_cuepoint", "add", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};
/**
 * List cue point objects by filter and pager
 *  	 .
 * @param  filter  KalturaCuePointFilter     (optional, default: null).
 * @param  pager  KalturaFilterPager     (optional, default: null).
 * @return  KalturaCuePointListResponse.
 */
KalturaCuePointService.prototype.listAction = function(callback, filter, pager){
  if(!filter)
    filter = null;
  if(!pager)
    pager = null;
  var kparams = {};
  if (filter != null)
    this.client.addParam(kparams, "filter", kaltura.toParams(filter));
  if (pager != null)
    this.client.addParam(kparams, "pager", kaltura.toParams(pager));
  this.client.queueServiceActionCall("cuepoint_cuepoint", "list", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

