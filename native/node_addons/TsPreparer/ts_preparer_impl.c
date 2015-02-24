#include <stdlib.h>
#include <string.h>
#include "ts_preparer_impl.h"
#include "mpegTsStreamInfo.h"
#include "mpegTsMetadata.h"
#include "mpegTs.h"

#define CLIPPING_DURATION_THRESHOLD (6000)		// 2 frames in 30 fps
#define DEFAULT_PCR_PTS_OFFSET (4500)

static void 
has_video_audio_frames(frame_info_t* frames, int frame_count, bool_t* has_stream)
{
	frame_info_t* frames_end = frames + frame_count;
	frame_info_t* cur_frame;
	
	has_stream[MEDIA_TYPE_VIDEO] = FALSE;
	has_stream[MEDIA_TYPE_AUDIO] = FALSE;
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		has_stream[cur_frame->media_type] = TRUE;
		
		if (has_stream[MEDIA_TYPE_VIDEO] && has_stream[MEDIA_TYPE_AUDIO])
		{
			break;
		}
	}
}

static bool_t 
get_bounding_iframes(
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
	int frame_offset = 0;
	int cur_frame_index = 0;

	result->left_iframe_index = -1;
	result->right_iframe_index = -1;
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++, cur_frame_index++)
	{
		// ignore audio frames in a video TS file
		if (is_video && cur_frame->media_type != MEDIA_TYPE_VIDEO)
		{
			continue;
		}
		
		// we care only about iframes that have a pcr value
		if (!cur_frame->is_iframe || cur_frame->timestamps.pcr == NO_TIMESTAMP)
		{
			frame_offset += cur_frame->duration;
			continue;
		}
			
		if (frame_offset >= cut_offset)
		{
			// iframe is after cut_offset, use as right frame
			result->right_iframe_index = cur_frame_index;
			result->right_iframe_pos = cur_frame->pos;
			result->right_iframe_offset = frame_offset;
			break;
		}

		// iframe is before cut_offset, use as left frame (override any previously found frame)
		result->left_iframe_index = cur_frame_index;
		result->left_iframe_pos = cur_frame->pos;
		result->left_iframe_offset = frame_offset;
		
		// if frame is close enough to the cut position use it also as right frame
		if (cut_offset - frame_offset < CLIPPING_DURATION_THRESHOLD)
		{
			break;
		}

		frame_offset += cur_frame->duration;
	}

	// if no frame was found return error
	if (result->left_iframe_index == -1 && result->right_iframe_index == -1)
	{
		return FALSE;
	}
	
	// use the left frame if the right frame was not found
	if (result->right_iframe_index == -1)
	{
		result->right_iframe_index = result->left_iframe_index;
		result->right_iframe_pos = result->left_iframe_pos;
		result->right_iframe_offset = result->left_iframe_offset;
	}

	// use the right frame if no left frame was found / right frame is close enough to the cut position
	if (result->left_iframe_index == -1 || result->right_iframe_offset - cut_offset < CLIPPING_DURATION_THRESHOLD)
	{
		result->left_iframe_index = result->right_iframe_index;
		result->left_iframe_pos = result->right_iframe_pos;
		result->left_iframe_offset = result->right_iframe_offset;
	}
		
	return TRUE;
}

bool_t 
get_cut_details(
	dynamic_buffer_t* source_bufs,
	int source_buf_count,
	char* frames_text,
	size_t frames_text_size,
	int cut_offset,
	bool_t left_portion, 
	bounding_iframes_t* bounding_iframes,
	frame_info_t** original_frames,
	int* original_frames_count)
{
	frame_info_t* source_frames;
	int source_frame_count;	
	bool_t has_stream[MEDIA_TYPE_COUNT];

	// parse frames
	if (!get_frames(
		source_bufs,
		source_buf_count,
		frames_text,
		frames_text_size, 
		&source_frames,
		&source_frame_count, 
		!left_portion))		// left - use last pcr, right - use first pcr
	{
		return FALSE;
	}

	// check whether we have audio/video
	has_video_audio_frames(source_frames, source_frame_count, has_stream);

	if (!get_bounding_iframes(
		source_bufs,
		source_buf_count,
		source_frames,
		source_frame_count,
		has_stream[MEDIA_TYPE_VIDEO],
		cut_offset,
		bounding_iframes))
	{
		free(source_frames);
		return FALSE;
	}

	if (left_portion)
	{
		*original_frames_count = bounding_iframes->left_iframe_index;
		*original_frames = source_frames;
	}
	else
	{
		*original_frames_count = source_frame_count - bounding_iframes->right_iframe_index;
		*original_frames = malloc(*original_frames_count * sizeof(frame_info_t));
		if (*original_frames == NULL)
		{
			free(source_frames);
			return FALSE;
		}
		memcpy(*original_frames, source_frames + bounding_iframes->right_iframe_index, *original_frames_count * sizeof(frame_info_t));
		free(source_frames);
	}
		
	return TRUE;
}

bool_t 
find_last_pat_pmt_packets(byte_t* data, size_t size, byte_t** last_pat_packet, byte_t** last_pmt_packet)
{
	byte_t* end_data = data + size - TS_PACKET_LENGTH;
	byte_t* packet_offset;
	byte_t* cur_data;
	int cur_pid;
	int pmt_program_pid = 0;
	const mpeg_ts_header_t* ts_header;
	
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

			packet_offset = skip_adaptation_field(ts_header);
			if (packet_offset == NULL)
			{
				return FALSE;
			}
			
			if (!get_pmt_program_pid(packet_offset, cur_data + TS_PACKET_LENGTH, &pmt_program_pid))
			{
				return FALSE;
			}
		}
		else if (cur_pid == pmt_program_pid)
		{
			*last_pmt_packet = cur_data;
		}
	}
	
	return (*last_pat_packet != NULL) && (*last_pmt_packet != NULL);
}

static bool_t 
update_streams_info(
	streams_info_t* streams_info,
	const byte_t* buffer, 
	size_t size)
{
	const byte_t* cur_pos;
	const byte_t* end_pos = buffer + size - TS_PACKET_LENGTH;
	stream_info_t* cur_info;
		
	for (cur_pos = buffer; cur_pos <= end_pos; cur_pos += TS_PACKET_LENGTH)
	{
		cur_info = streams_info_hash_get(streams_info, mpeg_ts_header_get_PID(cur_pos));
		if (cur_info == NULL)
		{
			return FALSE;
		}
		
		cur_info->end_cc = mpeg_ts_header_get_continuityCounter(cur_pos);
		if (cur_info->start_cc == INVALID_CONTINUITY_COUNTER)
		{
			cur_info->start_cc = cur_info->end_cc;
		}
	}
	
	return TRUE;
}

static uint16_t 
get_pcr_pid(byte_t* buffer, int size)
{
	byte_t* last_pat_packet;
	byte_t* last_pmt_packet;
	byte_t* packet_offset;

	if (!find_last_pat_pmt_packets(buffer, size, &last_pat_packet, &last_pmt_packet))
	{
		return 0;
	}
	
	packet_offset = skip_adaptation_field((const mpeg_ts_header_t*)last_pmt_packet);	
	if (packet_offset == NULL)
	{
		return 0;
	}
	
	if (packet_offset + sizeof_pmt > last_pmt_packet + TS_PACKET_LENGTH)
	{
		return 0;
	}
	
	return pmt_get_pcrPID(packet_offset);
}

// functions copied from nginx-vod-module - start

static u_char *
mpegts_write_packet_header(u_char *p, unsigned pid, unsigned cc, bool_t first)
{	
	*p++ = 0x47;
	*p++ = (u_char) (pid >> 8);

	if (first) 
	{
		p[-1] |= 0x40;
	}

	*p++ = (u_char) pid;
	*p++ = 0x10 | (cc & 0x0f); /* payload */
	
	return p;
}

static u_char *
mpegts_write_pes_header(u_char *p, unsigned adapt_field_flags, u_char sid, u_char* cur_packet_start, unsigned* pes_header_size, u_char** pes_size_ptr)
{
	unsigned header_size = 2 * sizeof_pts;
	unsigned packet_pcr_size;

	if (adapt_field_flags != 0)
	{
		packet_pcr_size = ((adapt_field_flags & 0x10) != 0) ? sizeof_pcr : 0;
		
		cur_packet_start[3] |= 0x20; /* adaptation */

		*p++ = 1 + packet_pcr_size;	/* size */
		*p++ = adapt_field_flags;

		// skip the pcr value
		p += packet_pcr_size;
	}

	/* PES header */

	*p++ = 0x00;
	*p++ = 0x00;
	*p++ = 0x01;
	*p++ = sid;

	*pes_header_size = header_size;
	*pes_size_ptr = p;
	p += sizeof(uint16_t);		// skip pes_size, updated later
	*p++ = 0x80; /* H222 */
	*p++ = (u_char) 0xC0;		/* flags = PTS & DTS */
	*p++ = (u_char) header_size;

	// skip pts & dts
	p += header_size;
	
	return p;
}

static u_char* 
mpegts_add_stuffing(u_char* packet, u_char* p, unsigned stuff_size)
{
	u_char* packet_end = packet + TS_PACKET_LENGTH;
	u_char  *base;

	if (packet[3] & 0x20) 
	{
		/* has adaptation */
		base = &packet[5] + packet[4];
		memmove(base + stuff_size, base, p - base);
		memset(base, 0xff, stuff_size);
		packet[4] += (u_char) stuff_size;
	}
	else
	{
		/* no adaptation */
		packet[3] |= 0x20;
		memmove(&packet[4] + stuff_size, &packet[4], p - &packet[4]);

		packet[4] = (u_char) (stuff_size - 1);
		if (stuff_size >= 2) 
		{
			packet[5] = 0;
			memset(&packet[6], 0xff, stuff_size - 2);
		}
	}
	return packet_end;
}

// functions copied from nginx-vod-module - end

static bool_t
rebuild_frame(
	const byte_t* start_pos,
	const byte_t* end_pos,
	int media_type,
	timestamp_offsets_t* timestamp_offsets,
	int src_pid,
	dynamic_buffer_t* output_data)
{
	const byte_t* src_packet_end;
	const byte_t* src_packet_pos;
	const byte_t* src_packet;
	byte_t* dest_packet_start;
	byte_t* dest_packet_end;
	byte_t* dest_packet_pos;
	byte_t* pes_size_ptr;
	unsigned adapt_field_flags;
	unsigned first_packet_data_offset = timestamp_offsets->pts + sizeof_pts;
	unsigned pes_bytes_written = 0;
	unsigned pes_header_size;
	unsigned pes_size;
	unsigned stuff_size;
	unsigned copy_size;
	size_t initial_write_pos = output_data->write_pos;

	// allocate enough space
	if (!alloc_buffer_space(output_data, end_pos - start_pos + 3 * TS_PACKET_LENGTH))
	{
		return FALSE;
	}
	
	// initialize the dest packet
	dest_packet_start = output_data->data + output_data->write_pos;
	dest_packet_end = dest_packet_start + TS_PACKET_LENGTH;
	dest_packet_pos = dest_packet_start;
	output_data->write_pos += TS_PACKET_LENGTH;

	// ts header
	dest_packet_pos = mpegts_write_packet_header(dest_packet_pos, src_pid, 0, TRUE);
	
	// get the adaptation flags
	adapt_field_flags = 0;
	if (mpeg_ts_header_get_adaptationFieldExist(start_pos))
	{
		adapt_field_flags = start_pos[sizeof_mpeg_ts_header + 1];
	}
	
	// pes header
	dest_packet_pos = mpegts_write_pes_header(
		dest_packet_pos, 
		adapt_field_flags, 
		media_type == MEDIA_TYPE_VIDEO ? MIN_VIDEO_STREAM_ID : MIN_AUDIO_STREAM_ID, 
		dest_packet_start, 
		&pes_header_size, 
		&pes_size_ptr);
	if (timestamp_offsets->pcr != NO_OFFSET)
	{
		timestamp_offsets->pcr = sizeof_mpeg_ts_header + sizeof_mpeg_ts_adaptation_field;
	}
	timestamp_offsets->pts = dest_packet_pos - dest_packet_start - 2 * sizeof_pts;
	timestamp_offsets->dts = timestamp_offsets->pts + sizeof_pts;

	for (src_packet = start_pos; src_packet <= end_pos; src_packet += TS_PACKET_LENGTH)
	{
		// skip any packets with other ids
		if (mpeg_ts_header_get_PID(src_packet) != src_pid)
		{
			continue;
		}
		
		// get the source data start/end pointers
		src_packet_pos = src_packet;
		src_packet_end = src_packet + TS_PACKET_LENGTH;
		if (src_packet_pos == start_pos)
		{
			src_packet_pos += first_packet_data_offset;
		}
		else
		{
			src_packet_pos = skip_adaptation_field((const mpeg_ts_header_t*)src_packet_pos);
			if (src_packet_pos == NULL)
			{
				return FALSE;
			}
		}
		
		while (src_packet_pos < src_packet_end)
		{
			if (dest_packet_pos >= dest_packet_end)
			{
				// start a new packet
				dest_packet_start = dest_packet_end;
				dest_packet_end = dest_packet_start + TS_PACKET_LENGTH;
				dest_packet_pos = dest_packet_start;
				output_data->write_pos += TS_PACKET_LENGTH;

				// ts header
				dest_packet_pos = mpegts_write_packet_header(dest_packet_pos, src_pid, 0, FALSE);
			}
			
			// copy as much as possible
			copy_size = MIN(src_packet_end - src_packet_pos, dest_packet_end - dest_packet_pos);
			memcpy(dest_packet_pos, src_packet_pos, copy_size);
			src_packet_pos += copy_size;
			dest_packet_pos += copy_size;
			pes_bytes_written += copy_size;
		}
	}

	// update packet size
	pes_size = sizeof_pes_optional_header + pes_header_size + pes_bytes_written;
	if (pes_size > 0xffff) 
	{
		pes_size = 0;
	}
	*pes_size_ptr++ = (u_char) (pes_size >> 8);
	*pes_size_ptr++ = (u_char) pes_size;

	// stuffing
	stuff_size = dest_packet_end - dest_packet_pos;
	if (stuff_size > 0)
	{
		dest_packet_pos = mpegts_add_stuffing(dest_packet_start, dest_packet_pos, stuff_size);

		if (output_data->write_pos == initial_write_pos + TS_PACKET_LENGTH)
		{
			timestamp_offsets->pts += stuff_size;
			timestamp_offsets->dts += stuff_size;
		}
	}
	
	return TRUE;
}

bool_t 
prepare_ts_data(
	ts_preparer_part_t* parts_start,
	size_t parts_count,
	dynamic_buffer_t* output_metadata, 
	dynamic_buffer_t* output_header, 
	dynamic_buffer_t* output_data)
{
	ts_preparer_part_t* parts_end = parts_start + parts_count;
	ts_preparer_part_t* parts_cur;
	const frame_info_t* cur_frame;
	const frame_info_t* frames_end;
	metadata_frame_info_t cur_frame_info;
	metadata_header_t metadata_header;
	dynamic_buffer_t* buffers_end;
	dynamic_buffer_t* buffers_cur;
	stream_info_t* cur_pid_info;
	const timestamps_t* cur_timestamps;
	timestamps_t* target_timestamps;
	int initial_durations[MEDIA_TYPE_COUNT];
	int durations[MEDIA_TYPE_COUNT];
	size_t total_size;
	unsigned int i;
	const byte_t* start_pos;
	const byte_t* end_pos;
	const byte_t* cur_packet;
	int buffer_start_pos;
	int next_frame_pos;
	int cur_frame_pos;
	int cur_pid;
		
	// initialize output params
	memset(output_metadata, 0, sizeof(*output_metadata));
	memset(output_header, 0, sizeof(*output_header));
	memset(output_data, 0, sizeof(*output_data));
	
	// initialize locals
	memset(&durations, 0, sizeof(durations));
	memset(&metadata_header, 0, sizeof(metadata_header));
	
	for (i = 0; i < ARRAY_ENTRIES(metadata_header.media_info); i++)
	{
		reset_timestamps(&metadata_header.media_info[i].timestamps);
	}
	
	streams_info_hash_init(&metadata_header.streams_info);
	
	// get total size and frame count
	total_size = 0;
	metadata_header.frame_count = 0;
	for (parts_cur = parts_start; parts_cur < parts_end; parts_cur++)
	{
		buffers_end = parts_cur->buffers + parts_cur->buffer_count;
		for (buffers_cur = parts_cur->buffers; buffers_cur < buffers_end; buffers_cur++)
		{
			total_size += buffers_cur->write_pos;
		}

		metadata_header.frame_count += parts_cur->frame_count;
	}

	// pre-allocate the buffers to avoid the need to realloc them later
	if (!resize_buffer(output_metadata, sizeof(metadata_header) + sizeof(cur_frame_info) * metadata_header.frame_count))
	{
		goto error;
	}

	// allocate a larger buffer to compensate for the rebuilding of packets (in case we need to add DTS timestamps)
	total_size += (DIV_CEIL(metadata_header.frame_count * sizeof_pts, TS_PACKET_LENGTH) + 10) * TS_PACKET_LENGTH;
	if (!resize_buffer(output_data, total_size))
	{
		goto error;
	}
	
	// skip the metadata header (written at the end)
	output_metadata->write_pos = sizeof(metadata_header);
		
	for (parts_cur = parts_start; parts_cur < parts_end; parts_cur++)
	{
		// Note: the frames are assumed to be sorted by file position (guaranteed by the way get_frames works)
		buffers_cur = parts_cur->buffers;
		buffers_end = parts_cur->buffers + parts_cur->buffer_count;
		buffer_start_pos = 0;

		if ((parts_cur->flags & BUFFER_FLAG_TS_HEADER) != 0 && parts_cur->frame_count > 0)
		{
			// get the ts header size
			metadata_header.ts_header_size = parts_cur->frames[0].pos + parts_cur->frames_pos_shift;
			if (metadata_header.ts_header_size > buffers_cur->write_pos)
			{
				goto error;
			}
		
			// append the ts header
			if (!append_buffer(output_header, buffers_cur->data, metadata_header.ts_header_size))
			{
				goto error;
			}
			
			metadata_header.pcr_pid = get_pcr_pid(output_header->data, output_header->write_pos);
			if (metadata_header.pcr_pid == 0)
			{
				goto error;
			}
			
			// update continuity counters info
			if (!update_streams_info(&metadata_header.streams_info, output_header->data, output_header->write_pos))
			{
				goto error;
			}
		}
		
		memcpy(initial_durations, durations, sizeof(initial_durations));
		
		frames_end = parts_cur->frames + parts_cur->frame_count;
		for (cur_frame = parts_cur->frames; cur_frame < frames_end; cur_frame++)
		{
			// find the buffer containing the current frame
			cur_frame_pos = cur_frame->pos + parts_cur->frames_pos_shift;
			while (cur_frame_pos >= (int)(buffer_start_pos + buffers_cur->write_pos))
			{
				buffer_start_pos += buffers_cur->write_pos;
				buffers_cur++;
				if (buffers_cur >= buffers_end)
				{
					goto error;
				}
			}
			
			if (cur_frame_pos < buffer_start_pos)
			{
				goto error;
			}
			
			// initialize TS packet start / end pos
			start_pos = buffers_cur->data + cur_frame_pos - buffer_start_pos;
			if (cur_frame + 1 < frames_end)
			{
				next_frame_pos = cur_frame[1].pos + parts_cur->frames_pos_shift;
				if (next_frame_pos < buffer_start_pos)
				{
					goto error;
				}
				
				if (next_frame_pos > (int)(buffer_start_pos + buffers_cur->write_pos))
				{
					// the next frame is in the next buffer
					end_pos = buffers_cur->data + buffers_cur->write_pos;
				}
				else
				{
					// current frame runs until the start pos of the next frame
					end_pos = buffers_cur->data + next_frame_pos - buffer_start_pos;
				}
			}
			else
			{
				// it's the last frame, read until end of buffer
				end_pos = buffers_cur->data + buffers_cur->write_pos;
			}
			end_pos -= TS_PACKET_LENGTH;		// in case the input is somehow not a multiple of packets, avoid overflow
			
			if (start_pos > end_pos)
			{
				continue;
			}
				
			// save the frame start position
			cur_frame_info.pos = output_data->write_pos;

			// update audio / video pids
			cur_pid = mpeg_ts_header_get_PID(start_pos);
			if ((parts_cur->flags & BUFFER_FLAG_TS_HEADER) != 0)
			{
				metadata_header.media_info[cur_frame->media_type].pid = cur_pid;
			}

			cur_pid_info = streams_info_hash_get(&metadata_header.streams_info, cur_pid);
			if (cur_pid_info == NULL)
			{
				goto error;
			}

			cur_frame_info.timestamp_offsets = cur_frame->timestamp_offsets;
			
			if (cur_frame->timestamp_offsets.dts == NO_OFFSET && 
				(parts_cur->flags & BUFFER_FLAG_FILTER_MEDIA_STREAMS) != 0 &&
				(parts_cur->flags & (BUFFER_FLAG_UPDATE_CCS | BUFFER_FLAG_FIXED_TIMESTAMPS)) == 0)
			{
				// rebuild the frame in order to add a dts timestamp to it
				if (!rebuild_frame(
					start_pos,
					end_pos,
					cur_frame->media_type,
					&cur_frame_info.timestamp_offsets,
					cur_pid,
					output_data))
				{
					goto error;
				}
			}
			else
			{
				// copy the packet, optionally filter only the relevant stream id (remove for example PAT/PMT)
				for (cur_packet = start_pos; cur_packet <= end_pos; cur_packet += TS_PACKET_LENGTH)
				{
					if (mpeg_ts_header_get_PID(cur_packet) != cur_pid)
					{
						if ((parts_cur->flags & BUFFER_FLAG_FILTER_MEDIA_STREAMS) != 0)
						{
							continue;
						}
					}
					else if ((parts_cur->flags & BUFFER_FLAG_UPDATE_CCS) != 0)
					{
						cur_pid_info->end_cc = mpeg_ts_header_get_continuityCounter(cur_packet);
						if (cur_pid_info->start_cc == INVALID_CONTINUITY_COUNTER)
						{
							cur_pid_info->start_cc = cur_pid_info->end_cc;
						}
					}
						
					if (!append_buffer(output_data, cur_packet, TS_PACKET_LENGTH))
					{
						goto error;
					}
				}
			}

			// initialize frame info
			cur_frame_info.size = output_data->write_pos - cur_frame_info.pos;
			cur_frame_info.duration = cur_frame->duration;
			cur_frame_info.media_type = cur_frame->media_type;
			cur_frame_info.is_iframe = cur_frame->is_iframe;
			cur_frame_info.src_pid = cur_pid;
			
			// remove the timestamp offsets in case the fixed timestamps flag is on
			if ((parts_cur->flags & BUFFER_FLAG_FIXED_TIMESTAMPS) != 0)
			{			
				cur_frame_info.timestamp_offsets.pcr = NO_OFFSET;
				cur_frame_info.timestamp_offsets.pts = NO_OFFSET;
				cur_frame_info.timestamp_offsets.dts = NO_OFFSET;
			}
			
			// update timestamps
			cur_timestamps = &cur_frame->timestamps;
			target_timestamps = &metadata_header.media_info[cur_frame->media_type].timestamps;
			
			if ((parts_cur->flags & BUFFER_FLAG_TIMESTAMPS_REF_START) != 0 && 
				cur_timestamps->pts != NO_TIMESTAMP)
			{				
				// save the first pcr -> pts diff
				if (target_timestamps->pcr == NO_TIMESTAMP && cur_timestamps->pcr != NO_TIMESTAMP)
				{
					target_timestamps->pcr = cur_timestamps->pcr - cur_timestamps->pts;
				}

				// pts = min(pts, cur frame start pts)
				if (target_timestamps->pts == NO_TIMESTAMP || cur_timestamps->pts < target_timestamps->pts)
				{
					target_timestamps->pts = cur_timestamps->pts;
				}
				
				// dts = min(dts, cur frame start dts)
				if (target_timestamps->dts == NO_TIMESTAMP || cur_timestamps->dts < target_timestamps->dts)
				{
					target_timestamps->dts = cur_timestamps->dts;
				}
			}
			else if ((parts_cur->flags & BUFFER_FLAG_TIMESTAMPS_REF_END) != 0 && 
				cur_timestamps->pts != NO_TIMESTAMP)
			{				
				// save the last pcr -> pts diff
				if (cur_timestamps->pcr != NO_TIMESTAMP)
				{
					target_timestamps->pcr = cur_timestamps->pcr - cur_timestamps->pts;
				}

				// pts = max(pts, cur frame end pts)
				if (target_timestamps->pts == NO_TIMESTAMP || 
					cur_timestamps->pts + cur_frame->duration > target_timestamps->pts)
				{
					target_timestamps->pts = cur_timestamps->pts + cur_frame->duration;
				}
				
				// dts = max(dts, cur frame end dts)
				if (target_timestamps->dts == NO_TIMESTAMP || 
					cur_timestamps->dts + cur_frame->duration > target_timestamps->dts)
				{
					target_timestamps->dts = cur_timestamps->dts + cur_frame->duration;
				}
			}
			
			// append frame info
			if (!append_buffer(output_metadata, PS(cur_frame_info)))
			{
				goto error;
			}
			durations[cur_frame->media_type] += cur_frame->duration;
		}
		
		if ((parts_cur->flags & (BUFFER_FLAG_TIMESTAMPS_REF_START | BUFFER_FLAG_TIMESTAMPS_REF_END)) != 0)
		{
			for (i = 0; i < ARRAY_ENTRIES(metadata_header.media_info); i++)
			{
				target_timestamps = &metadata_header.media_info[i].timestamps;
				
				// align the pts & dts to the beginning of the first part
				if ((parts_cur->flags & BUFFER_FLAG_TIMESTAMPS_REF_START) != 0)
				{
					if (target_timestamps->pts != NO_TIMESTAMP)
					{
						target_timestamps->pts -= initial_durations[i];
					}
					
					if (target_timestamps->dts != NO_TIMESTAMP)
					{
						target_timestamps->dts -= initial_durations[i];
					}
				}
				else if ((parts_cur->flags & BUFFER_FLAG_TIMESTAMPS_REF_END) != 0)
				{
					if (target_timestamps->pts != NO_TIMESTAMP)
					{
						target_timestamps->pts -= durations[i];
					}
					
					if (target_timestamps->dts != NO_TIMESTAMP)
					{
						target_timestamps->dts -= durations[i];
					}
				}
				
				// make the pcr absolute
				if (target_timestamps->pts != NO_TIMESTAMP)
				{
					if (target_timestamps->pcr != NO_TIMESTAMP)
					{
						target_timestamps->pcr += target_timestamps->pts;
					}
					else
					{
						target_timestamps->pcr = target_timestamps->pts - DEFAULT_PCR_PTS_OFFSET;
					}
				}
			}
		}
	}
	
	// update the metadata header
	metadata_header.data_size = output_data->write_pos;
	for (i = 0; i < ARRAY_ENTRIES(metadata_header.media_info); i++)
	{
		metadata_header.media_info[i].duration = durations[i];
	}
	memcpy(output_metadata->data, PS(metadata_header));
		
	return TRUE;
	
error:

	free_buffer(output_metadata);
	free_buffer(output_header);
	free_buffer(output_data);

	return FALSE;
}
