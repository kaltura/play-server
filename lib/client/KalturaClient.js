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
/**
 * The Kaltura Client - this is the facade through which all service actions should be called.
 * @param config the Kaltura configuration object holding partner credentials (type: KalturaConfiguration).
 */
var util = require('util');
var kaltura = require('./KalturaClientBase');
kaltura.objects = require('./KalturaVO');
kaltura.services = require('./KalturaServices');
kaltura.enums = require('./KalturaTypes');

function KalturaClient(config) {
  this.init(config);
};

module.exports = kaltura;
module.exports.KalturaClient = KalturaClient;

util.inherits(KalturaClient, kaltura.KalturaClientBase);
KalturaClient.prototype.apiVersion = "3.1.6";

/**
 * Base Entry Service
 *   
 * @param kaltura.services.KalturaBaseEntryService
 */
KalturaClient.prototype.baseEntry = null;
/**
 * Retrieve information and invoke actions on Flavor Asset
 * @param kaltura.services.KalturaFlavorAssetService
 */
KalturaClient.prototype.flavorAsset = null;
/**
 * Permission service lets you create and manage user permissions
 * @param kaltura.services.KalturaPermissionService
 */
KalturaClient.prototype.permission = null;
/**
 * Session service
 *   
 * @param kaltura.services.KalturaSessionService
 */
KalturaClient.prototype.session = null;
/**
 * UiConf service lets you create and manage your UIConfs for the various flash components
 *   This service is used by the KMC-ApplicationStudio
 *   
 * @param kaltura.services.KalturaUiConfService
 */
KalturaClient.prototype.uiConf = null;
/**
 * Metadata service
 *   
 * @param kaltura.services.KalturaMetadataService
 */
KalturaClient.prototype.metadata = null;
/**
 * Cue Point service
 *   
 * @param kaltura.services.KalturaCuePointService
 */
KalturaClient.prototype.cuePoint = null;
/**
 * The client constructor.
 * @param config the Kaltura configuration object holding partner credentials (type: KalturaConfiguration).
 */
KalturaClient.prototype.init = function(config){
	//call the super constructor:
	kaltura.KalturaClientBase.prototype.init.apply(this, arguments);
	//initialize client services:
	this.baseEntry = new kaltura.services.KalturaBaseEntryService(this);
	this.flavorAsset = new kaltura.services.KalturaFlavorAssetService(this);
	this.permission = new kaltura.services.KalturaPermissionService(this);
	this.session = new kaltura.services.KalturaSessionService(this);
	this.uiConf = new kaltura.services.KalturaUiConfService(this);
	this.metadata = new kaltura.services.KalturaMetadataService(this);
	this.cuePoint = new kaltura.services.KalturaCuePointService(this);
};
