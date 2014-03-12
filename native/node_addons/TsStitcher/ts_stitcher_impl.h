#ifndef __TS_STITCHER_IMPL_H__
#define __TS_STITCHER_IMPL_H__

#include "dynamicBuffer.h"
#include "common.h"

typedef enum {
	STATE_PRE_AD,
	STATE_AD,
	STATE_PAD,
	STATE_POST_AD,
	
	STATE_PRE_AD_HEADER,
	
	STATE_INVALID,
} layout_state_t;

typedef struct {
	uint32_t layout_pos;
	int chunk_type;
	uint32_t chunk_start_offset;
} output_state_t;

typedef struct {
	uint32_t chunk_output_start;
	uint32_t chunk_output_end;
	byte_t* output_buffer;
	size_t output_buffer_size;
	bool_t more_data_needed;
} process_output_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

bool_t build_layout_impl(
	dynamic_buffer_t* result,
	void* pre_ad_metadata,
	void* ad_metadata,
	void* black_metadata,
	void* post_ad_metadata,
	int32_t segment_index,
	int32_t output_start,
	int32_t output_end);
	
void process_chunk_impl(
	// input
	byte_t* layout_buffer,
	uint32_t layout_size,
	
	// inout
	byte_t* chunk_buffer,
	uint32_t chunk_size,
	output_state_t* output_state,
	
	// output
	process_output_t* output);

bool_t is_metadata_buffer_valid(const void* buffer, size_t size);

uint32_t get_chunk_count(const void* metadata);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __TS_STITCHER_IMPL_H__
