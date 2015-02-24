#ifndef __MPEGTSMETADATA_H__
#define __MPEGTSMETADATA_H__

// includes
#include "mpegTsStreamInfo.h"
#include "mpegTs.h"

// typedefs
typedef struct {
	int32_t duration;
	int16_t pid;
	uint16_t padding;
	timestamps_t timestamps;
} media_info_t;

typedef struct {
	uint32_t data_size;
	uint32_t frame_count;
	uint32_t ts_header_size;
	int16_t pcr_pid;
	uint16_t padding;
	media_info_t media_info[MEDIA_TYPE_COUNT];
	streams_info_t streams_info;
	/* metadata_frame_info_t frames[frame_count] */
} metadata_header_t;

typedef struct {
	uint32_t pos;
	uint32_t size;
	uint32_t duration;
	uint16_t src_pid;
	uint8_t media_type;
	timestamp_offsets_t timestamp_offsets;
	uint8_t is_iframe;
	uint8_t padding;
} metadata_frame_info_t;

#endif // __MPEGTSMETADATA_H__
