#include <string.h>
#include "ts_cutter_impl.h"

#define CLIPPING_DURATION_THRESHOLD 6000		// 2 frames in 30 fps

byte_t* get_buffer_pos(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	int position)
{
	dynamic_buffer_t* source_bufs_end = source_bufs + source_buf_count;
	dynamic_buffer_t* cur_buf;
	int cur_pos = 0;
	
	for (cur_buf = source_bufs; cur_buf < source_bufs_end; cur_pos += cur_buf->write_pos, cur_buf++)
	{
		if (position >= cur_pos && position < cur_pos + cur_buf->write_pos)
		{
			return cur_buf->data + position - cur_pos;
		}
	}
	return NULL;
}

void calc_duration_before(frame_info_t* frames, int frame_count)
{
	frame_info_t* frames_end = frames + frame_count;
	frame_info_t* cur_frame;
	int durations[MEDIA_TYPE_COUNT] = { 0 };
	int *cur_duration;
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		cur_duration = durations + cur_frame->media_type;
		cur_frame->relative_duration = *cur_duration;
		*cur_duration += cur_frame->duration;
	}
}

void calc_duration_after(frame_info_t* frames, int frame_count)
{
	frame_info_t* cur_frame;
	int durations[MEDIA_TYPE_COUNT] = { 0 };
	int *cur_duration;
	
	for (cur_frame = frames + frame_count - 1; cur_frame >= frames; cur_frame--)
	{
		cur_duration = durations + cur_frame->media_type;
		*cur_duration -= cur_frame->duration;
		cur_frame->relative_duration = *cur_duration;
	}
}

void has_video_audio_frames(frame_info_t* frames, int frame_count, bool_t* has_video, bool_t* has_audio)
{
	frame_info_t* frames_end = frames + frame_count;
	frame_info_t* cur_frame;
	
	*has_video = FALSE;
	*has_audio = FALSE;
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		if (cur_frame->media_type == MEDIA_TYPE_VIDEO)
		{
			*has_video = TRUE;
		}
		else
		{
			*has_audio = TRUE;
		}
		
		if (*has_video && *has_audio)
			break;
	}
}

void get_frame_timestamps(const byte_t* packet_offset, timestamps_t* timestamps)
{
	timestamp_offsets_t timestamp_offsets;
	
	get_timestamp_offsets(packet_offset, &timestamp_offsets);
	get_timestamps(packet_offset, &timestamp_offsets, timestamps);
}

void set_frame_timestamps(byte_t* packet_offset, timestamps_t* timestamps, int timestamp_offset)
{
	timestamp_offsets_t timestamp_offsets;
	
	get_timestamp_offsets(packet_offset, &timestamp_offsets);
	update_timestamps(packet_offset, &timestamp_offsets, timestamps, timestamp_offset);
}

void get_reference_timestamps(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	frame_info_t* source_frames, 
	int source_frame_count,
	bool_t left_portion, 
	timestamps_t* result)
{
	timestamps_t cur_timestamps;
	timestamps_t* cur_offsets;
	frame_info_t* source_frames_end;
	frame_info_t* cur_frame;
	byte_t* cur_packet;
		
	reset_timestamps(&result[MEDIA_TYPE_VIDEO]);
	reset_timestamps(&result[MEDIA_TYPE_AUDIO]);
	
	if (left_portion)
	{
		calc_duration_before(source_frames, source_frame_count);
	}
	else
	{
		calc_duration_after(source_frames, source_frame_count);
	}

	source_frames_end = source_frames + source_frame_count;
	for (cur_frame = source_frames; cur_frame < source_frames_end; cur_frame++)
	{
		cur_offsets = result + cur_frame->media_type;
		
		cur_packet = get_buffer_pos(source_bufs, source_buf_count, cur_frame->pos);
		if (cur_packet == NULL)
		{
			continue;
		}
		
		get_frame_timestamps(cur_packet, &cur_timestamps);
		
		if (cur_timestamps.pcr != NO_TIMESTAMP)
			cur_offsets->pcr = cur_timestamps.pcr - cur_frame->relative_duration;

		if (cur_timestamps.pts != NO_TIMESTAMP)
			cur_offsets->pts = cur_timestamps.pts - cur_frame->relative_duration;

		if (cur_timestamps.dts != NO_TIMESTAMP)
			cur_offsets->dts = cur_timestamps.dts - cur_frame->relative_duration;
	}
	
	// if dts offset was not found, use pts offset
	if (result[MEDIA_TYPE_VIDEO].dts == NO_TIMESTAMP)
		result[MEDIA_TYPE_VIDEO].dts = result[MEDIA_TYPE_VIDEO].pts;

	if (result[MEDIA_TYPE_AUDIO].dts == NO_TIMESTAMP)
		result[MEDIA_TYPE_AUDIO].dts = result[MEDIA_TYPE_AUDIO].pts;
}

bool_t get_bounding_iframes(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	frame_info_t* frames, 
	int frame_count, 
	bool_t is_video, 
	int cut_offset, 
	bounding_iframes_t* result)
{
	frame_info_t* frames_end = frames + frame_count;
	frame_info_t* cur_frame;
	byte_t* cur_packet;
	int frame_offset = 0;

	memset(result, 0, sizeof(*result));
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		// ignore audio frames in a video TS file
		if (is_video && cur_frame->media_type != MEDIA_TYPE_VIDEO)
		{
			continue;
		}
		
		// we care only about iframes
		if (!cur_frame->is_iframe)
		{
			frame_offset += cur_frame->duration;
			continue;
		}

		// make sure the iframe has a PCR timestamp
		cur_packet = get_buffer_pos(source_bufs, source_buf_count, cur_frame->pos);
		if (cur_packet == NULL || !frame_has_pcr(cur_packet))
		{
			frame_offset += cur_frame->duration;
			continue;
		}
		
			
		if (frame_offset < cut_offset)
		{
			// iframe is before cut_offset, use as left frame (override any previously found frame)
			result->left_iframe = cur_frame;
			result->left_iframe_offset = frame_offset;
			
			// if frame is close enough to the cut position use it also as right frame
			if (cut_offset - frame_offset < CLIPPING_DURATION_THRESHOLD)
			{
				break;
			}
		}
		else
		{
			// iframe is after cut_offset, use as right frame
			result->right_iframe = cur_frame;
			result->right_iframe_offset = frame_offset;
			break;
		}
		frame_offset += cur_frame->duration;
	}

	// if no frame was found return error
	if (result->left_iframe == NULL && result->right_iframe == NULL)
	{
		return FALSE;
	}
	
	// use the left frame if the right frame was not found
	if (result->right_iframe == NULL)
	{
		result->right_iframe = result->left_iframe;
		result->right_iframe_offset = result->left_iframe_offset;
	}

	// use the right frame if no left frame was found / right frame is close enough to the cut position
	if (result->left_iframe == NULL || result->right_iframe_offset - cut_offset < CLIPPING_DURATION_THRESHOLD)
	{
		result->left_iframe = result->right_iframe;
		result->left_iframe_offset = result->right_iframe_offset;
	}
		
	return TRUE;
}

bool_t get_cut_details(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	char* frames_text,
	int frames_text_size,
	int cut_offset,
	bool_t left_portion, 
	bounding_iframes_t* bounding_iframes, 
	timestamps_t* reference_timestamps)
{
	frame_info_t* source_frames;
	int source_frame_count;	
	bool_t has_video;
	bool_t has_audio;

	// parse frames text buffer
	source_frames = parse_ffprobe_output(frames_text, frames_text_size, &source_frame_count);
	if (source_frames == NULL)
	{
		return FALSE;
	}

	// check whether we have audio/video
	has_video_audio_frames(source_frames, source_frame_count, &has_video, &has_audio);

	if (!get_bounding_iframes(
		source_bufs,
		source_buf_count,
		source_frames,
		source_frame_count,
		has_video,
		cut_offset,
		bounding_iframes))
	{
		return FALSE;
	}

	get_reference_timestamps(
		source_bufs,
		source_buf_count,
		bounding_iframes->left_iframe, 
		bounding_iframes->right_iframe - bounding_iframes->left_iframe, 
		left_portion, 
		reference_timestamps);
	
	return TRUE;
}

bool_t fix_timestamps(
	byte_t* source_buf,
	size_t source_size,
	char* frames_text,
	int frames_text_size,
	timestamps_t* reference_timestamps,
	bool_t left_portion)
{
	frame_info_t* cur_frame;
	frame_info_t* source_frames;
	frame_info_t* source_frames_end;
	timestamps_t* cur_offsets;
	int source_frame_count;	

	source_frames = parse_ffprobe_output(frames_text, frames_text_size, &source_frame_count);
	if (source_frames == NULL)
	{
		return FALSE;
	}

	if (left_portion)
	{
		calc_duration_before(source_frames, source_frame_count);
	}
	else
	{
		calc_duration_after(source_frames, source_frame_count);
	}
	
	source_frames_end = source_frames + source_frame_count;
	for (cur_frame = source_frames; cur_frame < source_frames_end; cur_frame++)
	{
		cur_offsets = reference_timestamps + cur_frame->media_type;
		set_frame_timestamps(source_buf + cur_frame->pos, cur_offsets, cur_frame->relative_duration);
	}

	return TRUE;
}

bool_t find_last_pat_pmt_packets(byte_t* data, int size, byte_t** last_pat_packet, byte_t** last_pmt_packet)
{
	byte_t* end_data = data + size - TS_PACKET_LENGTH;
	byte_t* packet_offset;
	byte_t* cur_data;
	int cur_pid;
	int pmt_program_pid = 0;
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	const pat_t* pat_header;
	const pat_entry_t* pat_entry;
	int pat_entry_count;
	int i;
	
	*last_pat_packet = NULL;
	*last_pmt_packet = NULL;

	for (cur_data = data; cur_data <= end_data; cur_data += TS_PACKET_LENGTH)
	{
		// extract the current PID
		ts_header = (const mpeg_ts_header_t*)cur_data;				
		cur_pid = mpeg_ts_header_get_PID(ts_header);
		
		if (cur_pid == PAT_PID)
		{
			*last_pat_packet = cur_data;

			// skip the adapation field if present
			packet_offset = cur_data + sizeof_mpeg_ts_header;
			if (mpeg_ts_header_get_adaptationFieldExist(ts_header))
			{
				adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
				packet_offset += 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
			}
			
			// extract the pat header
			pat_header = (const pat_t*)packet_offset;
			packet_offset += sizeof_pat;
			pat_entry_count = (pat_get_sectionLength(pat_header) - 9) / sizeof_pat_entry;
			for (i = 0; i < pat_entry_count; i++)
			{
				// extract the pat entry
				pat_entry = (const pat_entry_t*)packet_offset;
				packet_offset += sizeof_pat_entry;
				
				// if the program number is 1, the PID is PID of the PMT
				if (pat_entry_get_programNumber(pat_entry) == 1)
					pmt_program_pid = pat_entry_get_programPID(pat_entry);
			}
		}
		else if (cur_pid == pmt_program_pid)
		{
			*last_pmt_packet = cur_data;
		}
	}
	
	return (*last_pat_packet != NULL) && (*last_pmt_packet != NULL);
}

void fix_continuity_forward(dynamic_buffer_t* segments, int segment_count)
{
	byte_t continuity_values[0x2000];		// last seen continuity counter per PID
	byte_t* cur_counter;
	byte_t* cur_pos;
	byte_t* end_pos;
	int cur_value;
	dynamic_buffer_t* cur_segment;
	dynamic_buffer_t* segments_end;
	
	memset(continuity_values, 0xff, sizeof(continuity_values));

	segments_end = segments + segment_count;
	for (cur_segment = segments; cur_segment < segments_end; cur_segment++)
	{
		end_pos = cur_segment->data + cur_segment->write_pos;
		for (cur_pos = cur_segment->data; cur_pos < end_pos; cur_pos += TS_PACKET_LENGTH)
		{
			cur_counter = continuity_values + mpeg_ts_header_get_PID(cur_pos);
			if (*cur_counter != 0xff)
			{
				cur_value = (*cur_counter + 1) & 0x0f;
				mpeg_ts_header_set_continuityCounter(cur_pos, cur_value);
			}
			else
				cur_value = mpeg_ts_header_get_continuityCounter(cur_pos);
			
			*cur_counter = cur_value;			
		}
	}
}

void fix_continuity_backward(dynamic_buffer_t* segments, int segment_count)
{
	byte_t continuity_values[0x2000];
	byte_t* cur_counter;
	byte_t* cur_pos;
	byte_t* end_pos;
	int cur_value;
	dynamic_buffer_t* cur_segment;
	
	memset(continuity_values, 0xff, sizeof(continuity_values));

	for (cur_segment = segments + segment_count - 1; cur_segment >= segments; cur_segment--)
	{
		end_pos = cur_segment->data;
		for (cur_pos = cur_segment->data + cur_segment->write_pos - TS_PACKET_LENGTH; cur_pos >= end_pos; cur_pos -= TS_PACKET_LENGTH)
		{
			cur_counter = continuity_values + mpeg_ts_header_get_PID(cur_pos);
			if (*cur_counter != 0xff)
			{
				cur_value = (*cur_counter - 1) & 0x0f;
				mpeg_ts_header_set_continuityCounter(cur_pos, cur_value);
			}
			else
				cur_value = mpeg_ts_header_get_continuityCounter(cur_pos);
			
			*cur_counter = cur_value;			
		}
	}
}
