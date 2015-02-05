#ifndef __TS_STITCHER_IMPL_H__
#define __TS_STITCHER_IMPL_H__

// headers
#include "mpegTsMetadata.h"
#include "dynamicBuffer.h"
#include "common.h"

// typedefs
enum 
{
	CHUNK_TYPE_INVALID  =  -1,
	CHUNK_TYPE_TS_HEADER = 	0,
	CHUNK_TYPE_PRE_AD = 	1,
	CHUNK_TYPE_POST_AD = 	2,
};

typedef enum {
	ALIGN_LEFT,
	ALIGN_MIDDLE,
	ALIGN_RIGHT,	
} ad_section_alignment_t;

typedef enum {
	PBA_CALL_AGAIN,
	PBA_GET_NEXT_CHUNK,
	PBA_CLONE_CURRENT_CHUNK,
} process_buffer_action_t;

typedef struct {
	int32_t ad_chunk_type;
	const metadata_header_t* ad_header;
	int32_t filler_chunk_type;
	const metadata_header_t* filler_header;
	int32_t start_pos;		// 0 = start after previous
	int32_t end_pos;		// 0 = use video duration
	int32_t alignment;
} ad_section_t;

typedef struct {
	uint32_t layout_pos;
	int32_t chunk_type;
	uint32_t chunk_start_offset;
} output_state_t;

typedef struct {
	uint32_t chunk_output_start;
	uint32_t chunk_output_end;
	byte_t* output_buffer;
	size_t output_buffer_size;
	process_buffer_action_t action;
} process_output_t;

// functions
#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

bool_t build_layout(
	dynamic_buffer_t* result,
	const metadata_header_t* pre_ad_header, 
	const metadata_header_t* post_ad_header, 
	ad_section_t* ad_sections_start,
	int ad_sections_count,
	int32_t segment_index,
	int32_t output_start,
	int32_t output_end);
	
void process_chunk(
	// input
	byte_t* layout_buffer,
	size_t layout_size,
	
	// inout
	byte_t* chunk_buffer,
	size_t chunk_size,
	output_state_t* output_state,
	
	// output
	process_output_t* output);

bool_t is_metadata_buffer_valid(const void* buffer, size_t size);

uint32_t get_data_size(const void* metadata);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __TS_STITCHER_IMPL_H__
