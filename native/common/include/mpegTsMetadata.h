#ifndef __MPEGTSMETADATA_H__
#define __MPEGTSMETADATA_H__

#define FILE_CHUNK_SIZE (2500 * TS_PACKET_LENGTH)

#include "mpegTs.h"

typedef struct {
	uint32_t chunk_count;
	uint32_t frame_count;
	uint32_t ts_header_size;
	uint32_t ts_file_size;
	int audio_pid;
	int video_pid;
	int durations[MEDIA_TYPE_COUNT];
	timestamps_t timestamps[MEDIA_TYPE_COUNT];
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
