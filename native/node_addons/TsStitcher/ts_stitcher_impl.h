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
} LayoutState;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

typedef struct {
	uint32_t layoutPos;
	int chunkType;
	uint32_t chunkStartOffset;
} OutputState;

bool_t buildLayoutImpl(
	dynamic_buffer_t* result,
	void* preAdMetadata,
	void* adMetadata,
	void* blackMetadata,
	void* postAdMetadata,
	int32_t segmentIndex,
	int32_t outputStart,
	int32_t outputEnd);
	
void processChunkImpl(
	// input
	byte_t* layoutBuffer,
	uint32_t layoutSize,
	
	// inout
	byte_t* chunkBuffer,
	uint32_t chunkSize,
	OutputState* outputState,
	
	// output
	uint32_t* chunkOutputStart,
	uint32_t* chunkOutputEnd,
	byte_t** outputBuffer,
	size_t* outputBufferSize,
	bool_t* moreDataNeeded);

bool_t is_metadata_buffer_valid(const void* buffer, size_t size);

uint32_t get_chunk_count(const void* metadata);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __TS_STITCHER_IMPL_H__
