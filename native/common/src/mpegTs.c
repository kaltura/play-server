#include <stdlib.h>
#include <string.h>
#include "mpegTs.h"

int64_t get_pcr(const pcr_t* pcr)
{
	return (((int64_t)pcr_get_pcr90kHzHigh(pcr)) << 16) | pcr_get_pcr90kHzLow(pcr);
}

void update_pcr(pcr_t* pcr, int64_t pcr_val)
{
	pcr_set_pcr90kHzHigh(pcr, 	(pcr_val >> 16));
	pcr_set_pcr90kHzLow	(pcr, 	 pcr_val 	   );
}

void set_pcr(pcr_t* pcr, int64_t pcr_val)
{
	pcr[4] = pcr[5] = 0;
	pcr_set_pcr90kHzHigh(pcr, 	(pcr_val >> 16));
	pcr_set_pcr90kHzLow	(pcr, 	 pcr_val 	   );
}

int64_t get_pts(const pts_t* pts)
{
	return (((int64_t)pts_get_high(pts)) << 30) | (((int64_t)pts_get_medium(pts)) << 15) | (int64_t)pts_get_low(pts);
}

void update_pts(pts_t* pts, int64_t pts_val)
{
	pts_set_high	(pts, 	(pts_val >> 30));
	pts_set_medium	(pts,	(pts_val >> 15));
	pts_set_low		(pts, 	 pts_val	   );
}

void set_pts(pts_t* pts, int indicator, int64_t pts_val)
{
	pts[0] = pts[2] = pts[4] = 0xff;
	pts_set_pad1	(pts,	indicator);
	pts_set_high	(pts, 	(pts_val >> 30));
	pts_set_medium	(pts,	(pts_val >> 15));
	pts_set_low		(pts, 	 pts_val	   );
}

static void 
get_timestamp_offsets(const byte_t* packet_start, timestamp_offsets_t* timestamp_offsets, byte_t* stream_id)
{
	const byte_t* packet_offset = packet_start;
	const byte_t* packet_end = packet_offset + TS_PACKET_LENGTH;
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	int adapt_size;
	const pes_optional_header_t* pes_optional_header;

	timestamp_offsets->pcr = NO_OFFSET;
	timestamp_offsets->pts = NO_OFFSET;
	timestamp_offsets->dts = NO_OFFSET;
	
	ts_header = packet_offset;
	packet_offset += sizeof_mpeg_ts_header;
	if (mpeg_ts_header_get_adaptationFieldExist(ts_header))
	{
		adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
		adapt_size = 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
		
		if (mpeg_ts_adaptation_field_get_pcrFlag(adapt_field) && adapt_size >= sizeof_mpeg_ts_adaptation_field + sizeof_pcr)
		{			
			timestamp_offsets->pcr = packet_offset + sizeof_mpeg_ts_adaptation_field - packet_start;
		}

		packet_offset += adapt_size;
	}
	
	if (mpeg_ts_header_get_payloadUnitStartIndicator(ts_header) &&
		packet_offset + sizeof_pes_header + sizeof_pes_optional_header < packet_end &&
		pes_header_get_prefix(packet_offset) == PES_MARKER)
	{
		*stream_id = pes_header_get_streamId(packet_offset);
		packet_offset += sizeof_pes_header;
		pes_optional_header = packet_offset;
		packet_offset += sizeof_pes_optional_header;

		if (pes_optional_header_get_ptsFlag(pes_optional_header))
		{
			timestamp_offsets->pts = packet_offset - packet_start;
			packet_offset += sizeof_pts;
			if (pes_optional_header_get_dtsFlag(pes_optional_header))
			{
				timestamp_offsets->dts = packet_offset - packet_start;
			}
		}
	}
}

void reset_timestamps(timestamps_t* timestamps)
{
	timestamps->pcr = NO_TIMESTAMP;
	timestamps->pts = NO_TIMESTAMP;
	timestamps->dts = NO_TIMESTAMP;
}

void get_timestamps(const byte_t* packet_start, const timestamp_offsets_t* timestamp_offsets, timestamps_t* timestamps)
{
	timestamps->pcr = NO_TIMESTAMP;
	timestamps->pts = NO_TIMESTAMP;
	timestamps->dts = NO_TIMESTAMP;

	if (timestamp_offsets->pcr != NO_OFFSET)
	{
		timestamps->pcr = get_pcr(packet_start + timestamp_offsets->pcr);
	}

	if (timestamp_offsets->pts != NO_OFFSET)
	{
		timestamps->pts = get_pts(packet_start + timestamp_offsets->pts);
	}

	if (timestamp_offsets->dts != NO_OFFSET)
	{
		timestamps->dts = get_pts(packet_start + timestamp_offsets->dts);
	}
}

void update_timestamps(byte_t* packet_start, const timestamp_offsets_t* timestamp_offsets, const timestamps_t* timestamps, int timestamp_offset, int pts_delay)
{
	if (timestamp_offsets->pcr != NO_OFFSET)
	{
		update_pcr(packet_start + timestamp_offsets->pcr, timestamps->pcr + timestamp_offset);
	}

	if (timestamp_offsets->pts != NO_OFFSET)
	{
		update_pts(packet_start + timestamp_offsets->pts, timestamps->pts + timestamp_offset + pts_delay);
	}

	if (timestamp_offsets->dts != NO_OFFSET)
	{
		update_pts(packet_start + timestamp_offsets->dts, timestamps->dts + timestamp_offset);
	}
}

int64_t get_pts_from_packet(const byte_t* packet_offset, int size)
{
	const byte_t* packet_end = packet_offset + size;
	const pes_optional_header_t* pes_optional_header;

	if (packet_offset + sizeof_pes_header + sizeof_pes_optional_header < packet_end &&
		pes_header_get_prefix(packet_offset) == PES_MARKER)
	{
		packet_offset += sizeof_pes_header;
		pes_optional_header = packet_offset;
		packet_offset += sizeof_pes_optional_header;

		if (pes_optional_header_get_ptsFlag(pes_optional_header))
		{
			return get_pts(packet_offset);
		}
	}
	return -1;
}

static void 
enable_iframe(frame_info_t* frames, int frame_count, int frame_pos)
{
	int mid_value;
	int left;
	int right;
	int mid;

	left = 0;
	right = frame_count - 1;
	while (left <= right)
	{
		mid = (left + right) / 2;
		mid_value = frames[mid].pos;
		if (mid_value < frame_pos)
		{
			left = mid + 1;
		}
		else if (mid_value > frame_pos)
		{
			right = mid - 1;
		}
		else
		{
			frames[mid].is_iframe = TRUE;
			break;
		}
	}
}

static void 
parse_ffprobe_output(char* input_buffer, int length, frame_info_t* frames, int frame_count)
{
	char* new_line_pos;
	char* cur_pos;
	char* end_pos = input_buffer + length;
	int frame_pos = 0;
	bool_t is_iframe = FALSE;

	for (cur_pos = input_buffer; cur_pos < end_pos; cur_pos = new_line_pos + 1)
	{
		new_line_pos = (char*)memchr(cur_pos, '\n', end_pos - cur_pos);
		if (new_line_pos == NULL)
		{
			break;
		}
		
		*new_line_pos = '\0';
		
		if (STARTS_WITH_STATIC(cur_pos, "[PACKET]"))
		{
			frame_pos = 0;
			is_iframe = FALSE;
		}
		else if (STARTS_WITH_STATIC(cur_pos, "[/PACKET]"))
		{
			if (is_iframe && frame_pos > 0)
			{
				enable_iframe(frames, frame_count, frame_pos);
			}
		}
		else if (STARTS_WITH_STATIC(cur_pos, "flags=K"))
		{
			is_iframe = TRUE;
		}
		else if (STARTS_WITH_STATIC(cur_pos, "pos="))
		{
			frame_pos = atoi(cur_pos + sizeof("pos=") - 1);
		}		
	}
}

typedef struct {
	int index;
	int64_t pts;
} frame_pts_t;

static int 
compare_frame_pts_timestamps(const void* frame1, const void* frame2)
{
	return ((frame_pts_t*)frame1)->pts - ((frame_pts_t*)frame2)->pts;
}

bool_t set_frame_durations(frame_info_t* frames, int frame_count)
{
	frame_info_t* last_frame[MEDIA_TYPE_COUNT];
	frame_info_t* cur_frame;
	frame_pts_t* frame_ptss;
	frame_pts_t* frame_ptss_end;
	frame_pts_t* cur_pts;
	int total_durations[MEDIA_TYPE_COUNT];
	int frame_counts[MEDIA_TYPE_COUNT];
	int i;
	
	frame_ptss = malloc(sizeof(frame_ptss[0]) * frame_count);
	if (frame_ptss == NULL)
	{
		return FALSE;
	}
	
	for (i = 0; i < frame_count; i++)
	{
		frame_ptss[i].index = i;
		frame_ptss[i].pts = frames[i].timestamps.pts;
	}

	qsort(frame_ptss, frame_count, sizeof(frame_ptss[0]), &compare_frame_pts_timestamps);
	
	memset(&last_frame, 0, sizeof(last_frame));
	memset(&total_durations, 0, sizeof(total_durations));
	memset(&frame_counts, 0, sizeof(frame_counts));
	
	frame_ptss_end = frame_ptss + frame_count;
	for (cur_pts = frame_ptss; cur_pts < frame_ptss_end; cur_pts++)
	{
		cur_frame = &frames[cur_pts->index];
		if (last_frame[cur_frame->media_type] != NULL)
		{
			last_frame[cur_frame->media_type]->duration = cur_frame->timestamps.pts - last_frame[cur_frame->media_type]->timestamps.pts;
			total_durations[cur_frame->media_type] += last_frame[cur_frame->media_type]->duration;
			frame_counts[cur_frame->media_type]++;
		}
		last_frame[cur_frame->media_type] = cur_frame;
	}
	
	for (i = 0; i < MEDIA_TYPE_COUNT; i++)
	{
		if (last_frame[i] != NULL && frame_counts[i] > 0)
		{
			last_frame[i]->duration = total_durations[i] / frame_counts[i];
		}
	}
	
	free(frame_ptss);
	
	return TRUE;
}

bool_t 
get_frames(
	dynamic_buffer_t* buffers_start,
	int buffer_count,
	char* frames_text,
	int frames_text_size, 
	frame_info_t** frames,
	int* frame_count, 
	bool_t use_first_pcr)
{
	timestamp_offsets_t timestamp_offsets;
	dynamic_buffer_t* buffers_end = buffers_start + buffer_count;
	dynamic_buffer_t* buffers;
	dynamic_buffer_t result = { NULL, 0, 0 };
	frame_info_t frame_info;
	frame_info_t* last_frame;
	byte_t stream_id;
	byte_t* data_end;
	byte_t* data_cur;
	int cur_frame_pid;
	int cur_pos = 0;
	
	*frame_count = 0;
	memset(&frame_info, 0, sizeof(frame_info));
	
	for (buffers = buffers_start; buffers < buffers_end; buffers++)
	{
		cur_frame_pid = -1;
		
		data_end = buffers->data + buffers->write_pos - TS_PACKET_LENGTH + 1;
		for (data_cur = buffers->data; data_cur <= data_end; data_cur += TS_PACKET_LENGTH, cur_pos += TS_PACKET_LENGTH)
		{
			get_timestamp_offsets(data_cur, &timestamp_offsets, &stream_id);
			if (timestamp_offsets.pts != NO_OFFSET)
			{
				if (stream_id >= MIN_VIDEO_STREAM_ID && stream_id <= MAX_VIDEO_STREAM_ID)
				{
					frame_info.media_type = MEDIA_TYPE_VIDEO;
				}
				else if (stream_id >= MIN_AUDIO_STREAM_ID && stream_id <= MAX_AUDIO_STREAM_ID)
				{
					frame_info.media_type = MEDIA_TYPE_AUDIO;
				}
				else
				{
					continue;
				}
				
				frame_info.pos = cur_pos;
				frame_info.timestamps.pcr = NO_TIMESTAMP;
				frame_info.timestamps.pts = get_pts(data_cur + timestamp_offsets.pts);
				if (timestamp_offsets.dts != NO_OFFSET)
				{
					frame_info.timestamps.dts = get_pts(data_cur + timestamp_offsets.dts);
				}
				else
				{
					frame_info.timestamps.dts = frame_info.timestamps.pts;
				}
				frame_info.timestamp_offsets = timestamp_offsets;
								
				if (!append_buffer(&result, &frame_info, sizeof(frame_info)))
				{
					goto error;
				}
				(*frame_count)++;
				
				cur_frame_pid = mpeg_ts_header_get_PID(data_cur);
			}

			if (cur_frame_pid != -1 && timestamp_offsets.pcr != NO_OFFSET)
			{
				last_frame = ((frame_info_t*)(result.data + result.write_pos)) - 1;
				if (last_frame->timestamps.pcr == NO_TIMESTAMP || !use_first_pcr)
				{
					last_frame->timestamps.pcr = get_pcr(data_cur + timestamp_offsets.pcr);
				}
			}
		}
	}
	
	parse_ffprobe_output(frames_text, frames_text_size, (frame_info_t*)result.data, *frame_count);
	
	if (!set_frame_durations((frame_info_t*)result.data, *frame_count))
	{
		goto error;
	}

	*frames = (frame_info_t*)result.data;

	return TRUE;
	
error:

	free_buffer(&result);
	
	return FALSE;
}
