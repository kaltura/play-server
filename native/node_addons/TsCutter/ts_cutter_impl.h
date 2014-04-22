#ifndef __TS_CUTTER_IMPL_H__
#define __TS_CUTTER_IMPL_H__

#include "dynamicBuffer.h"
#include "ffprobe.h"
#include "mpegTs.h"

typedef struct {
	frame_info_t* left_iframe;
	frame_info_t* right_iframe;
	int left_iframe_offset;
	int right_iframe_offset;	
} bounding_iframes_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

bool_t get_cut_details(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	char* frames_text,
	int frames_text_size,
	int cut_offset,
	bool_t left_portion, 
	bounding_iframes_t* bounding_iframes, 
	timestamps_t* reference_timestamps);

bool_t fix_timestamps(
	byte_t* source_buf,
	size_t source_size,
	char* frames_text,
	int frames_text_size,
	timestamps_t* reference_timestamps,
	bool_t left_portion);

bool_t find_last_pat_pmt_packets(byte_t* data, int size, byte_t** last_pat_packet, byte_t** last_pmt_packet);
	
void fix_continuity_forward(dynamic_buffer_t* segments, int segment_count);

void fix_continuity_backward(dynamic_buffer_t* segments, int segment_count);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __TS_CUTTER_IMPL_H__
