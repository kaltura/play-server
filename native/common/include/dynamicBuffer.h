#ifndef __DYNAMICBUFFER_H__
#define __DYNAMICBUFFER_H__

#include "common.h"

typedef struct {
	byte_t* data;
	int write_pos;
	int alloc_size;
} dynamic_buffer_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

bool_t append_buffer(dynamic_buffer_t* buf, const void* data, int len);

void free_buffer(dynamic_buffer_t* buf);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __DYNAMICBUFFER_H__
