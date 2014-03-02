#include <stdlib.h>
#include <string.h>
#include "dynamicBuffer.h"
#include "basicIo.h"
#include "ffprobe.h"
#include "mpegTs.h"

#define GET_FRAMES_MID (" -show_packets -i 'concat:")
#define GET_FRAMES_FILE_DELIM ("|")
#define GET_FRAMES_END ("' 2> /dev/null")

typedef struct {
	frame_info_t cur_frame;
	dynamic_buffer_t result;
} get_frames_state_t;

int get_frames_callback(void* context, const char* line)
{
	get_frames_state_t* state = (get_frames_state_t*)context;
	frame_info_t* last_frame;
	const char* value;
	
	if (STARTS_WITH_STATIC(line, "[PACKET]"))
	{
		memset(&state->cur_frame, 0, sizeof(state->cur_frame));
	}
	else if (STARTS_WITH_STATIC(line, "[/PACKET]"))
	{
		if (state->cur_frame.pos == 0)
		{
			// ffprobe outputs some frames with pos=N/A, add the duration to the previous frame
			last_frame = (frame_info_t*)(state->result.data + state->result.write_pos) - 1;
			last_frame->duration += state->cur_frame.duration;
			return 0;
		}
		
		append_buffer(&state->result, PS(state->cur_frame));
	}
	else if (STARTS_WITH_STATIC(line, "pos="))
	{
		value = line + sizeof("pos=") - 1;	
		state->cur_frame.pos = atoi(value);
	}
	else if (STARTS_WITH_STATIC(line, "pts="))
	{
		value = line + sizeof("pts=") - 1;	
		state->cur_frame.pts = atoll(value);
	}
	else if (STARTS_WITH_STATIC(line, "duration="))
	{
		value = line + sizeof("duration=") - 1;	
		state->cur_frame.duration = atoi(value);
	}
	else if (STARTS_WITH_STATIC(line, "codec_type="))
	{
		value = line + sizeof("codec_type=") - 1;	
		if (STARTS_WITH_STATIC(value, "audio"))
			state->cur_frame.media_type = MEDIA_TYPE_AUDIO;
		else if (STARTS_WITH_STATIC(value, "video"))
			state->cur_frame.media_type = MEDIA_TYPE_VIDEO;
	}
	else if (STARTS_WITH_STATIC(line, "flags=K"))
	{
		state->cur_frame.is_iframe = TRUE;
	}
	
	return 0;
}

frame_info_t* get_frames(const char* ffprobe_bin, char** files, int file_count, int* frame_count)
{
	get_frames_state_t state = { { 0 } };
	char *command;
	int command_len;
	int cur_file;
	
	// get the length of the command line
	command_len = strlen(ffprobe_bin) + sizeof(GET_FRAMES_MID) + sizeof(GET_FRAMES_END) + 1;
	for (cur_file = 0; cur_file < file_count; cur_file++)
	{
		command_len += strlen(files[cur_file]) + sizeof(GET_FRAMES_FILE_DELIM);
	}
	
	// allocate the command line
	command = malloc(command_len);
	if (command == NULL)
	{
		return NULL;
	}
	
	// build the command line
	strcpy(command, ffprobe_bin);
	strcat(command, GET_FRAMES_MID);
	for (cur_file = 0; cur_file < file_count; cur_file++)
	{
		if (cur_file != 0)
			strcat(command, GET_FRAMES_FILE_DELIM);
		strcat(command, files[cur_file]);
	}
	strcat(command, GET_FRAMES_END);
	
	// execute the command
	walk_command_output(command, &get_frames_callback, &state);
	
	// clean up
	free(command);
	
	*frame_count = state.result.write_pos / sizeof(frame_info_t);
	return (frame_info_t*)state.result.data;
}
