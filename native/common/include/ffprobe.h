#ifndef __FFPROBE_H__
#define __FFPROBE_H__

#include "common.h"

typedef struct {
	int media_type;
	int pos;					// file offset
	int64_t pts;				// measured in 90KHz
	int duration;				// measured in 90KHz
	bool_t is_iframe;
	
	int relative_duration;		// distance to the beginning/end (90KHz)
} frame_info_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

frame_info_t* get_frames(const char* ffprobe_bin, const char** files, int file_count, int* frame_count);
frame_info_t* get_frames_single(const char* ffprobe_bin, const char* input_file, int* frame_count);
frame_info_t* parse_ffprobe_output(char* input_buffer, int length, int* frame_count);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __FFPROBE_H__
