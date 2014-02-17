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
 *Class definition for the Kaltura service: cuePoint.
 * The available service actions:
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
  this.client.queueServiceActionCall("cuePoint", "list", kparams);
  if (!this.client.isMultiRequest())
    this.client.doQueue(callback);
};

