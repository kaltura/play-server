#include <limits.h>
#include <string.h>
#include "ts_stitcher_impl.h"
#include "mpegTsStreamInfo.h"
#include "mpegTsMetadata.h"
#include "dynamicBuffer.h"
#include "mpegTs.h"

typedef struct {
	streams_info_t streams_info;
} output_header_t;

typedef struct {
	uint32_t layout_size;
	uint32_t pos;
	uint32_t size;
	uint8_t state;
	uint8_t pcr_offset;
	uint8_t pts_offset;
	uint8_t dts_offset;
	uint16_t pid;
	uint8_t last_packet;
	uint8_t padding;
	
	/*uint8_t pcr[sizeof_pcr];
	uint8_t pts[sizeof_pts];
	uint8_t dts[sizeof_pts];*/
} output_packet_t;

void init_output_header(
	output_header_t* output_header, 
	const metadata_header_t* pre_ad_header, 
	const metadata_header_t* post_ad_header, 
	int32_t segment_index,
	int32_t output_end)
{
	stream_info_t* streams_data_start = output_header->streams_info.data;
	stream_info_t* streams_data_end = streams_data_start + STREAMS_INFO_HASH_SIZE;
	stream_info_t* streams_data;
	bool_t is_media_pid;

	output_header->streams_info = pre_ad_header->streams_info;
	
	for (streams_data = streams_data_start; streams_data < streams_data_end; streams_data++)
	{
		if (streams_data->pid == INVALID_PID)
			continue;
	
		is_media_pid = streams_data->pid != 0 && 
			(pre_ad_header->media_info[MEDIA_TYPE_VIDEO].pid == streams_data->pid || 
			 pre_ad_header->media_info[MEDIA_TYPE_AUDIO].pid == streams_data->pid);
					 
		if (!is_media_pid)
		{
			int cc_shift = segment_index * (streams_data->end_cc + 1 - streams_data->start_cc);
			streams_data->start_cc += cc_shift;
			streams_data->end_cc += cc_shift;
		}
		else
		{
			streams_data->end_cc = streams_data->start_cc - 1;
		}
		
		if (output_end == 0)
		{		
			streams_data->end_cc = post_ad_header->streams_info.data[streams_data - streams_data_start].end_cc;
		}
		
		streams_data->start_cc &= 0x0F;
		streams_data->end_cc &= 0x0F;		
	}
}

bool_t build_layout_impl(
	dynamic_buffer_t* result,
	metadata_header_t* pre_ad_header,
	metadata_header_t* ad_header,
	metadata_header_t* black_header,
	metadata_header_t* post_ad_header,
	int32_t segment_index,
	int32_t output_start,
	int32_t output_end)
{
	// input videos
	metadata_frame_info_t* pre_ad_ts_frames = 	(metadata_frame_info_t*)(pre_ad_header + 1);
	metadata_frame_info_t* ad_ts_frames = 	(metadata_frame_info_t*)(ad_header + 1);
	metadata_frame_info_t* black_ts_frames = 	(metadata_frame_info_t*)(black_header + 1);
	metadata_frame_info_t* post_ad_ts_frames = (metadata_frame_info_t*)(post_ad_header + 1);
	int main_media_type = ((pre_ad_header->media_info[MEDIA_TYPE_VIDEO].pid != 0) ? MEDIA_TYPE_VIDEO : MEDIA_TYPE_AUDIO);
	int32_t ad_slot_end_pos[MEDIA_TYPE_COUNT];
	metadata_header_t null_metadata_header;
	
	// current state
	int cur_state = STATE_PRE_AD;		// ++ doesn't work for enums in cpp
	uint32_t frame_index = 0;	
	bool_t output_frames = FALSE;
	int32_t cur_pos[MEDIA_TYPE_COUNT] = { 0 };
	timestamps_t timestamps[MEDIA_TYPE_COUNT];
	uint32_t last_packet_pos[MEDIA_TYPE_COUNT] = { 0 };

	// temporary vars
	metadata_frame_info_t* next_frame;
	int media_type;
	bool_t try_media_type[MEDIA_TYPE_COUNT];
	output_packet_t output_packet;
	uint32_t packet_start_pos;
	output_header_t output_header;
	
	// init locals
	if (post_ad_header != NULL)
	{
		ad_slot_end_pos[MEDIA_TYPE_VIDEO] = (int32_t)((post_ad_header->media_info[MEDIA_TYPE_VIDEO].timestamps.pts - pre_ad_header->media_info[MEDIA_TYPE_VIDEO].timestamps.pts) & ((1LL << 33) - 1));
		ad_slot_end_pos[MEDIA_TYPE_AUDIO] = (int32_t)((post_ad_header->media_info[MEDIA_TYPE_AUDIO].timestamps.pts - pre_ad_header->media_info[MEDIA_TYPE_AUDIO].timestamps.pts) & ((1LL << 33) - 1));
	}
	else
	{
		ad_slot_end_pos[MEDIA_TYPE_VIDEO] = INT_MAX;
		ad_slot_end_pos[MEDIA_TYPE_AUDIO] = INT_MAX;
	}
		
	timestamps[MEDIA_TYPE_VIDEO] = pre_ad_header->media_info[MEDIA_TYPE_VIDEO].timestamps;
	timestamps[MEDIA_TYPE_AUDIO] = pre_ad_header->media_info[MEDIA_TYPE_AUDIO].timestamps;
		
	if (ad_header == NULL)
	{
		memset(&null_metadata_header, 0, sizeof(null_metadata_header));
		ad_header = &null_metadata_header;
	}
		
	// append the output header
	init_output_header(&output_header, pre_ad_header, post_ad_header, segment_index, output_end);
	if (!append_buffer(result, PS(output_header)))
	{
		// XXXX handle this
	}	
	
	// output the ts header
	memset(&output_packet, 0, sizeof(output_packet));
	output_packet.layout_size = sizeof(output_packet);
	output_packet.state = STATE_PRE_AD_HEADER;
	if (!append_buffer(result, &output_packet, sizeof(output_packet)))
	{
		// XXXX handle this
	}
	
	if (!output_end)
	{
		output_end = INT_MAX;
	}
	
	for (;;)
	{
		// check for output start / end
		if (cur_pos[main_media_type] > output_end)
		{
			break;
		}
		else if (cur_pos[main_media_type] >= output_start && !output_frames)
		{
			output_frames = TRUE;
			
			if (timestamps[MEDIA_TYPE_VIDEO].pcr != NO_TIMESTAMP)
				timestamps[MEDIA_TYPE_VIDEO].pcr += cur_pos[MEDIA_TYPE_VIDEO];
			if (timestamps[MEDIA_TYPE_VIDEO].pts != NO_TIMESTAMP)
				timestamps[MEDIA_TYPE_VIDEO].pts += cur_pos[MEDIA_TYPE_VIDEO];
			if (timestamps[MEDIA_TYPE_VIDEO].dts != NO_TIMESTAMP)
				timestamps[MEDIA_TYPE_VIDEO].dts += cur_pos[MEDIA_TYPE_VIDEO];
			
			if (timestamps[MEDIA_TYPE_AUDIO].pcr != NO_TIMESTAMP)
				timestamps[MEDIA_TYPE_AUDIO].pcr += cur_pos[MEDIA_TYPE_AUDIO];
			if (timestamps[MEDIA_TYPE_AUDIO].pts != NO_TIMESTAMP)
				timestamps[MEDIA_TYPE_AUDIO].pts += cur_pos[MEDIA_TYPE_AUDIO];
			if (timestamps[MEDIA_TYPE_AUDIO].dts != NO_TIMESTAMP)
				timestamps[MEDIA_TYPE_AUDIO].dts += cur_pos[MEDIA_TYPE_AUDIO];
		}
		
		// get the next frame to output
		next_frame = NULL;
		
		switch (cur_state)
		{
		case STATE_PRE_AD:
			if (frame_index < pre_ad_header->frame_count)
			{
				next_frame = &pre_ad_ts_frames[frame_index];
				break;
			}

			cur_state++;
			frame_index = 0;
			/* fallthrough */
		
		case STATE_AD:
			try_media_type[MEDIA_TYPE_VIDEO] = ad_header->media_info[MEDIA_TYPE_VIDEO].pid;		// the pid is 0 when there is no video
			try_media_type[MEDIA_TYPE_AUDIO] = ad_header->media_info[MEDIA_TYPE_AUDIO].pid;
			for (;;)
			{
				if (frame_index >= ad_header->frame_count)
				{
					next_frame = NULL;
					break;
				}
				next_frame = &ad_ts_frames[frame_index];
				media_type = next_frame->media_type;
				if (try_media_type[media_type])
				{
					if (cur_pos[media_type] + (int32_t)next_frame->duration <= ad_slot_end_pos[media_type])
					{
						break;
					}
					try_media_type[media_type] = FALSE;
				}
				if (!try_media_type[MEDIA_TYPE_VIDEO] && !try_media_type[MEDIA_TYPE_AUDIO])
				{
					next_frame = NULL;
					break;
				}
				frame_index++;
			}
			if (next_frame != NULL)
			{
				break;
			}
			
			cur_state++;
			frame_index = 0;
			/* fallthrough */
		
		case STATE_PAD:
			try_media_type[MEDIA_TYPE_VIDEO] = black_header->media_info[MEDIA_TYPE_VIDEO].pid;
			try_media_type[MEDIA_TYPE_AUDIO] = black_header->media_info[MEDIA_TYPE_AUDIO].pid;
			for (;;)
			{
				if (frame_index >= black_header->frame_count)
				{
					frame_index -= black_header->frame_count;
				}
					
				next_frame = &black_ts_frames[frame_index];
				media_type = next_frame->media_type;
				if (try_media_type[media_type])
				{
					if (cur_pos[media_type] + (int32_t)next_frame->duration <= ad_slot_end_pos[media_type])
					{
						break;
					}
					try_media_type[media_type] = FALSE;
				}
				if (!try_media_type[MEDIA_TYPE_VIDEO] && !try_media_type[MEDIA_TYPE_AUDIO])
				{
					next_frame = NULL;
					break;
				}
				frame_index++;
			}
			if (next_frame != NULL)
			{
				break;
			}
				
			cur_state++;
			frame_index = 0;
			/* fallthrough */

		case STATE_POST_AD:
			if (frame_index < post_ad_header->frame_count)
			{
				next_frame = &post_ad_ts_frames[frame_index];
				break;
			}
		}
		
		if (next_frame == NULL)
		{
			break;
		}
			
		// update pos and frame index
		media_type = next_frame->media_type;
		cur_pos[media_type] += next_frame->duration;
		frame_index++;
		
		if (!output_frames)
		{
			continue;
		}
			
		// leave room for the packet header
		packet_start_pos = result->write_pos;
		if (!alloc_buffer_space(result, sizeof(output_packet) + sizeof_pcr + 2 * sizeof_pts))
		{
			// XXXX handle this
		}
		result->write_pos += sizeof(output_packet);

		// output the timestamps
		output_packet.pcr_offset = NO_OFFSET;
		if (timestamps[media_type].pcr != NO_TIMESTAMP)
		{
			if (next_frame->timestamp_offsets.pcr != NO_OFFSET)
			{
				output_packet.pcr_offset = next_frame->timestamp_offsets.pcr;
				set_pcr(result->data + result->write_pos, timestamps[media_type].pcr);
				result->write_pos += sizeof_pcr;
			}
			timestamps[media_type].pcr += next_frame->duration;
		}
		
		output_packet.pts_offset = NO_OFFSET;
		if (timestamps[media_type].pts != NO_TIMESTAMP)
		{
			if (next_frame->timestamp_offsets.pts != NO_OFFSET)
			{
				output_packet.pts_offset = next_frame->timestamp_offsets.pts;
				set_pts(result->data + result->write_pos, next_frame->timestamp_offsets.dts != NO_OFFSET ? PTS_BOTH_PTS : PTS_ONLY_PTS, timestamps[media_type].pts);
				result->write_pos += sizeof_pts;
			}
			timestamps[media_type].pts += next_frame->duration;
		}

		output_packet.dts_offset = NO_OFFSET;
		if (timestamps[media_type].dts != NO_TIMESTAMP)
		{
			if (next_frame->timestamp_offsets.dts != NO_OFFSET)
			{
				output_packet.dts_offset = next_frame->timestamp_offsets.dts;
				set_pts(result->data + result->write_pos, PTS_BOTH_DTS, timestamps[media_type].dts);
				result->write_pos += sizeof_pts;
			}
			timestamps[media_type].dts += next_frame->duration;
		}

		// write the packet header
		output_packet.layout_size = result->write_pos - packet_start_pos;
		output_packet.pos = next_frame->pos;
		output_packet.size = next_frame->size;
		output_packet.state = cur_state;
		output_packet.pid = pre_ad_header->media_info[media_type].pid;
		memcpy(result->data + packet_start_pos, PS(output_packet));
		
		// update last packet per media type
		last_packet_pos[media_type] = packet_start_pos;
	}
	
	// mark the last packet of each media type
	if (last_packet_pos[MEDIA_TYPE_VIDEO] != 0)
	{
		((output_packet_t*)(result->data + last_packet_pos[MEDIA_TYPE_VIDEO]))->last_packet = TRUE;
	}

	if (last_packet_pos[MEDIA_TYPE_AUDIO] != 0)
	{
		((output_packet_t*)(result->data + last_packet_pos[MEDIA_TYPE_AUDIO]))->last_packet = TRUE;
	}
	
	return TRUE;
}

byte_t* create_null_packets(stream_info_t* stream_info, size_t* result_buffer_size)
{
	static const char null_packet_header[] = { 0x47, 0x00, 0x00, 0x30, 0xB7, 0x00 };
	byte_t* cur_pos;
	byte_t* end_pos;
	byte_t* result;
	size_t buffer_size;
	int packet_count;

	*result_buffer_size = 0;
	
	stream_info->start_cc &= 0x0F;
	packet_count = (stream_info->end_cc - stream_info->start_cc + 1) & 0x0F;
	if (packet_count == 0)
	{
		return NULL;
	}
	
	buffer_size = packet_count * TS_PACKET_LENGTH;
	
	result = (byte_t*)malloc(buffer_size);
	if (result == NULL)
	{
		return NULL;
	}
	
	memset(result, 0xFF, buffer_size);

	end_pos = result + buffer_size;
	
	for (cur_pos = result; cur_pos < end_pos; cur_pos += TS_PACKET_LENGTH)
	{
		memcpy(cur_pos, PS(null_packet_header));
		
		mpeg_ts_header_set_PID(cur_pos, stream_info->pid);
		
		stream_info->start_cc &= 0x0F;
		mpeg_ts_header_set_continuityCounter(cur_pos, stream_info->start_cc);
		stream_info->start_cc++;
	}
	
	*result_buffer_size = buffer_size;
	
	return result;
}

void fix_continuity_counters(streams_info_t* streams_info, byte_t* buffer, uint32_t size)
{
	stream_info_t* stream_info;
	byte_t* end_pos = buffer + size;
	byte_t* cur_pos;
	
	for (cur_pos = buffer; cur_pos < end_pos; cur_pos += TS_PACKET_LENGTH)
	{
		stream_info = streams_info_hash_get(streams_info, mpeg_ts_header_get_PID(cur_pos));
		if (stream_info == NULL)
		{
			continue;
		}
		
		stream_info->start_cc &= 0x0F;
		mpeg_ts_header_set_continuityCounter(cur_pos, stream_info->start_cc);
		stream_info->start_cc++;		
	}
}

void process_chunk_impl(
	// input
	byte_t* layout_buffer,
	uint32_t layout_size,
	
	// inout
	byte_t* chunk_buffer,
	uint32_t chunk_size,
	output_state_t* output_state,
	
	// output
	process_output_t* output)
{
	output_header_t* output_header = (output_header_t*)layout_buffer;
	output_packet_t* cur_packet;
	stream_info_t* stream_info;
	byte_t* cur_pos = layout_buffer + output_state->layout_pos;
	byte_t* end_pos = layout_buffer + layout_size;
	byte_t* packet_chunk_pos;
	byte_t* cur_ts_packet;
	bool_t first_output = TRUE;
	uint32_t packet_start_offset;
	uint32_t packet_end_offset;
	uint32_t cur_offset;
	
	// init output
	memset(output, 0, sizeof(*output));
	output->more_data_needed = TRUE;
	
	if (chunk_size == 0)
	{
		// first call - init state
		cur_packet = (output_packet_t*)(layout_buffer + sizeof(output_header_t));
		output_state->layout_pos = sizeof(output_header_t);
		output_state->chunk_type = cur_packet->state;
		output_state->chunk_start_offset = cur_packet->pos;
		return;
	}
	
	while (cur_pos + sizeof(output_packet_t) <= end_pos)
	{
		// get current packet from layout buffer
		cur_packet = (output_packet_t*)cur_pos;
		if (cur_pos + cur_packet->layout_size > end_pos)
			break;		// unexpected - the layout buffer is invalid

		cur_pos += sizeof(*cur_packet);
		
		if (cur_packet->state == STATE_PRE_AD_HEADER && 
			cur_packet->state == output_state->chunk_type)
		{
			// got a header buffer - output it as a whole, and move to the next packet
			fix_continuity_counters(&output_header->streams_info, chunk_buffer, chunk_size);
			output->chunk_output_end = chunk_size;
			output_state->layout_pos += cur_packet->layout_size;
			cur_pos = layout_buffer + output_state->layout_pos;
			continue;
		}
		
		if (cur_packet->state != output_state->chunk_type || 
			cur_packet->pos >= output_state->chunk_start_offset + chunk_size ||
			cur_packet->pos + cur_packet->size <= output_state->chunk_start_offset)
		{
			// nothing to output from this chunk
			output_state->chunk_type = cur_packet->state;
			output_state->chunk_start_offset = cur_packet->pos;
			return;
		}
				
		// update output offsets
		packet_start_offset = (cur_packet->pos > output_state->chunk_start_offset ? cur_packet->pos - output_state->chunk_start_offset : 0);
		packet_end_offset = MIN(cur_packet->pos + cur_packet->size - output_state->chunk_start_offset, chunk_size);

		if (first_output)
		{
			output->chunk_output_start = packet_start_offset;
			first_output = FALSE;
		}
		else if (packet_start_offset != output->chunk_output_end)
		{
			// the packet is not adjacent to the last packet, write whatever we have so far first
			output->more_data_needed = FALSE;
			return;
		}
		output->chunk_output_end = packet_end_offset;
		
		// update timestamps if we have the beginning of the packet
		if (cur_packet->pos >= output_state->chunk_start_offset)
		{
			packet_chunk_pos = chunk_buffer + cur_packet->pos - output_state->chunk_start_offset;
			if (cur_packet->pcr_offset != NO_OFFSET)
			{
				memcpy(packet_chunk_pos + cur_packet->pcr_offset, cur_pos, sizeof_pcr);
				cur_pos += sizeof_pcr;
			}
			if (cur_packet->pts_offset != NO_OFFSET)
			{
				memcpy(packet_chunk_pos + cur_packet->pts_offset, cur_pos, sizeof_pts);
				cur_pos += sizeof_pts;
			}
			if (cur_packet->dts_offset != NO_OFFSET)
			{
				memcpy(packet_chunk_pos + cur_packet->dts_offset, cur_pos, sizeof_pts);
				cur_pos += sizeof_pts;
			}
		}

		// update continuity counters and PID
		stream_info = streams_info_hash_get(&output_header->streams_info, cur_packet->pid);
		for (cur_offset = packet_start_offset; cur_offset < packet_end_offset; cur_offset += TS_PACKET_LENGTH)
		{
			cur_ts_packet = chunk_buffer + cur_offset;
			
			mpeg_ts_header_set_PID(cur_ts_packet, cur_packet->pid);
			
			if (stream_info != NULL)
			{
				stream_info->start_cc &= 0x0F;
				mpeg_ts_header_set_continuityCounter(cur_ts_packet, stream_info->start_cc);
				stream_info->start_cc++;
			}
		}
				
		if (cur_packet->pos + cur_packet->size != output_state->chunk_start_offset + output->chunk_output_end)
		{
			// need the next chunk to complete the packet
			output_state->chunk_start_offset += chunk_size;
			return;
		}
		
		// finished the packet
		output_state->layout_pos += cur_packet->layout_size;
		cur_pos = layout_buffer + output_state->layout_pos;
		
		if (cur_packet->last_packet)
		{
			// it's the last packet of the stream - output null packets to adjust the continuity counters
			output->output_buffer = create_null_packets(stream_info, &output->output_buffer_size);
			if (output->output_buffer != NULL)
			{
				// output the null packets before continuing
				output->more_data_needed = FALSE;
				return;
			}
		}
	}
	
	// we're done
	output_state->chunk_type = STATE_INVALID;
}

bool_t is_metadata_buffer_valid(const void* buffer, size_t size)
{
	if (size < sizeof(metadata_header_t))
	{
		return FALSE;
	}
	
	if (size < sizeof(metadata_header_t) + ((metadata_header_t*)buffer)->frame_count * sizeof(metadata_frame_info_t))
	{
		return FALSE;
	}
	
	return TRUE;
}

uint32_t get_chunk_count(const void* metadata)
{
	return ((metadata_header_t*)metadata)->chunk_count;
}
