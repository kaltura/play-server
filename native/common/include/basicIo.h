#ifndef __BASICIO_H__
#define __BASICIO_H__

#include "dynamicBuffer.h"
#include "common.h"

typedef int (*walk_output_callback_t)(void* context, const char* line);

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

bool_t walk_command_output(const char* cmd, walk_output_callback_t callback, void* context);

byte_t* read_files(char** files, int file_count, size_t* read_size);
bool_t write_file(const char* output_file, const dynamic_buffer_t* segments, int segment_count);
bool_t write_file_single(const char* output_file, byte_t* buffer, int len);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __BASICIO_H__
