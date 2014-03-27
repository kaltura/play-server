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

var KalturaAppearInListType = module.exports.KalturaAppearInListType = {
PARTNER_ONLY : 1,
CATEGORY_MEMBERS_ONLY : 3,
};

var KalturaAssetParamsOrigin = module.exports.KalturaAssetParamsOrigin = {
CONVERT : 0,
INGEST : 1,
CONVERT_WHEN_MISSING : 2,
};

var KalturaAssetStatus = module.exports.KalturaAssetStatus = {
ERROR : -1,
QUEUED : 0,
READY : 2,
DELETED : 3,
IMPORTING : 7,
EXPORTING : 9,
};

var KalturaAttachmentAssetStatus = module.exports.KalturaAttachmentAssetStatus = {
ERROR : -1,
QUEUED : 0,
READY : 2,
DELETED : 3,
IMPORTING : 7,
EXPORTING : 9,
};

var KalturaAuditTrailContext = module.exports.KalturaAuditTrailContext = {
CLIENT : -1,
SCRIPT : 0,
PS2 : 1,
API_V3 : 2,
};

var KalturaAuditTrailStatus = module.exports.KalturaAuditTrailStatus = {
PENDING : 1,
READY : 2,
FAILED : 3,
};

var KalturaBatchJobErrorTypes = module.exports.KalturaBatchJobErrorTypes = {
APP : 0,
RUNTIME : 1,
HTTP : 2,
CURL : 3,
KALTURA_API : 4,
KALTURA_CLIENT : 5,
};

var KalturaBatchJobStatus = module.exports.KalturaBatchJobStatus = {
PENDING : 0,
QUEUED : 1,
PROCESSING : 2,
PROCESSED : 3,
MOVEFILE : 4,
FINISHED : 5,
FAILED : 6,
ABORTED : 7,
ALMOST_DONE : 8,
RETRY : 9,
FATAL : 10,
DONT_PROCESS : 11,
FINISHED_PARTIALLY : 12,
};

var KalturaCaptionAssetStatus = module.exports.KalturaCaptionAssetStatus = {
ERROR : -1,
QUEUED : 0,
READY : 2,
DELETED : 3,
IMPORTING : 7,
EXPORTING : 9,
};

var KalturaCategoryEntryStatus = module.exports.KalturaCategoryEntryStatus = {
PENDING : 1,
ACTIVE : 2,
DELETED : 3,
REJECTED : 4,
};

var KalturaCategoryStatus = module.exports.KalturaCategoryStatus = {
UPDATING : 1,
ACTIVE : 2,
DELETED : 3,
PURGED : 4,
};

var KalturaCategoryUserPermissionLevel = module.exports.KalturaCategoryUserPermissionLevel = {
MANAGER : 0,
MODERATOR : 1,
CONTRIBUTOR : 2,
MEMBER : 3,
NONE : 4,
};

var KalturaCategoryUserStatus = module.exports.KalturaCategoryUserStatus = {
ACTIVE : 1,
PENDING : 2,
NOT_ACTIVE : 3,
DELETED : 4,
};

var KalturaContributionPolicyType = module.exports.KalturaContributionPolicyType = {
ALL : 1,
MEMBERS_WITH_CONTRIBUTION_PERMISSION : 2,
};

var KalturaControlPanelCommandStatus = module.exports.KalturaControlPanelCommandStatus = {
PENDING : 1,
HANDLED : 2,
DONE : 3,
FAILED : 4,
};

var KalturaControlPanelCommandTargetType = module.exports.KalturaControlPanelCommandTargetType = {
DATA_CENTER : 1,
SCHEDULER : 2,
JOB_TYPE : 3,
JOB : 4,
BATCH : 5,
};

var KalturaControlPanelCommandType = module.exports.KalturaControlPanelCommandType = {
KILL : 4,
};

var KalturaCuePointStatus = module.exports.KalturaCuePointStatus = {
READY : 1,
DELETED : 2,
HANDLED : 3,
};

var KalturaDVRStatus = module.exports.KalturaDVRStatus = {
DISABLED : 0,
ENABLED : 1,
};

var KalturaDistributionAction = module.exports.KalturaDistributionAction = {
SUBMIT : 1,
UPDATE : 2,
DELETE : 3,
FETCH_REPORT : 4,
};

var KalturaDistributionProfileStatus = module.exports.KalturaDistributionProfileStatus = {
DISABLED : 1,
ENABLED : 2,
DELETED : 3,
};

var KalturaDocumentType = module.exports.KalturaDocumentType = {
DOCUMENT : 11,
SWF : 12,
PDF : 13,
};

var KalturaDrmPolicyStatus = module.exports.KalturaDrmPolicyStatus = {
ACTIVE : 1,
DELETED : 2,
};

var KalturaDrmProfileStatus = module.exports.KalturaDrmProfileStatus = {
ACTIVE : 1,
DELETED : 2,
};

var KalturaDropFolderFileStatus = module.exports.KalturaDropFolderFileStatus = {
UPLOADING : 1,
PENDING : 2,
WAITING : 3,
HANDLED : 4,
IGNORE : 5,
DELETED : 6,
PURGED : 7,
NO_MATCH : 8,
ERROR_HANDLING : 9,
ERROR_DELETING : 10,
DOWNLOADING : 11,
ERROR_DOWNLOADING : 12,
PROCESSING : 13,
PARSED : 14,
DETECTED : 15,
};

var KalturaDropFolderStatus = module.exports.KalturaDropFolderStatus = {
DISABLED : 0,
ENABLED : 1,
DELETED : 2,
ERROR : 3,
};

var KalturaEditorType = module.exports.KalturaEditorType = {
SIMPLE : 1,
ADVANCED : 2,
};

var KalturaEntryDistributionFlag = module.exports.KalturaEntryDistributionFlag = {
NONE : 0,
SUBMIT_REQUIRED : 1,
DELETE_REQUIRED : 2,
UPDATE_REQUIRED : 3,
ENABLE_REQUIRED : 4,
DISABLE_REQUIRED : 5,
};

var KalturaEntryDistributionStatus = module.exports.KalturaEntryDistributionStatus = {
PENDING : 0,
QUEUED : 1,
READY : 2,
DELETED : 3,
SUBMITTING : 4,
UPDATING : 5,
DELETING : 6,
ERROR_SUBMITTING : 7,
ERROR_UPDATING : 8,
ERROR_DELETING : 9,
REMOVED : 10,
IMPORT_SUBMITTING : 11,
IMPORT_UPDATING : 12,
};

var KalturaEntryDistributionSunStatus = module.exports.KalturaEntryDistributionSunStatus = {
BEFORE_SUNRISE : 1,
AFTER_SUNRISE : 2,
AFTER_SUNSET : 3,
};

var KalturaEntryModerationStatus = module.exports.KalturaEntryModerationStatus = {
PENDING_MODERATION : 1,
APPROVED : 2,
REJECTED : 3,
FLAGGED_FOR_REVIEW : 5,
AUTO_APPROVED : 6,
};

var KalturaEventNotificationTemplateStatus = module.exports.KalturaEventNotificationTemplateStatus = {
DISABLED : 1,
ACTIVE : 2,
DELETED : 3,
};

var KalturaFileSyncStatus = module.exports.KalturaFileSyncStatus = {
ERROR : -1,
PENDING : 1,
READY : 2,
DELETED : 3,
PURGED : 4,
};

var KalturaFileSyncType = module.exports.KalturaFileSyncType = {
FILE : 1,
LINK : 2,
URL : 3,
};

var KalturaFlavorAssetStatus = module.exports.KalturaFlavorAssetStatus = {
ERROR : -1,
QUEUED : 0,
CONVERTING : 1,
READY : 2,
DELETED : 3,
NOT_APPLICABLE : 4,
TEMP : 5,
WAIT_FOR_CONVERT : 6,
IMPORTING : 7,
VALIDATING : 8,
EXPORTING : 9,
};

var KalturaFlavorReadyBehaviorType = module.exports.KalturaFlavorReadyBehaviorType = {
NO_IMPACT : 0,
INHERIT_FLAVOR_PARAMS : 0,
REQUIRED : 1,
OPTIONAL : 2,
};

var KalturaGenericDistributionProviderStatus = module.exports.KalturaGenericDistributionProviderStatus = {
ACTIVE : 2,
DELETED : 3,
};

var KalturaInheritanceType = module.exports.KalturaInheritanceType = {
INHERIT : 1,
MANUAL : 2,
};

var KalturaLicenseType = module.exports.KalturaLicenseType = {
UNKNOWN : -1,
NONE : 0,
COPYRIGHTED : 1,
PUBLIC_DOMAIN : 2,
CREATIVECOMMONS_ATTRIBUTION : 3,
CREATIVECOMMONS_ATTRIBUTION_SHARE_ALIKE : 4,
CREATIVECOMMONS_ATTRIBUTION_NO_DERIVATIVES : 5,
CREATIVECOMMONS_ATTRIBUTION_NON_COMMERCIAL : 6,
CREATIVECOMMONS_ATTRIBUTION_NON_COMMERCIAL_SHARE_ALIKE : 7,
CREATIVECOMMONS_ATTRIBUTION_NON_COMMERCIAL_NO_DERIVATIVES : 8,
GFDL : 9,
GPL : 10,
AFFERO_GPL : 11,
LGPL : 12,
BSD : 13,
APACHE : 14,
MOZILLA : 15,
};

var KalturaLivePublishStatus = module.exports.KalturaLivePublishStatus = {
DISABLED : 0,
ENABLED : 1,
};

var KalturaMediaType = module.exports.KalturaMediaType = {
VIDEO : 1,
IMAGE : 2,
AUDIO : 5,
LIVE_STREAM_FLASH : 201,
LIVE_STREAM_WINDOWS_MEDIA : 202,
LIVE_STREAM_REAL_MEDIA : 203,
LIVE_STREAM_QUICKTIME : 204,
};

var KalturaMetadataProfileCreateMode = module.exports.KalturaMetadataProfileCreateMode = {
API : 1,
KMC : 2,
APP : 3,
};

var KalturaMetadataProfileStatus = module.exports.KalturaMetadataProfileStatus = {
ACTIVE : 1,
DEPRECATED : 2,
TRANSFORMING : 3,
};

var KalturaMetadataStatus = module.exports.KalturaMetadataStatus = {
VALID : 1,
INVALID : 2,
DELETED : 3,
};

var KalturaNullableBoolean = module.exports.KalturaNullableBoolean = {
NULL_VALUE : -1,
FALSE_VALUE : 0,
TRUE_VALUE : 1,
};

var KalturaPartnerGroupType = module.exports.KalturaPartnerGroupType = {
PUBLISHER : 1,
VAR_GROUP : 2,
GROUP : 3,
TEMPLATE : 4,
};

var KalturaPartnerStatus = module.exports.KalturaPartnerStatus = {
DELETED : 0,
ACTIVE : 1,
BLOCKED : 2,
FULL_BLOCK : 3,
};

var KalturaPermissionStatus = module.exports.KalturaPermissionStatus = {
ACTIVE : 1,
BLOCKED : 2,
DELETED : 3,
};

var KalturaPermissionType = module.exports.KalturaPermissionType = {
NORMAL : 1,
SPECIAL_FEATURE : 2,
PLUGIN : 3,
PARTNER_GROUP : 4,
};

var KalturaPlaylistType = module.exports.KalturaPlaylistType = {
STATIC_LIST : 3,
DYNAMIC : 10,
EXTERNAL : 101,
};

var KalturaPrivacyType = module.exports.KalturaPrivacyType = {
ALL : 1,
AUTHENTICATED_USERS : 2,
MEMBERS_ONLY : 3,
};

var KalturaRecordStatus = module.exports.KalturaRecordStatus = {
DISABLED : 0,
ENABLED : 1,
};

var KalturaSearchOperatorType = module.exports.KalturaSearchOperatorType = {
SEARCH_AND : 1,
SEARCH_OR : 2,
};

var KalturaSearchProviderType = module.exports.KalturaSearchProviderType = {
FLICKR : 3,
YOUTUBE : 4,
MYSPACE : 7,
PHOTOBUCKET : 8,
JAMENDO : 9,
CCMIXTER : 10,
NYPL : 11,
CURRENT : 12,
MEDIA_COMMONS : 13,
KALTURA : 20,
KALTURA_USER_CLIPS : 21,
ARCHIVE_ORG : 22,
KALTURA_PARTNER : 23,
METACAFE : 24,
SEARCH_PROXY : 28,
PARTNER_SPECIFIC : 100,
};

var KalturaSessionType = module.exports.KalturaSessionType = {
USER : 0,
ADMIN : 2,
};

var KalturaShortLinkStatus = module.exports.KalturaShortLinkStatus = {
DISABLED : 1,
ENABLED : 2,
DELETED : 3,
};

var KalturaStorageProfileStatus = module.exports.KalturaStorageProfileStatus = {
DISABLED : 1,
AUTOMATIC : 2,
MANUAL : 3,
};

var KalturaThumbAssetStatus = module.exports.KalturaThumbAssetStatus = {
ERROR : -1,
QUEUED : 0,
CAPTURING : 1,
READY : 2,
DELETED : 3,
IMPORTING : 7,
EXPORTING : 9,
};

var KalturaUiConfCreationMode = module.exports.KalturaUiConfCreationMode = {
WIZARD : 2,
ADVANCED : 3,
};

var KalturaUiConfObjType = module.exports.KalturaUiConfObjType = {
PLAYER : 1,
CONTRIBUTION_WIZARD : 2,
SIMPLE_EDITOR : 3,
ADVANCED_EDITOR : 4,
PLAYLIST : 5,
APP_STUDIO : 6,
KRECORD : 7,
PLAYER_V3 : 8,
KMC_ACCOUNT : 9,
KMC_ANALYTICS : 10,
KMC_CONTENT : 11,
KMC_DASHBOARD : 12,
KMC_LOGIN : 13,
PLAYER_SL : 14,
CLIENTSIDE_ENCODER : 15,
KMC_GENERAL : 16,
KMC_ROLES_AND_PERMISSIONS : 17,
CLIPPER : 18,
KSR : 19,
KUPLOAD : 20,
};

var KalturaUpdateMethodType = module.exports.KalturaUpdateMethodType = {
MANUAL : 0,
AUTOMATIC : 1,
};

var KalturaUploadTokenStatus = module.exports.KalturaUploadTokenStatus = {
PENDING : 0,
PARTIAL_UPLOAD : 1,
FULL_UPLOAD : 2,
CLOSED : 3,
TIMED_OUT : 4,
DELETED : 5,
};

var KalturaUserRoleStatus = module.exports.KalturaUserRoleStatus = {
ACTIVE : 1,
BLOCKED : 2,
DELETED : 3,
};

var KalturaUserStatus = module.exports.KalturaUserStatus = {
BLOCKED : 0,
ACTIVE : 1,
DELETED : 2,
};

var KalturaVirusScanProfileStatus = module.exports.KalturaVirusScanProfileStatus = {
DISABLED : 1,
ENABLED : 2,
DELETED : 3,
};

var KalturaAccessControlOrderBy = module.exports.KalturaAccessControlOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaAccessControlProfileOrderBy = module.exports.KalturaAccessControlProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaAdCuePointOrderBy = module.exports.KalturaAdCuePointOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_TIME_ASC : "+endTime",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
START_TIME_ASC : "+startTime",
TRIGGERED_AT_ASC : "+triggeredAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_TIME_DESC : "-endTime",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
START_TIME_DESC : "-startTime",
TRIGGERED_AT_DESC : "-triggeredAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaAdProtocolType = module.exports.KalturaAdProtocolType = {
CUSTOM : "0",
VAST : "1",
VAST_2_0 : "2",
VPAID : "3",
};

var KalturaAdType = module.exports.KalturaAdType = {
VIDEO : "1",
OVERLAY : "2",
};

var KalturaAdminUserOrderBy = module.exports.KalturaAdminUserOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
};

var KalturaAmazonS3StorageProfileOrderBy = module.exports.KalturaAmazonS3StorageProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaAnnotationOrderBy = module.exports.KalturaAnnotationOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_TIME_ASC : "+endTime",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
START_TIME_ASC : "+startTime",
TRIGGERED_AT_ASC : "+triggeredAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_TIME_DESC : "-endTime",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
START_TIME_DESC : "-startTime",
TRIGGERED_AT_DESC : "-triggeredAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaApiActionPermissionItemOrderBy = module.exports.KalturaApiActionPermissionItemOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaApiParameterPermissionItemOrderBy = module.exports.KalturaApiParameterPermissionItemOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaAssetOrderBy = module.exports.KalturaAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaAssetParamsOrderBy = module.exports.KalturaAssetParamsOrderBy = {
};

var KalturaAssetParamsOutputOrderBy = module.exports.KalturaAssetParamsOutputOrderBy = {
};

var KalturaAttachmentAssetOrderBy = module.exports.KalturaAttachmentAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaAttachmentType = module.exports.KalturaAttachmentType = {
TEXT : "1",
MEDIA : "2",
DOCUMENT : "3",
};

var KalturaAuditTrailAction = module.exports.KalturaAuditTrailAction = {
CHANGED : "CHANGED",
CONTENT_VIEWED : "CONTENT_VIEWED",
COPIED : "COPIED",
CREATED : "CREATED",
DELETED : "DELETED",
FILE_SYNC_CREATED : "FILE_SYNC_CREATED",
RELATION_ADDED : "RELATION_ADDED",
RELATION_REMOVED : "RELATION_REMOVED",
VIEWED : "VIEWED",
};

var KalturaAuditTrailObjectType = module.exports.KalturaAuditTrailObjectType = {
BATCH_JOB : "BatchJob",
EMAIL_INGESTION_PROFILE : "EmailIngestionProfile",
FILE_SYNC : "FileSync",
KSHOW_KUSER : "KshowKuser",
METADATA : "Metadata",
METADATA_PROFILE : "MetadataProfile",
PARTNER : "Partner",
PERMISSION : "Permission",
UPLOAD_TOKEN : "UploadToken",
USER_LOGIN_DATA : "UserLoginData",
USER_ROLE : "UserRole",
ACCESS_CONTROL : "accessControl",
CATEGORY : "category",
CONVERSION_PROFILE_2 : "conversionProfile2",
ENTRY : "entry",
FLAVOR_ASSET : "flavorAsset",
FLAVOR_PARAMS : "flavorParams",
FLAVOR_PARAMS_CONVERSION_PROFILE : "flavorParamsConversionProfile",
FLAVOR_PARAMS_OUTPUT : "flavorParamsOutput",
KSHOW : "kshow",
KUSER : "kuser",
MEDIA_INFO : "mediaInfo",
MODERATION : "moderation",
ROUGHCUT : "roughcutEntry",
SYNDICATION : "syndicationFeed",
THUMBNAIL_ASSET : "thumbAsset",
THUMBNAIL_PARAMS : "thumbParams",
THUMBNAIL_PARAMS_OUTPUT : "thumbParamsOutput",
UI_CONF : "uiConf",
WIDGET : "widget",
};

var KalturaAuditTrailOrderBy = module.exports.KalturaAuditTrailOrderBy = {
CREATED_AT_ASC : "+createdAt",
PARSED_AT_ASC : "+parsedAt",
CREATED_AT_DESC : "-createdAt",
PARSED_AT_DESC : "-parsedAt",
};

var KalturaBaseEntryOrderBy = module.exports.KalturaBaseEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
END_DATE_ASC : "+endDate",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
END_DATE_DESC : "-endDate",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
WEIGHT_DESC : "-weight",
};

var KalturaBaseSyndicationFeedOrderBy = module.exports.KalturaBaseSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaBatchJobOrderBy = module.exports.KalturaBatchJobOrderBy = {
CREATED_AT_ASC : "+createdAt",
ESTIMATED_EFFORT_ASC : "+estimatedEffort",
EXECUTION_ATTEMPTS_ASC : "+executionAttempts",
FINISH_TIME_ASC : "+finishTime",
LOCK_VERSION_ASC : "+lockVersion",
PRIORITY_ASC : "+priority",
QUEUE_TIME_ASC : "+queueTime",
STATUS_ASC : "+status",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ESTIMATED_EFFORT_DESC : "-estimatedEffort",
EXECUTION_ATTEMPTS_DESC : "-executionAttempts",
FINISH_TIME_DESC : "-finishTime",
LOCK_VERSION_DESC : "-lockVersion",
PRIORITY_DESC : "-priority",
QUEUE_TIME_DESC : "-queueTime",
STATUS_DESC : "-status",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaBatchJobType = module.exports.KalturaBatchJobType = {
PARSE_CAPTION_ASSET : "captionSearch.parseCaptionAsset",
DISTRIBUTION_DELETE : "contentDistribution.DistributionDelete",
DISTRIBUTION_DISABLE : "contentDistribution.DistributionDisable",
DISTRIBUTION_ENABLE : "contentDistribution.DistributionEnable",
DISTRIBUTION_FETCH_REPORT : "contentDistribution.DistributionFetchReport",
DISTRIBUTION_SUBMIT : "contentDistribution.DistributionSubmit",
DISTRIBUTION_SYNC : "contentDistribution.DistributionSync",
DISTRIBUTION_UPDATE : "contentDistribution.DistributionUpdate",
CONVERT : "0",
DROP_FOLDER_CONTENT_PROCESSOR : "dropFolder.DropFolderContentProcessor",
DROP_FOLDER_WATCHER : "dropFolder.DropFolderWatcher",
EVENT_NOTIFICATION_HANDLER : "eventNotification.EventNotificationHandler",
INDEX_TAGS : "tagSearch.IndexTagsByPrivacyContext",
TAG_RESOLVE : "tagSearch.TagResolve",
VIRUS_SCAN : "virusScan.VirusScan",
WIDEVINE_REPOSITORY_SYNC : "widevine.WidevineRepositorySync",
IMPORT : "1",
DELETE : "2",
FLATTEN : "3",
BULKUPLOAD : "4",
DVDCREATOR : "5",
DOWNLOAD : "6",
OOCONVERT : "7",
CONVERT_PROFILE : "10",
POSTCONVERT : "11",
EXTRACT_MEDIA : "14",
MAIL : "15",
NOTIFICATION : "16",
CLEANUP : "17",
SCHEDULER_HELPER : "18",
BULKDOWNLOAD : "19",
DB_CLEANUP : "20",
PROVISION_PROVIDE : "21",
CONVERT_COLLECTION : "22",
STORAGE_EXPORT : "23",
PROVISION_DELETE : "24",
STORAGE_DELETE : "25",
EMAIL_INGESTION : "26",
METADATA_IMPORT : "27",
METADATA_TRANSFORM : "28",
FILESYNC_IMPORT : "29",
CAPTURE_THUMB : "30",
DELETE_FILE : "31",
INDEX : "32",
MOVE_CATEGORY_ENTRIES : "33",
COPY : "34",
CONCAT : "35",
CONVERT_LIVE_SEGMENT : "36",
COPY_PARTNER : "37",
VALIDATE_LIVE_MEDIA_SERVERS : "38",
SYNC_CATEGORY_PRIVACY_CONTEXT : "39",
};

var KalturaBulkUploadObjectType = module.exports.KalturaBulkUploadObjectType = {
ENTRY : "1",
CATEGORY : "2",
USER : "3",
CATEGORY_USER : "4",
CATEGORY_ENTRY : "5",
};

var KalturaBulkUploadOrderBy = module.exports.KalturaBulkUploadOrderBy = {
};

var KalturaCaptionAssetOrderBy = module.exports.KalturaCaptionAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaCaptionParamsOrderBy = module.exports.KalturaCaptionParamsOrderBy = {
};

var KalturaCaptionType = module.exports.KalturaCaptionType = {
SRT : "1",
DFXP : "2",
WEBVTT : "3",
};

var KalturaCategoryEntryAdvancedOrderBy = module.exports.KalturaCategoryEntryAdvancedOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaCategoryEntryOrderBy = module.exports.KalturaCategoryEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaCategoryOrderBy = module.exports.KalturaCategoryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DEPTH_ASC : "+depth",
DIRECT_ENTRIES_COUNT_ASC : "+directEntriesCount",
DIRECT_SUB_CATEGORIES_COUNT_ASC : "+directSubCategoriesCount",
ENTRIES_COUNT_ASC : "+entriesCount",
FULL_NAME_ASC : "+fullName",
MEMBERS_COUNT_ASC : "+membersCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DEPTH_DESC : "-depth",
DIRECT_ENTRIES_COUNT_DESC : "-directEntriesCount",
DIRECT_SUB_CATEGORIES_COUNT_DESC : "-directSubCategoriesCount",
ENTRIES_COUNT_DESC : "-entriesCount",
FULL_NAME_DESC : "-fullName",
MEMBERS_COUNT_DESC : "-membersCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaCategoryUserOrderBy = module.exports.KalturaCategoryUserOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaCodeCuePointOrderBy = module.exports.KalturaCodeCuePointOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_TIME_ASC : "+endTime",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
START_TIME_ASC : "+startTime",
TRIGGERED_AT_ASC : "+triggeredAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_TIME_DESC : "-endTime",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
START_TIME_DESC : "-startTime",
TRIGGERED_AT_DESC : "-triggeredAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaConfigurableDistributionProfileOrderBy = module.exports.KalturaConfigurableDistributionProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaContainerFormat = module.exports.KalturaContainerFormat = {
_3GP : "3gp",
APPLEHTTP : "applehttp",
AVI : "avi",
BMP : "bmp",
COPY : "copy",
FLV : "flv",
HLS : "hls",
ISMV : "ismv",
JPG : "jpg",
MKV : "mkv",
MOV : "mov",
MP3 : "mp3",
MP4 : "mp4",
MPEG : "mpeg",
MPEGTS : "mpegts",
OGG : "ogg",
OGV : "ogv",
PDF : "pdf",
PNG : "png",
SWF : "swf",
WAV : "wav",
WEBM : "webm",
WMA : "wma",
WMV : "wmv",
WVM : "wvm",
};

var KalturaControlPanelCommandOrderBy = module.exports.KalturaControlPanelCommandOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaConversionProfileAssetParamsOrderBy = module.exports.KalturaConversionProfileAssetParamsOrderBy = {
};

var KalturaConversionProfileOrderBy = module.exports.KalturaConversionProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaConversionProfileStatus = module.exports.KalturaConversionProfileStatus = {
DISABLED : "1",
ENABLED : "2",
DELETED : "3",
};

var KalturaConversionProfileType = module.exports.KalturaConversionProfileType = {
MEDIA : "1",
LIVE_STREAM : "2",
};

var KalturaCuePointOrderBy = module.exports.KalturaCuePointOrderBy = {
CREATED_AT_ASC : "+createdAt",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
START_TIME_ASC : "+startTime",
TRIGGERED_AT_ASC : "+triggeredAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
START_TIME_DESC : "-startTime",
TRIGGERED_AT_DESC : "-triggeredAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaCuePointType = module.exports.KalturaCuePointType = {
AD : "adCuePoint.Ad",
ANNOTATION : "annotation.Annotation",
CODE : "codeCuePoint.Code",
};

var KalturaDataEntryOrderBy = module.exports.KalturaDataEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
END_DATE_ASC : "+endDate",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
END_DATE_DESC : "-endDate",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
WEIGHT_DESC : "-weight",
};

var KalturaDistributionProfileOrderBy = module.exports.KalturaDistributionProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaDistributionProviderOrderBy = module.exports.KalturaDistributionProviderOrderBy = {
};

var KalturaDistributionProviderType = module.exports.KalturaDistributionProviderType = {
ATT_UVERSE : "attUverseDistribution.ATT_UVERSE",
AVN : "avnDistribution.AVN",
COMCAST_MRSS : "comcastMrssDistribution.COMCAST_MRSS",
CROSS_KALTURA : "crossKalturaDistribution.CROSS_KALTURA",
DAILYMOTION : "dailymotionDistribution.DAILYMOTION",
DOUBLECLICK : "doubleClickDistribution.DOUBLECLICK",
FREEWHEEL : "freewheelDistribution.FREEWHEEL",
FREEWHEEL_GENERIC : "freewheelGenericDistribution.FREEWHEEL_GENERIC",
FTP : "ftpDistribution.FTP",
FTP_SCHEDULED : "ftpDistribution.FTP_SCHEDULED",
HULU : "huluDistribution.HULU",
IDETIC : "ideticDistribution.IDETIC",
METRO_PCS : "metroPcsDistribution.METRO_PCS",
MSN : "msnDistribution.MSN",
NDN : "ndnDistribution.NDN",
PODCAST : "podcastDistribution.PODCAST",
QUICKPLAY : "quickPlayDistribution.QUICKPLAY",
SYNACOR_HBO : "synacorHboDistribution.SYNACOR_HBO",
TIME_WARNER : "timeWarnerDistribution.TIME_WARNER",
TVCOM : "tvComDistribution.TVCOM",
UVERSE_CLICK_TO_ORDER : "uverseClickToOrderDistribution.UVERSE_CLICK_TO_ORDER",
UVERSE : "uverseDistribution.UVERSE",
VERIZON_VCAST : "verizonVcastDistribution.VERIZON_VCAST",
YAHOO : "yahooDistribution.YAHOO",
YOUTUBE : "youTubeDistribution.YOUTUBE",
YOUTUBE_API : "youtubeApiDistribution.YOUTUBE_API",
GENERIC : "1",
SYNDICATION : "2",
};

var KalturaDocumentEntryOrderBy = module.exports.KalturaDocumentEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
END_DATE_ASC : "+endDate",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
END_DATE_DESC : "-endDate",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
WEIGHT_DESC : "-weight",
};

var KalturaDocumentFlavorParamsOrderBy = module.exports.KalturaDocumentFlavorParamsOrderBy = {
};

var KalturaDocumentFlavorParamsOutputOrderBy = module.exports.KalturaDocumentFlavorParamsOutputOrderBy = {
};

var KalturaDrmDeviceOrderBy = module.exports.KalturaDrmDeviceOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaDrmLicenseScenario = module.exports.KalturaDrmLicenseScenario = {
};

var KalturaDrmPolicyOrderBy = module.exports.KalturaDrmPolicyOrderBy = {
};

var KalturaDrmProfileOrderBy = module.exports.KalturaDrmProfileOrderBy = {
ID_ASC : "+id",
NAME_ASC : "+name",
ID_DESC : "-id",
NAME_DESC : "-name",
};

var KalturaDrmProviderType = module.exports.KalturaDrmProviderType = {
WIDEVINE : "widevine.WIDEVINE",
};

var KalturaDropFolderErrorCode = module.exports.KalturaDropFolderErrorCode = {
ERROR_CONNECT : "1",
ERROR_AUTENTICATE : "2",
ERROR_GET_PHISICAL_FILE_LIST : "3",
ERROR_GET_DB_FILE_LIST : "4",
DROP_FOLDER_APP_ERROR : "5",
CONTENT_MATCH_POLICY_UNDEFINED : "6",
};

var KalturaDropFolderFileErrorCode = module.exports.KalturaDropFolderFileErrorCode = {
ERROR_ADDING_BULK_UPLOAD : "dropFolderXmlBulkUpload.ERROR_ADDING_BULK_UPLOAD",
ERROR_ADD_CONTENT_RESOURCE : "dropFolderXmlBulkUpload.ERROR_ADD_CONTENT_RESOURCE",
ERROR_IN_BULK_UPLOAD : "dropFolderXmlBulkUpload.ERROR_IN_BULK_UPLOAD",
ERROR_WRITING_TEMP_FILE : "dropFolderXmlBulkUpload.ERROR_WRITING_TEMP_FILE",
LOCAL_FILE_WRONG_CHECKSUM : "dropFolderXmlBulkUpload.LOCAL_FILE_WRONG_CHECKSUM",
LOCAL_FILE_WRONG_SIZE : "dropFolderXmlBulkUpload.LOCAL_FILE_WRONG_SIZE",
MALFORMED_XML_FILE : "dropFolderXmlBulkUpload.MALFORMED_XML_FILE",
XML_FILE_SIZE_EXCEED_LIMIT : "dropFolderXmlBulkUpload.XML_FILE_SIZE_EXCEED_LIMIT",
ERROR_UPDATE_ENTRY : "1",
ERROR_ADD_ENTRY : "2",
FLAVOR_NOT_FOUND : "3",
FLAVOR_MISSING_IN_FILE_NAME : "4",
SLUG_REGEX_NO_MATCH : "5",
ERROR_READING_FILE : "6",
ERROR_DOWNLOADING_FILE : "7",
ERROR_UPDATE_FILE : "8",
ERROR_ADDING_CONTENT_PROCESSOR : "10",
ERROR_IN_CONTENT_PROCESSOR : "11",
ERROR_DELETING_FILE : "12",
FILE_NO_MATCH : "13",
};

var KalturaDropFolderFileHandlerType = module.exports.KalturaDropFolderFileHandlerType = {
XML : "dropFolderXmlBulkUpload.XML",
CONTENT : "1",
};

var KalturaDropFolderFileOrderBy = module.exports.KalturaDropFolderFileOrderBy = {
CREATED_AT_ASC : "+createdAt",
FILE_NAME_ASC : "+fileName",
FILE_SIZE_ASC : "+fileSize",
FILE_SIZE_LAST_SET_AT_ASC : "+fileSizeLastSetAt",
ID_ASC : "+id",
PARSED_FLAVOR_ASC : "+parsedFlavor",
PARSED_SLUG_ASC : "+parsedSlug",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
FILE_NAME_DESC : "-fileName",
FILE_SIZE_DESC : "-fileSize",
FILE_SIZE_LAST_SET_AT_DESC : "-fileSizeLastSetAt",
ID_DESC : "-id",
PARSED_FLAVOR_DESC : "-parsedFlavor",
PARSED_SLUG_DESC : "-parsedSlug",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaDropFolderOrderBy = module.exports.KalturaDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaDropFolderType = module.exports.KalturaDropFolderType = {
WEBEX : "WebexDropFolder.WEBEX",
LOCAL : "1",
FTP : "2",
SCP : "3",
SFTP : "4",
S3 : "6",
};

var KalturaDurationType = module.exports.KalturaDurationType = {
LONG : "long",
MEDIUM : "medium",
NOT_AVAILABLE : "notavailable",
SHORT : "short",
};

var KalturaDynamicEnum = module.exports.KalturaDynamicEnum = {
};

var KalturaEmailNotificationTemplateOrderBy = module.exports.KalturaEmailNotificationTemplateOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaEntryAttendeeOrderBy = module.exports.KalturaEntryAttendeeOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaEntryAttendeeStatus = module.exports.KalturaEntryAttendeeStatus = {
PENDING : "1",
DELETED : "3",
};

var KalturaEntryDistributionOrderBy = module.exports.KalturaEntryDistributionOrderBy = {
CREATED_AT_ASC : "+createdAt",
SUBMITTED_AT_ASC : "+submittedAt",
SUNRISE_ASC : "+sunrise",
SUNSET_ASC : "+sunset",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
SUBMITTED_AT_DESC : "-submittedAt",
SUNRISE_DESC : "-sunrise",
SUNSET_DESC : "-sunset",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaEntryReplacementStatus = module.exports.KalturaEntryReplacementStatus = {
NONE : "0",
APPROVED_BUT_NOT_READY : "1",
READY_BUT_NOT_APPROVED : "2",
NOT_READY_AND_NOT_APPROVED : "3",
};

var KalturaEntryStatus = module.exports.KalturaEntryStatus = {
ERROR_IMPORTING : "-2",
ERROR_CONVERTING : "-1",
SCAN_FAILURE : "virusScan.ScanFailure",
IMPORT : "0",
INFECTED : "virusScan.Infected",
PRECONVERT : "1",
READY : "2",
DELETED : "3",
PENDING : "4",
MODERATE : "5",
BLOCKED : "6",
NO_CONTENT : "7",
};

var KalturaEntryType = module.exports.KalturaEntryType = {
AUTOMATIC : "-1",
EXTERNAL_MEDIA : "externalMedia.externalMedia",
MEDIA_CLIP : "1",
MIX : "2",
PLAYLIST : "5",
DATA : "6",
LIVE_STREAM : "7",
LIVE_CHANNEL : "8",
DOCUMENT : "10",
};

var KalturaEventNotificationTemplateOrderBy = module.exports.KalturaEventNotificationTemplateOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaEventNotificationTemplateType = module.exports.KalturaEventNotificationTemplateType = {
EMAIL : "emailNotification.Email",
HTTP : "httpNotification.Http",
};

var KalturaExternalMediaEntryOrderBy = module.exports.KalturaExternalMediaEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MEDIA_TYPE_ASC : "+mediaType",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MEDIA_TYPE_DESC : "-mediaType",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaExternalMediaSourceType = module.exports.KalturaExternalMediaSourceType = {
INTERCALL : "InterCall",
YOUTUBE : "YouTube",
};

var KalturaFileAssetObjectType = module.exports.KalturaFileAssetObjectType = {
UI_CONF : "2",
};

var KalturaFileAssetOrderBy = module.exports.KalturaFileAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaFileAssetStatus = module.exports.KalturaFileAssetStatus = {
PENDING : "0",
UPLOADING : "1",
READY : "2",
DELETED : "3",
ERROR : "4",
};

var KalturaFileSyncObjectType = module.exports.KalturaFileSyncObjectType = {
DISTRIBUTION_PROFILE : "contentDistribution.DistributionProfile",
ENTRY_DISTRIBUTION : "contentDistribution.EntryDistribution",
GENERIC_DISTRIBUTION_ACTION : "contentDistribution.GenericDistributionAction",
EMAIL_NOTIFICATION_TEMPLATE : "emailNotification.EmailNotificationTemplate",
HTTP_NOTIFICATION_TEMPLATE : "httpNotification.HttpNotificationTemplate",
ENTRY : "1",
UICONF : "2",
BATCHJOB : "3",
ASSET : "4",
FLAVOR_ASSET : "4",
METADATA : "5",
METADATA_PROFILE : "6",
SYNDICATION_FEED : "7",
CONVERSION_PROFILE : "8",
FILE_ASSET : "9",
};

var KalturaFileSyncOrderBy = module.exports.KalturaFileSyncOrderBy = {
CREATED_AT_ASC : "+createdAt",
FILE_SIZE_ASC : "+fileSize",
READY_AT_ASC : "+readyAt",
SYNC_TIME_ASC : "+syncTime",
UPDATED_AT_ASC : "+updatedAt",
VERSION_ASC : "+version",
CREATED_AT_DESC : "-createdAt",
FILE_SIZE_DESC : "-fileSize",
READY_AT_DESC : "-readyAt",
SYNC_TIME_DESC : "-syncTime",
UPDATED_AT_DESC : "-updatedAt",
VERSION_DESC : "-version",
};

var KalturaFlavorAssetOrderBy = module.exports.KalturaFlavorAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaFlavorParamsOrderBy = module.exports.KalturaFlavorParamsOrderBy = {
};

var KalturaFlavorParamsOutputOrderBy = module.exports.KalturaFlavorParamsOutputOrderBy = {
};

var KalturaFtpDropFolderOrderBy = module.exports.KalturaFtpDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaGenericDistributionProfileOrderBy = module.exports.KalturaGenericDistributionProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaGenericDistributionProviderActionOrderBy = module.exports.KalturaGenericDistributionProviderActionOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaGenericDistributionProviderOrderBy = module.exports.KalturaGenericDistributionProviderOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaGenericSyndicationFeedOrderBy = module.exports.KalturaGenericSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaGenericXsltSyndicationFeedOrderBy = module.exports.KalturaGenericXsltSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaGoogleVideoSyndicationFeedOrderBy = module.exports.KalturaGoogleVideoSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaHttpNotificationTemplateOrderBy = module.exports.KalturaHttpNotificationTemplateOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaITunesSyndicationFeedOrderBy = module.exports.KalturaITunesSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaImageFlavorParamsOrderBy = module.exports.KalturaImageFlavorParamsOrderBy = {
};

var KalturaImageFlavorParamsOutputOrderBy = module.exports.KalturaImageFlavorParamsOutputOrderBy = {
};

var KalturaKontikiStorageProfileOrderBy = module.exports.KalturaKontikiStorageProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaLanguage = module.exports.KalturaLanguage = {
AB : "Abkhazian",
AA : "Afar",
AF : "Afrikaans",
SQ : "Albanian",
AM : "Amharic",
AR : "Arabic",
HY : "Armenian",
AS_ : "Assamese",
AY : "Aymara",
AZ : "Azerbaijani",
BA : "Bashkir",
EU : "Basque",
BN : "Bengali (Bangla)",
DZ : "Bhutani",
BH : "Bihari",
BI : "Bislama",
BR : "Breton",
BG : "Bulgarian",
MY : "Burmese",
BE : "Byelorussian (Belarusian)",
KM : "Cambodian",
CA : "Catalan",
ZH : "Chinese",
CO : "Corsican",
HR : "Croatian",
CS : "Czech",
DA : "Danish",
NL : "Dutch",
EN : "English",
EO : "Esperanto",
ET : "Estonian",
FO : "Faeroese",
FA : "Farsi",
FJ : "Fiji",
FI : "Finnish",
FR : "French",
FY : "Frisian",
GV : "Gaelic (Manx)",
GD : "Gaelic (Scottish)",
GL : "Galician",
KA : "Georgian",
DE : "German",
EL : "Greek",
KL : "Greenlandic",
GN : "Guarani",
GU : "Gujarati",
HA : "Hausa",
IW : "Hebrew",
HE : "Hebrew",
HI : "Hindi",
HU : "Hungarian",
IS : "Icelandic",
IN : "Indonesian",
ID : "Indonesian",
IA : "Interlingua",
IE : "Interlingue",
IU : "Inuktitut",
IK : "Inupiak",
GA : "Irish",
IT : "Italian",
JA : "Japanese",
JV : "Javanese",
KN : "Kannada",
KS : "Kashmiri",
KK : "Kazakh",
RW : "Kinyarwanda (Ruanda)",
KY : "Kirghiz",
RN : "Kirundi (Rundi)",
KO : "Korean",
KU : "Kurdish",
LO : "Laothian",
LA : "Latin",
LV : "Latvian (Lettish)",
LI : "Limburgish ( Limburger)",
LN : "Lingala",
LT : "Lithuanian",
MK : "Macedonian",
MG : "Malagasy",
MS : "Malay",
ML : "Malayalam",
MT : "Maltese",
MI : "Maori",
MR : "Marathi",
MO : "Moldavian",
MN : "Mongolian",
NA : "Nauru",
NE : "Nepali",
NO : "Norwegian",
OC : "Occitan",
OR_ : "Oriya",
OM : "Oromo (Afan, Galla)",
PS : "Pashto (Pushto)",
PL : "Polish",
PT : "Portuguese",
PA : "Punjabi",
QU : "Quechua",
RM : "Rhaeto-Romance",
RO : "Romanian",
RU : "Russian",
SM : "Samoan",
SG : "Sangro",
SA : "Sanskrit",
SR : "Serbian",
SH : "Serbo-Croatian",
ST : "Sesotho",
TN : "Setswana",
SN : "Shona",
SD : "Sindhi",
SI : "Sinhalese",
SS : "Siswati",
SK : "Slovak",
SL : "Slovenian",
SO : "Somali",
ES : "Spanish",
SU : "Sundanese",
SW : "Swahili (Kiswahili)",
SV : "Swedish",
TL : "Tagalog",
TG : "Tajik",
TA : "Tamil",
TT : "Tatar",
TE : "Telugu",
TH : "Thai",
BO : "Tibetan",
TI : "Tigrinya",
TO : "Tonga",
TS : "Tsonga",
TR : "Turkish",
TK : "Turkmen",
TW : "Twi",
UG : "Uighur",
UK : "Ukrainian",
UR : "Urdu",
UZ : "Uzbek",
VI : "Vietnamese",
VO : "Volapuk",
CY : "Welsh",
WO : "Wolof",
XH : "Xhosa",
YI : "Yiddish",
JI : "Yiddish",
YO : "Yoruba",
ZU : "Zulu",
};

var KalturaLiveAssetOrderBy = module.exports.KalturaLiveAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaLiveChannelOrderBy = module.exports.KalturaLiveChannelOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MEDIA_TYPE_ASC : "+mediaType",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MEDIA_TYPE_DESC : "-mediaType",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaLiveChannelSegmentOrderBy = module.exports.KalturaLiveChannelSegmentOrderBy = {
CREATED_AT_ASC : "+createdAt",
START_TIME_ASC : "+startTime",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
START_TIME_DESC : "-startTime",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaLiveChannelSegmentStatus = module.exports.KalturaLiveChannelSegmentStatus = {
ACTIVE : "2",
DELETED : "3",
};

var KalturaLiveEntryOrderBy = module.exports.KalturaLiveEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MEDIA_TYPE_ASC : "+mediaType",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MEDIA_TYPE_DESC : "-mediaType",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaLiveParamsOrderBy = module.exports.KalturaLiveParamsOrderBy = {
};

var KalturaLiveStreamAdminEntryOrderBy = module.exports.KalturaLiveStreamAdminEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MEDIA_TYPE_ASC : "+mediaType",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MEDIA_TYPE_DESC : "-mediaType",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaLiveStreamEntryOrderBy = module.exports.KalturaLiveStreamEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MEDIA_TYPE_ASC : "+mediaType",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MEDIA_TYPE_DESC : "-mediaType",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaMediaEntryOrderBy = module.exports.KalturaMediaEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MEDIA_TYPE_ASC : "+mediaType",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MEDIA_TYPE_DESC : "-mediaType",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaMediaFlavorParamsOrderBy = module.exports.KalturaMediaFlavorParamsOrderBy = {
};

var KalturaMediaFlavorParamsOutputOrderBy = module.exports.KalturaMediaFlavorParamsOutputOrderBy = {
};

var KalturaMediaInfoOrderBy = module.exports.KalturaMediaInfoOrderBy = {
};

var KalturaMediaServerOrderBy = module.exports.KalturaMediaServerOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaMetadataObjectType = module.exports.KalturaMetadataObjectType = {
AD_CUE_POINT : "adCuePointMetadata.AdCuePoint",
ANNOTATION : "annotationMetadata.Annotation",
CODE_CUE_POINT : "codeCuePointMetadata.CodeCuePoint",
ENTRY : "1",
CATEGORY : "2",
USER : "3",
PARTNER : "4",
};

var KalturaMetadataOrderBy = module.exports.KalturaMetadataOrderBy = {
CREATED_AT_ASC : "+createdAt",
METADATA_PROFILE_VERSION_ASC : "+metadataProfileVersion",
UPDATED_AT_ASC : "+updatedAt",
VERSION_ASC : "+version",
CREATED_AT_DESC : "-createdAt",
METADATA_PROFILE_VERSION_DESC : "-metadataProfileVersion",
UPDATED_AT_DESC : "-updatedAt",
VERSION_DESC : "-version",
};

var KalturaMetadataProfileOrderBy = module.exports.KalturaMetadataProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaMixEntryOrderBy = module.exports.KalturaMixEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaPartnerOrderBy = module.exports.KalturaPartnerOrderBy = {
ADMIN_EMAIL_ASC : "+adminEmail",
ADMIN_NAME_ASC : "+adminName",
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
STATUS_ASC : "+status",
WEBSITE_ASC : "+website",
ADMIN_EMAIL_DESC : "-adminEmail",
ADMIN_NAME_DESC : "-adminName",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
STATUS_DESC : "-status",
WEBSITE_DESC : "-website",
};

var KalturaPdfFlavorParamsOrderBy = module.exports.KalturaPdfFlavorParamsOrderBy = {
};

var KalturaPdfFlavorParamsOutputOrderBy = module.exports.KalturaPdfFlavorParamsOutputOrderBy = {
};

var KalturaPermissionItemOrderBy = module.exports.KalturaPermissionItemOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaPermissionItemType = module.exports.KalturaPermissionItemType = {
API_ACTION_ITEM : "kApiActionPermissionItem",
API_PARAMETER_ITEM : "kApiParameterPermissionItem",
};

var KalturaPermissionOrderBy = module.exports.KalturaPermissionOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaPlayableEntryOrderBy = module.exports.KalturaPlayableEntryOrderBy = {
CREATED_AT_ASC : "+createdAt",
DURATION_ASC : "+duration",
END_DATE_ASC : "+endDate",
LAST_PLAYED_AT_ASC : "+lastPlayedAt",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
PLAYS_ASC : "+plays",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
VIEWS_ASC : "+views",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
DURATION_DESC : "-duration",
END_DATE_DESC : "-endDate",
LAST_PLAYED_AT_DESC : "-lastPlayedAt",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
PLAYS_DESC : "-plays",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
VIEWS_DESC : "-views",
WEIGHT_DESC : "-weight",
};

var KalturaPlaybackProtocol = module.exports.KalturaPlaybackProtocol = {
APPLE_HTTP : "applehttp",
AUTO : "auto",
AKAMAI_HD : "hdnetwork",
AKAMAI_HDS : "hdnetworkmanifest",
HDS : "hds",
HLS : "hls",
HTTP : "http",
MPEG_DASH : "mpegdash",
MULTICAST_SL : "multicast_silverlight",
RTMP : "rtmp",
RTSP : "rtsp",
SILVER_LIGHT : "sl",
};

var KalturaPlaylistOrderBy = module.exports.KalturaPlaylistOrderBy = {
CREATED_AT_ASC : "+createdAt",
END_DATE_ASC : "+endDate",
MODERATION_COUNT_ASC : "+moderationCount",
NAME_ASC : "+name",
PARTNER_SORT_VALUE_ASC : "+partnerSortValue",
RANK_ASC : "+rank",
RECENT_ASC : "+recent",
START_DATE_ASC : "+startDate",
TOTAL_RANK_ASC : "+totalRank",
UPDATED_AT_ASC : "+updatedAt",
WEIGHT_ASC : "+weight",
CREATED_AT_DESC : "-createdAt",
END_DATE_DESC : "-endDate",
MODERATION_COUNT_DESC : "-moderationCount",
NAME_DESC : "-name",
PARTNER_SORT_VALUE_DESC : "-partnerSortValue",
RANK_DESC : "-rank",
RECENT_DESC : "-recent",
START_DATE_DESC : "-startDate",
TOTAL_RANK_DESC : "-totalRank",
UPDATED_AT_DESC : "-updatedAt",
WEIGHT_DESC : "-weight",
};

var KalturaRemoteDropFolderOrderBy = module.exports.KalturaRemoteDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaReportOrderBy = module.exports.KalturaReportOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaScpDropFolderOrderBy = module.exports.KalturaScpDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaSearchConditionComparison = module.exports.KalturaSearchConditionComparison = {
EQUAL : "1",
GREATER_THAN : "2",
GREATER_THAN_OR_EQUAL : "3",
LESS_THAN : "4",
LESS_THAN_OR_EQUAL : "5",
};

var KalturaSftpDropFolderOrderBy = module.exports.KalturaSftpDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaShortLinkOrderBy = module.exports.KalturaShortLinkOrderBy = {
CREATED_AT_ASC : "+createdAt",
EXPIRES_AT_ASC : "+expiresAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
EXPIRES_AT_DESC : "-expiresAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaSourceType = module.exports.KalturaSourceType = {
LIMELIGHT_LIVE : "limeLight.LIVE_STREAM",
VELOCIX_LIVE : "velocix.VELOCIX_LIVE",
FILE : "1",
WEBCAM : "2",
URL : "5",
SEARCH_PROVIDER : "6",
AKAMAI_LIVE : "29",
MANUAL_LIVE_STREAM : "30",
AKAMAI_UNIVERSAL_LIVE : "31",
LIVE_STREAM : "32",
LIVE_CHANNEL : "33",
RECORDED_LIVE : "34",
CLIP : "35",
};

var KalturaSshDropFolderOrderBy = module.exports.KalturaSshDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaStorageProfileOrderBy = module.exports.KalturaStorageProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaStorageProfileProtocol = module.exports.KalturaStorageProfileProtocol = {
KONTIKI : "kontiki.KONTIKI",
KALTURA_DC : "0",
FTP : "1",
SCP : "2",
SFTP : "3",
S3 : "6",
LOCAL : "7",
};

var KalturaSwfFlavorParamsOrderBy = module.exports.KalturaSwfFlavorParamsOrderBy = {
};

var KalturaSwfFlavorParamsOutputOrderBy = module.exports.KalturaSwfFlavorParamsOutputOrderBy = {
};

var KalturaSyndicationDistributionProfileOrderBy = module.exports.KalturaSyndicationDistributionProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaSyndicationDistributionProviderOrderBy = module.exports.KalturaSyndicationDistributionProviderOrderBy = {
};

var KalturaTaggedObjectType = module.exports.KalturaTaggedObjectType = {
ENTRY : "1",
CATEGORY : "2",
};

var KalturaThumbAssetOrderBy = module.exports.KalturaThumbAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaThumbParamsOrderBy = module.exports.KalturaThumbParamsOrderBy = {
};

var KalturaThumbParamsOutputOrderBy = module.exports.KalturaThumbParamsOutputOrderBy = {
};

var KalturaTubeMogulSyndicationFeedOrderBy = module.exports.KalturaTubeMogulSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaUiConfAdminOrderBy = module.exports.KalturaUiConfAdminOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaUiConfOrderBy = module.exports.KalturaUiConfOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaUploadTokenOrderBy = module.exports.KalturaUploadTokenOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaUserLoginDataOrderBy = module.exports.KalturaUserLoginDataOrderBy = {
};

var KalturaUserOrderBy = module.exports.KalturaUserOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
};

var KalturaUserRoleOrderBy = module.exports.KalturaUserRoleOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaVirusScanEngineType = module.exports.KalturaVirusScanEngineType = {
CLAMAV_SCAN_ENGINE : "clamAVScanEngine.ClamAV",
SYMANTEC_SCAN_DIRECT_ENGINE : "symantecScanEngine.SymantecScanDirectEngine",
SYMANTEC_SCAN_ENGINE : "symantecScanEngine.SymantecScanEngine",
SYMANTEC_SCAN_JAVA_ENGINE : "symantecScanEngine.SymantecScanJavaEngine",
};

var KalturaVirusScanProfileOrderBy = module.exports.KalturaVirusScanProfileOrderBy = {
CREATED_AT_ASC : "+createdAt",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaWebexDropFolderFileOrderBy = module.exports.KalturaWebexDropFolderFileOrderBy = {
CREATED_AT_ASC : "+createdAt",
FILE_NAME_ASC : "+fileName",
FILE_SIZE_ASC : "+fileSize",
FILE_SIZE_LAST_SET_AT_ASC : "+fileSizeLastSetAt",
ID_ASC : "+id",
PARSED_FLAVOR_ASC : "+parsedFlavor",
PARSED_SLUG_ASC : "+parsedSlug",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
FILE_NAME_DESC : "-fileName",
FILE_SIZE_DESC : "-fileSize",
FILE_SIZE_LAST_SET_AT_DESC : "-fileSizeLastSetAt",
ID_DESC : "-id",
PARSED_FLAVOR_DESC : "-parsedFlavor",
PARSED_SLUG_DESC : "-parsedSlug",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaWebexDropFolderOrderBy = module.exports.KalturaWebexDropFolderOrderBy = {
CREATED_AT_ASC : "+createdAt",
ID_ASC : "+id",
NAME_ASC : "+name",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
ID_DESC : "-id",
NAME_DESC : "-name",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaWidevineFlavorAssetOrderBy = module.exports.KalturaWidevineFlavorAssetOrderBy = {
CREATED_AT_ASC : "+createdAt",
DELETED_AT_ASC : "+deletedAt",
SIZE_ASC : "+size",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
DELETED_AT_DESC : "-deletedAt",
SIZE_DESC : "-size",
UPDATED_AT_DESC : "-updatedAt",
};

var KalturaWidevineFlavorParamsOrderBy = module.exports.KalturaWidevineFlavorParamsOrderBy = {
};

var KalturaWidevineFlavorParamsOutputOrderBy = module.exports.KalturaWidevineFlavorParamsOutputOrderBy = {
};

var KalturaWidevineProfileOrderBy = module.exports.KalturaWidevineProfileOrderBy = {
ID_ASC : "+id",
NAME_ASC : "+name",
ID_DESC : "-id",
NAME_DESC : "-name",
};

var KalturaWidgetOrderBy = module.exports.KalturaWidgetOrderBy = {
CREATED_AT_ASC : "+createdAt",
CREATED_AT_DESC : "-createdAt",
};

var KalturaYahooSyndicationFeedOrderBy = module.exports.KalturaYahooSyndicationFeedOrderBy = {
CREATED_AT_ASC : "+createdAt",
NAME_ASC : "+name",
PLAYLIST_ID_ASC : "+playlistId",
TYPE_ASC : "+type",
UPDATED_AT_ASC : "+updatedAt",
CREATED_AT_DESC : "-createdAt",
NAME_DESC : "-name",
PLAYLIST_ID_DESC : "-playlistId",
TYPE_DESC : "-type",
UPDATED_AT_DESC : "-updatedAt",
};
