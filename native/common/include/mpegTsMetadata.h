#ifndef __MPEGTSMETADATA_H__
#define __MPEGTSMETADATA_H__

#define FILE_CHUNK_SIZE (2500 * TS_PACKET_LENGTH)

#include "mpegTsStreamInfo.h"
#include "mpegTs.h"

typedef struct {
	int pid;
	int duration;
	timestamps_t timestamps;
} media_info_t;

typedef struct {
	uint32_t chunk_count;
	uint32_t frame_count;
	uint32_t ts_header_size;
	uint32_t ts_file_size;
	media_info_t media_info[MEDIA_TYPE_COUNT];
	streams_info_t streams_info;
	/* metadata_frame_info_t frames[frame_count] */
} metadata_header_t;

typedef struct {
	uint32_t pos;
	uint32_t size;
	uint32_t duration;
	uint8_t media_type;
	timestamp_offsets_t timestamp_offsets;
} metadata_frame_info_t;

#endif // __MPEGTSMETADATA_H__
