#ifndef __TS_PREPARER_IMPL_H__
#define __TS_PREPARER_IMPL_H__

// includes
#include "dynamicBuffer.h"
#include "mpegTs.h"

// constants
#define BUFFER_FLAG_FIXED_TIMESTAMPS		(0x01)
#define BUFFER_FLAG_TIMESTAMPS_REF_START	(0x02)
#define BUFFER_FLAG_TIMESTAMPS_REF_END		(0x04)
#define BUFFER_FLAG_UPDATE_CCS				(0x08)
#define BUFFER_FLAG_TS_HEADER				(0x10)
#define BUFFER_FLAG_FILTER_MEDIA_STREAMS	(0x20)

// typedefs
typedef struct {
	dynamic_buffer_t* buffers;
	int buffer_count;
	frame_info_t* frames;
	int frame_count;
	int32_t frames_pos_shift;		// the offset between frames[x].pos and the data buffers
	int flags;					// BUFFER_FLAG_XX
} ts_preparer_part_t;

typedef struct {
	int left_iframe_index;
	int right_iframe_index;
	uint32_t left_iframe_pos;
	uint32_t right_iframe_pos;
	uint32_t left_iframe_offset;
	uint32_t right_iframe_offset;	
} bounding_iframes_t;

// functions
#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

bool_t get_cut_details(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	char* frames_text,
	size_t frames_text_size,
	int32_t cut_offset,
	bool_t left_portion, 
	bounding_iframes_t* bounding_iframes, 
	frame_info_t** original_frames,
	int* original_frames_count);

bool_t find_last_pat_pmt_packets(byte_t* data, size_t size, byte_t** last_pat_packet, byte_t** last_pmt_packet);

bool_t prepare_ts_data(
	ts_preparer_part_t* parts_start,
	size_t parts_count,
	dynamic_buffer_t* output_metadata, 
	dynamic_buffer_t* output_header, 
	dynamic_buffer_t* output_data);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __TS_PREPARER_IMPL_H__
