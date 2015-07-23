#include <stdlib.h>
#include <limits.h>
#include <string.h>
#include "ts_stitcher_impl.h"
#include "mpegTsStreamInfo.h"
#include "mpegTsMetadata.h"
#include "dynamicBuffer.h"
#include "mpegTs.h"

// the maximum amount we can move output_start/output_end in order to make the segments start on key frame
#define MAX_KEY_FRAME_SNAP_TIME_DIFF (90000)			// 1 second

typedef struct {
	int32_t chunk_type;
	const metadata_header_t* metadata_header;
	const metadata_frame_info_t* frames;
	int32_t start_pos[MEDIA_TYPE_COUNT];
	int32_t end_pos[MEDIA_TYPE_COUNT];
	bool_t cyclic;
} internal_ad_section_t;

typedef struct {
	internal_ad_section_t* ad_section;
	uint32_t frame_index;
	int32_t pos[MEDIA_TYPE_COUNT];
	uint32_t processed_frames;
	
	// ad_section fields (copied in order to reduce pointer dereferences)
	uint32_t ad_section_frame_count;
	const metadata_frame_info_t* ad_section_frames;
	int32_t ad_section_end_pos[MEDIA_TYPE_COUNT];
	bool_t ad_section_cyclic;
	bool_t ad_section_has_media_type[MEDIA_TYPE_COUNT];
	int ad_section_main_media_type;
} build_layout_state_t;

typedef struct {
	streams_info_t streams_info;
	uint16_t pcr_pid;
} output_header_t;

typedef struct {
	uint32_t layout_size;
	uint32_t pos;
	uint32_t size;
	int32_t chunk_type;
	uint16_t src_pid;
	uint16_t dst_pid;
	uint8_t pcr_offset;
	uint8_t pts_offset;
	uint8_t dts_offset;
	uint8_t last_packet;
	uint8_t padding[2];
	
	//uint8_t pcr[sizeof_pcr];			// if pcr_offset != NO_OFFSET
	//uint8_t pts[sizeof_pts];			// if pts_offset != NO_OFFSET
	//uint8_t dts[sizeof_pts];			// if dts_offset != NO_OFFSET
} output_packet_t;

static internal_ad_section_t* 
convert_external_layout_to_internal(
	const metadata_header_t* pre_ad_header, 
	const metadata_header_t* post_ad_header, 
	ad_section_t* ad_sections_start,
	int ad_sections_count,
	int* internal_ad_sections_count)
{
	ad_section_t* ad_sections_end = ad_sections_start + ad_sections_count;
	internal_ad_section_t* result;
	internal_ad_section_t* cur_output_section;
	ad_section_t* ad_section;
	int32_t cur_pos[MEDIA_TYPE_COUNT];
	int32_t end_pos[MEDIA_TYPE_COUNT];
	int32_t pad_size[MEDIA_TYPE_COUNT];
	int32_t post_start_pos[MEDIA_TYPE_COUNT];
	int32_t cur_pad_size;
	
	result = malloc(sizeof(result[0]) * (3 * ad_sections_count + 2));
	if (result == NULL)
	{
		return NULL;
	}
	cur_output_section = result;
	
	// calculate the post ad position
	if (post_ad_header != NULL)
	{
		post_start_pos[MEDIA_TYPE_VIDEO] = (int32_t)((post_ad_header->media_info[MEDIA_TYPE_VIDEO].timestamps.pts - pre_ad_header->media_info[MEDIA_TYPE_VIDEO].timestamps.pts) & ((1LL << 33) - 1));
		post_start_pos[MEDIA_TYPE_AUDIO] = (int32_t)((post_ad_header->media_info[MEDIA_TYPE_AUDIO].timestamps.pts - pre_ad_header->media_info[MEDIA_TYPE_AUDIO].timestamps.pts) & ((1LL << 33) - 1));
	}
	else
	{
		post_start_pos[MEDIA_TYPE_VIDEO] = INT_MAX;
		post_start_pos[MEDIA_TYPE_AUDIO] = INT_MAX;
	}
	
	// add the pre ad section
	cur_output_section->chunk_type = CHUNK_TYPE_PRE_AD;
	cur_output_section->cyclic = FALSE;
	cur_output_section->metadata_header = pre_ad_header;
	cur_output_section->frames = (metadata_frame_info_t*)(cur_output_section->metadata_header + 1);
	memset(cur_output_section->start_pos, 0, sizeof(cur_output_section->start_pos));
	cur_pos[MEDIA_TYPE_VIDEO] = pre_ad_header->media_info[MEDIA_TYPE_VIDEO].duration;	
	cur_pos[MEDIA_TYPE_AUDIO] = pre_ad_header->media_info[MEDIA_TYPE_AUDIO].duration;
	cur_output_section->end_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
	cur_output_section->end_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
	cur_output_section++;
	
	for (ad_section = ad_sections_start; ad_section < ad_sections_end; ad_section++)
	{
		if (ad_section->start_pos != 0)
		{
			// pre-set start position is configured -> use it
			cur_pos[MEDIA_TYPE_VIDEO] = ad_section->start_pos;
			cur_pos[MEDIA_TYPE_AUDIO] = ad_section->start_pos;
		}
		
		if (ad_section->end_pos != 0)
		{
			// pre-set end position is configured -> use it
			end_pos[MEDIA_TYPE_VIDEO] = ad_section->end_pos;
			end_pos[MEDIA_TYPE_AUDIO] = ad_section->end_pos;
		}
		else 
		{
			// set the end position to the end of the current ad
			end_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
			end_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];

			if (ad_section->ad_header != NULL)
			{
				end_pos[MEDIA_TYPE_VIDEO] += ad_section->ad_header->media_info[MEDIA_TYPE_VIDEO].duration;
				end_pos[MEDIA_TYPE_AUDIO] += ad_section->ad_header->media_info[MEDIA_TYPE_AUDIO].duration;
			}
		}
		
		// make sure we don't reach the post start
		cur_pos[MEDIA_TYPE_VIDEO] = MIN(cur_pos[MEDIA_TYPE_VIDEO], post_start_pos[MEDIA_TYPE_VIDEO]);
		cur_pos[MEDIA_TYPE_AUDIO] = MIN(cur_pos[MEDIA_TYPE_AUDIO], post_start_pos[MEDIA_TYPE_AUDIO]);
		end_pos[MEDIA_TYPE_VIDEO] = MIN(end_pos[MEDIA_TYPE_VIDEO], post_start_pos[MEDIA_TYPE_VIDEO]);
		end_pos[MEDIA_TYPE_AUDIO] = MIN(end_pos[MEDIA_TYPE_AUDIO], post_start_pos[MEDIA_TYPE_AUDIO]);
		
		if (ad_section->ad_header != NULL)
		{
			if (ad_section->alignment != ALIGN_LEFT)
			{
				// check whether we need a pre ad filler
				pad_size[MEDIA_TYPE_VIDEO] = end_pos[MEDIA_TYPE_VIDEO] - (cur_pos[MEDIA_TYPE_VIDEO] + ad_section->ad_header->media_info[MEDIA_TYPE_VIDEO].duration);
				pad_size[MEDIA_TYPE_AUDIO] = end_pos[MEDIA_TYPE_AUDIO] - (cur_pos[MEDIA_TYPE_AUDIO] + ad_section->ad_header->media_info[MEDIA_TYPE_AUDIO].duration);
				
				if (pad_size[MEDIA_TYPE_VIDEO] > 0 && pad_size[MEDIA_TYPE_AUDIO] > 0)
				{
					cur_pad_size = MIN(pad_size[MEDIA_TYPE_VIDEO], pad_size[MEDIA_TYPE_AUDIO]);
					if (ad_section->alignment == ALIGN_MIDDLE)
					{
						cur_pad_size /= 2;
					}
					
					// pre ad filler
					cur_output_section->chunk_type = ad_section->filler_chunk_type;
					cur_output_section->cyclic = TRUE;
					cur_output_section->metadata_header = ad_section->filler_header;
					cur_output_section->frames = (metadata_frame_info_t*)(cur_output_section->metadata_header + 1);
					cur_output_section->start_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
					cur_output_section->start_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
					cur_pos[MEDIA_TYPE_VIDEO] += cur_pad_size;
					cur_pos[MEDIA_TYPE_AUDIO] += cur_pad_size;
					cur_output_section->end_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
					cur_output_section->end_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
					cur_output_section++;			
				}
			}
			
			// ad
			cur_output_section->chunk_type = ad_section->ad_chunk_type;
			cur_output_section->cyclic = FALSE;
			cur_output_section->metadata_header = ad_section->ad_header;
			cur_output_section->frames = (metadata_frame_info_t*)(cur_output_section->metadata_header + 1);
			cur_output_section->start_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
			cur_output_section->start_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
			cur_pos[MEDIA_TYPE_VIDEO] = MIN(end_pos[MEDIA_TYPE_VIDEO], cur_pos[MEDIA_TYPE_VIDEO] + ad_section->ad_header->media_info[MEDIA_TYPE_VIDEO].duration);
			cur_pos[MEDIA_TYPE_AUDIO] = MIN(end_pos[MEDIA_TYPE_AUDIO], cur_pos[MEDIA_TYPE_AUDIO] + ad_section->ad_header->media_info[MEDIA_TYPE_AUDIO].duration);
			cur_output_section->end_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
			cur_output_section->end_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
			cur_output_section++;
		}

		// adjust end position for the last segment
		if (ad_section + 1 >= ad_sections_end)
		{
			memcpy(end_pos, post_start_pos, sizeof(end_pos));
		}
		
		// post ad filler
		if (cur_pos[MEDIA_TYPE_VIDEO] < end_pos[MEDIA_TYPE_VIDEO] || 
			cur_pos[MEDIA_TYPE_AUDIO] < end_pos[MEDIA_TYPE_AUDIO])
		{
			cur_output_section->chunk_type = ad_section->filler_chunk_type;
			cur_output_section->cyclic = TRUE;
			cur_output_section->metadata_header = ad_section->filler_header;
			cur_output_section->frames = (metadata_frame_info_t*)(cur_output_section->metadata_header + 1);
			cur_output_section->start_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
			cur_output_section->start_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
			cur_pos[MEDIA_TYPE_VIDEO] = end_pos[MEDIA_TYPE_VIDEO];
			cur_pos[MEDIA_TYPE_AUDIO] = end_pos[MEDIA_TYPE_AUDIO];
			cur_output_section->end_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
			cur_output_section->end_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
			cur_output_section++;
		}
	}
	
	if (post_ad_header != NULL)
	{
		cur_output_section->chunk_type = CHUNK_TYPE_POST_AD;
		cur_output_section->cyclic = FALSE;
		cur_output_section->metadata_header = post_ad_header;
		cur_output_section->frames = (metadata_frame_info_t*)(cur_output_section->metadata_header + 1);
		cur_output_section->start_pos[MEDIA_TYPE_VIDEO] = cur_pos[MEDIA_TYPE_VIDEO];
		cur_output_section->start_pos[MEDIA_TYPE_AUDIO] = cur_pos[MEDIA_TYPE_AUDIO];
		cur_output_section->end_pos[MEDIA_TYPE_VIDEO] = cur_output_section->start_pos[MEDIA_TYPE_VIDEO] + post_ad_header->media_info[MEDIA_TYPE_VIDEO].duration;
		cur_output_section->end_pos[MEDIA_TYPE_AUDIO] = cur_output_section->start_pos[MEDIA_TYPE_AUDIO] + post_ad_header->media_info[MEDIA_TYPE_AUDIO].duration;
		cur_output_section++;
	}
	
	*internal_ad_sections_count = cur_output_section - result;
	return result;
}

static const metadata_frame_info_t* 
get_next_frame(build_layout_state_t* cur_state)
{
	const metadata_frame_info_t* cur_frame;
	bool_t try_media_type[MEDIA_TYPE_COUNT];
	int media_type;

	try_media_type[MEDIA_TYPE_VIDEO] = cur_state->ad_section_has_media_type[MEDIA_TYPE_VIDEO];
	try_media_type[MEDIA_TYPE_AUDIO] = cur_state->ad_section_has_media_type[MEDIA_TYPE_AUDIO];
	for (;;)
	{
		if (cur_state->frame_index >= cur_state->ad_section_frame_count)
		{
			if (cur_state->ad_section_cyclic)
			{
				cur_state->frame_index -= cur_state->ad_section_frame_count;
			}
			else
			{
				break;
			}
		}
		
		cur_frame = &cur_state->ad_section_frames[cur_state->frame_index];
		media_type = cur_frame->media_type;
		
		if (try_media_type[media_type])
		{
			if (cur_state->pos[media_type] + (int32_t)cur_frame->duration <= cur_state->ad_section_end_pos[media_type])
			{
				return cur_frame;
			}
			try_media_type[media_type] = FALSE;
		}
		
		if (!try_media_type[MEDIA_TYPE_VIDEO] && !try_media_type[MEDIA_TYPE_AUDIO])
		{
			break;
		}
		
		cur_state->frame_index++;
	}
	
	return NULL;
}

static void
init_layout_state(
	build_layout_state_t* state,
	internal_ad_section_t* ad_section)
{
	state->ad_section = ad_section;
	state->ad_section_has_media_type[MEDIA_TYPE_VIDEO] = ad_section->metadata_header->media_info[MEDIA_TYPE_VIDEO].pid != 0;
	state->ad_section_has_media_type[MEDIA_TYPE_AUDIO] = ad_section->metadata_header->media_info[MEDIA_TYPE_AUDIO].pid != 0;
	state->ad_section_main_media_type = (state->ad_section_has_media_type[MEDIA_TYPE_VIDEO] ? MEDIA_TYPE_VIDEO : MEDIA_TYPE_AUDIO);		
	state->frame_index = 0;
	state->pos[MEDIA_TYPE_VIDEO] = ad_section->start_pos[MEDIA_TYPE_VIDEO];
	state->pos[MEDIA_TYPE_AUDIO] = ad_section->start_pos[MEDIA_TYPE_AUDIO];
	state->ad_section_frame_count = ad_section->metadata_header->frame_count;
	state->ad_section_frames = ad_section->frames;
	state->ad_section_end_pos[MEDIA_TYPE_VIDEO] = ad_section->end_pos[MEDIA_TYPE_VIDEO];
	state->ad_section_end_pos[MEDIA_TYPE_AUDIO] = ad_section->end_pos[MEDIA_TYPE_AUDIO];
	state->ad_section_cyclic = ad_section->cyclic;
}

static void
get_output_range(
	internal_ad_section_t* ad_sections_start,
	int ad_sections_count,
	int32_t output_start,
	int32_t output_end, 
	build_layout_state_t* start_frame,
	uint32_t* frame_count)
{
	internal_ad_section_t* ad_sections_end = ad_sections_start + ad_sections_count;
	const metadata_frame_info_t* cur_frame;
	internal_ad_section_t* ad_section;
	build_layout_state_t cur_state;
	build_layout_state_t end_frame;
	build_layout_state_t start_keyframe;
	build_layout_state_t end_keyframe;
	int32_t output_end_limit;
	int32_t start_keyframe_diff;
	int32_t end_keyframe_diff;
	int32_t cur_diff;
	int media_type;

	if (!output_end)
	{
		output_end = INT_MAX;
		output_end_limit = INT_MAX;
	}
	else
	{
		output_end_limit = output_end + MAX_KEY_FRAME_SNAP_TIME_DIFF;
	}
	
	start_frame->ad_section = NULL;
	end_frame.ad_section = NULL;
	start_keyframe.ad_section = NULL;
	end_keyframe.ad_section = NULL;
	start_keyframe_diff = MAX_KEY_FRAME_SNAP_TIME_DIFF;
	end_keyframe_diff = MAX_KEY_FRAME_SNAP_TIME_DIFF;

	start_frame->processed_frames = 0;
	end_frame.processed_frames = 0;
	start_keyframe.processed_frames = 0;
	end_keyframe.processed_frames = 0;
	cur_state.processed_frames = 0;
	
	for (ad_section = ad_sections_start; ad_section < ad_sections_end; ad_section++)
	{
		init_layout_state(&cur_state, ad_section);
		
		// if the current section ends before output starts we can just skip it
		if (ad_section->end_pos[cur_state.ad_section_main_media_type] != INT_MAX && 
			ad_section->end_pos[cur_state.ad_section_main_media_type] + MAX_KEY_FRAME_SNAP_TIME_DIFF < output_start)
		{
			continue;
		}

		// if the current section starts after output ends we're done
		if (ad_section->start_pos[cur_state.ad_section_main_media_type] > output_end_limit)
		{
			break;
		}
		
		for (;;)
		{
			// get a frame
			cur_frame = get_next_frame(&cur_state);
			if (cur_frame == NULL)
			{
				// failed to find a frame move to the next section
				break;
			}
			
			// care only about the main media type
			media_type = cur_frame->media_type;
			if (media_type != cur_state.ad_section_main_media_type)
			{
				cur_state.pos[media_type] += cur_frame->duration;
				cur_state.frame_index++;
				cur_state.processed_frames++;
				continue;
			}
			
			// update start / end frames
			if (start_frame->ad_section == NULL && cur_state.pos[media_type] >= output_start)
			{
				*start_frame = cur_state;
			}

			if (end_frame.ad_section == NULL && cur_state.pos[media_type] >= output_end)
			{
				end_frame = cur_state;
			}
			
			if (media_type == MEDIA_TYPE_VIDEO && cur_frame->is_iframe)
			{
				// update start / end key frames
				if (cur_state.pos[media_type] + MAX_KEY_FRAME_SNAP_TIME_DIFF >= output_start &&
					cur_state.pos[media_type] <= output_start + MAX_KEY_FRAME_SNAP_TIME_DIFF)
				{
					cur_diff = abs(cur_state.pos[media_type] - output_start);
					if (start_keyframe.ad_section == NULL || cur_diff < start_keyframe_diff)
					{
						start_keyframe = cur_state;
						start_keyframe_diff = cur_diff;
					}
				}
				
				if (cur_state.pos[media_type] + MAX_KEY_FRAME_SNAP_TIME_DIFF >= output_end &&
					cur_state.pos[media_type] <= output_end_limit)
				{
					cur_diff = abs(cur_state.pos[media_type] - output_end);
					if (end_keyframe.ad_section == NULL || cur_diff < end_keyframe_diff)
					{
						end_keyframe = cur_state;
						end_keyframe_diff = cur_diff;
					}
				}
			}
			
			// if we passed the end 
			if (cur_state.pos[media_type] > output_end_limit)
			{
				break;
			}
						
			// update position and frame index
			cur_state.pos[media_type] += cur_frame->duration;
			cur_state.frame_index++;
			cur_state.processed_frames++;
		}
	}
	
	if (start_keyframe.ad_section != NULL)
	{
		*start_frame = start_keyframe;
	}
	
	if (start_frame->ad_section == NULL)
	{
		*frame_count = 0;
		return;
	}

	if (end_keyframe.ad_section != NULL)
	{
		end_frame = end_keyframe;
	}
	
	if (end_frame.ad_section == NULL)
	{
		end_frame = cur_state;
	}
	
	// Note: processed_frames is needed since frame_index can be cyclic
	if (end_frame.processed_frames > start_frame->processed_frames)
	{
		*frame_count = end_frame.processed_frames - start_frame->processed_frames;
	}
	else
	{
		*frame_count = 0;
	}
}

static void 
increment_timestamps(timestamps_t* timestamps, const int32_t* increment)
{
	if (timestamps[MEDIA_TYPE_VIDEO].pcr != NO_TIMESTAMP)
		timestamps[MEDIA_TYPE_VIDEO].pcr += increment[MEDIA_TYPE_VIDEO];
	if (timestamps[MEDIA_TYPE_VIDEO].pts != NO_TIMESTAMP)
		timestamps[MEDIA_TYPE_VIDEO].pts += increment[MEDIA_TYPE_VIDEO];
	if (timestamps[MEDIA_TYPE_VIDEO].dts != NO_TIMESTAMP)
		timestamps[MEDIA_TYPE_VIDEO].dts += increment[MEDIA_TYPE_VIDEO];
	
	if (timestamps[MEDIA_TYPE_AUDIO].pcr != NO_TIMESTAMP)
		timestamps[MEDIA_TYPE_AUDIO].pcr += increment[MEDIA_TYPE_AUDIO];
	if (timestamps[MEDIA_TYPE_AUDIO].pts != NO_TIMESTAMP)
		timestamps[MEDIA_TYPE_AUDIO].pts += increment[MEDIA_TYPE_AUDIO];
	if (timestamps[MEDIA_TYPE_AUDIO].dts != NO_TIMESTAMP)
		timestamps[MEDIA_TYPE_AUDIO].dts += increment[MEDIA_TYPE_AUDIO];
}

static void 
init_output_header(
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

	// save some pre ad details
	output_header->pcr_pid = pre_ad_header->pcr_pid;
	output_header->streams_info = pre_ad_header->streams_info;
	
	// calculate continuity counters values
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
		
		if (output_end == 0 && post_ad_header != NULL)
		{		
			streams_data->end_cc = post_ad_header->streams_info.data[streams_data - streams_data_start].end_cc;
		}
		
		streams_data->start_cc &= 0x0F;
		streams_data->end_cc &= 0x0F;		
	}
}

static bool_t 
build_layout_impl(
	dynamic_buffer_t* result,
	const metadata_header_t* pre_ad_header, 
	const metadata_header_t* post_ad_header, 
	internal_ad_section_t* ad_sections_start,
	int ad_sections_count,
	int32_t segment_index,
	int32_t output_start,
	int32_t output_end)
{
	internal_ad_section_t* ad_sections_end = ad_sections_start + ad_sections_count;

	// current state
	build_layout_state_t cur_state;
	uint32_t last_packet_pos[MEDIA_TYPE_COUNT] = { 0 };
	timestamps_t timestamps[MEDIA_TYPE_COUNT];
	uint32_t frames_left;

	// temporary vars
	const metadata_frame_info_t* cur_frame;
	int media_type;
	output_packet_t output_packet;
	uint32_t packet_start_pos;
	output_header_t output_header;
	size_t alloc_size;
	
	// get the start / end frames
	get_output_range(
		ad_sections_start,
		ad_sections_count,
		output_start,
		output_end, 
		&cur_state,
		&frames_left);
	
	// preallocate the buffer to avoid reallocations
	alloc_size = sizeof(output_header) + sizeof(output_packet) + frames_left * (sizeof(output_packet) + sizeof_pcr + 2 * sizeof_pts);
	if (!resize_buffer(result, alloc_size))
	{
		goto error;
	}
		
	// append the output header
	init_output_header(&output_header, pre_ad_header, post_ad_header, segment_index, output_end);
	if (!append_buffer(result, PS(output_header)))
	{
		goto error;		// unexpected
	}
	
	// output the TS header
	memset(&output_packet, 0, sizeof(output_packet));
	output_packet.layout_size = sizeof(output_packet);
	output_packet.chunk_type = CHUNK_TYPE_TS_HEADER;
	if (!append_buffer(result, &output_packet, sizeof(output_packet)))
	{
		goto error;		// unexpected
	}
	
	for (;;)
	{
		timestamps[MEDIA_TYPE_VIDEO] = pre_ad_header->media_info[MEDIA_TYPE_VIDEO].timestamps;
		timestamps[MEDIA_TYPE_AUDIO] = pre_ad_header->media_info[MEDIA_TYPE_AUDIO].timestamps;
		increment_timestamps(timestamps, cur_state.pos);
	
		while (frames_left)
		{
			// get a frame
			cur_frame = get_next_frame(&cur_state);
			if (cur_frame == NULL)
			{
				// failed to find a frame move to the next section
				break;
			}

			// leave room for the packet header
			packet_start_pos = result->write_pos;
			if (!alloc_buffer_space(result, sizeof(output_packet) + sizeof_pcr + 2 * sizeof_pts))
			{
				goto error;		// unexpected
			}
			result->write_pos += sizeof(output_packet);

			media_type = cur_frame->media_type;

			// output the timestamps
			output_packet.pcr_offset = NO_OFFSET;
			if (timestamps[media_type].pcr != NO_TIMESTAMP)
			{
				if (cur_frame->timestamp_offsets.pcr != NO_OFFSET)
				{
					output_packet.pcr_offset = cur_frame->timestamp_offsets.pcr;
					set_pcr(result->data + result->write_pos, timestamps[media_type].pcr);
					result->write_pos += sizeof_pcr;
				}
				timestamps[media_type].pcr += cur_frame->duration;
			}
			
			output_packet.pts_offset = NO_OFFSET;
			if (timestamps[media_type].pts != NO_TIMESTAMP)
			{
				if (cur_frame->timestamp_offsets.pts != NO_OFFSET)
				{
					output_packet.pts_offset = cur_frame->timestamp_offsets.pts;
					set_pts(result->data + result->write_pos, cur_frame->timestamp_offsets.dts != NO_OFFSET ? PTS_BOTH_PTS : PTS_ONLY_PTS, timestamps[media_type].pts);
					result->write_pos += sizeof_pts;
				}
				timestamps[media_type].pts += cur_frame->duration;
			}

			output_packet.dts_offset = NO_OFFSET;
			if (timestamps[media_type].dts != NO_TIMESTAMP)
			{
				if (cur_frame->timestamp_offsets.dts != NO_OFFSET)
				{
					output_packet.dts_offset = cur_frame->timestamp_offsets.dts;
					set_pts(result->data + result->write_pos, PTS_BOTH_DTS, timestamps[media_type].dts);
					result->write_pos += sizeof_pts;
				}
				timestamps[media_type].dts += cur_frame->duration;
			}

			// write the packet header
			output_packet.layout_size = result->write_pos - packet_start_pos;
			output_packet.pos = cur_frame->pos;
			output_packet.size = cur_frame->size;
			output_packet.chunk_type = cur_state.ad_section->chunk_type;

			output_packet.src_pid = cur_frame->src_pid;
			output_packet.dst_pid = pre_ad_header->media_info[media_type].pid;
			memcpy(result->data + packet_start_pos, PS(output_packet));
			
			// update last packet per media type
			last_packet_pos[media_type] = packet_start_pos;
			
			// update the frame index
			cur_state.pos[media_type] += cur_frame->duration;
			cur_state.frame_index++;
			frames_left--;
		}
		
		if (!frames_left)
		{
			break;
		}

		// move to the next section
		cur_state.ad_section++;
		if (cur_state.ad_section >= ad_sections_end)
		{
			goto error;		// unexpected
		}
		init_layout_state(&cur_state, cur_state.ad_section);
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
	
error:

	free_buffer(result);
	
	return FALSE;
}

bool_t 
build_layout(
	dynamic_buffer_t* result,
	const metadata_header_t* pre_ad_header, 
	const metadata_header_t* post_ad_header, 
	ad_section_t* ad_sections_start,
	int ad_sections_count,
	int32_t segment_index,
	int32_t output_start,
	int32_t output_end)
{
	internal_ad_section_t* internal_sections;
	int internal_sections_count;
	bool_t status;
	
	internal_sections = convert_external_layout_to_internal(
		pre_ad_header, 
		post_ad_header, 
		ad_sections_start,
		ad_sections_count,
		&internal_sections_count);
	if (internal_sections == NULL)
	{
		return FALSE;
	}
	
	status = build_layout_impl(
		result,
		pre_ad_header, 
		post_ad_header, 
		internal_sections,
		internal_sections_count,
		segment_index,
		output_start,
		output_end);
	
	free(internal_sections);
	
	return status;
}

static void 
init_pcr_packet(byte_t* packet, uint16_t pcr_pid, u_char* delayed_pcr)
{
	static const char pcr_packet_header[] = { 0x47, 0x00, 0x00, 0x20, 0xB7, 0x10 };

	memcpy(packet, PS(pcr_packet_header));
	mpeg_ts_header_set_PID(packet, pcr_pid);	
	memcpy(packet + sizeof(pcr_packet_header), delayed_pcr, sizeof_pcr);
}

static byte_t* 
create_pcr_packet(uint16_t pcr_pid, u_char* delayed_pcr, size_t* result_buffer_size)
{
	byte_t* result;

	result = (byte_t*)malloc(TS_PACKET_LENGTH);
	if (result == NULL)
	{
		return NULL;
	}

	memset(result, 0xFF, TS_PACKET_LENGTH);	
	init_pcr_packet(result, pcr_pid, delayed_pcr);
	
	*result_buffer_size = TS_PACKET_LENGTH;
	
	return result;
}

static byte_t* 
create_null_packets(stream_info_t* stream_info, size_t* result_buffer_size, uint16_t pcr_pid, u_char* delayed_pcr)
{
	static const char null_packet_header[] = { 0x47, 0x00, 0x00, 0x30, 0xB7, 0x00 };
	byte_t* cur_pos;
	byte_t* end_pos;
	byte_t* result;
	size_t null_packets_size;
	size_t buffer_size;
	int packet_count;

	*result_buffer_size = 0;
	
	stream_info->start_cc &= 0x0F;
	packet_count = (stream_info->end_cc - stream_info->start_cc + 1) & 0x0F;
	if (packet_count == 0 && delayed_pcr == NULL)
	{
		return NULL;
	}
	
	null_packets_size = packet_count * TS_PACKET_LENGTH;
	
	buffer_size = null_packets_size;
	if (delayed_pcr != NULL)
	{
		buffer_size += TS_PACKET_LENGTH;
	}
	
	result = (byte_t*)malloc(buffer_size);
	if (result == NULL)
	{
		return NULL;
	}
	
	memset(result, 0xFF, buffer_size);

	end_pos = result + null_packets_size;
	
	for (cur_pos = result; cur_pos < end_pos; cur_pos += TS_PACKET_LENGTH)
	{
		memcpy(cur_pos, PS(null_packet_header));
		
		mpeg_ts_header_set_PID(cur_pos, stream_info->pid);
		
		stream_info->start_cc &= 0x0F;
		mpeg_ts_header_set_continuityCounter(cur_pos, stream_info->start_cc);
		stream_info->start_cc++;
	}
	
	if (delayed_pcr != NULL)
	{
		init_pcr_packet(cur_pos, pcr_pid, delayed_pcr);
	}
	
	*result_buffer_size = buffer_size;
	
	return result;
}

static void 
fix_continuity_counters(streams_info_t* streams_info, byte_t* buffer, uint32_t size)
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

void 
process_chunk(
	// input
	byte_t* layout_buffer,
	size_t layout_size,
	
	// inout
	byte_t* chunk_buffer,
	size_t chunk_size,
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
	byte_t* delayed_pcr = NULL;
	bool_t first_output = TRUE;
	uint32_t packet_start_offset;
	uint32_t packet_end_offset;
	uint32_t cur_offset;
	
	// init output
	memset(output, 0, sizeof(*output));
	output->action = PBA_GET_NEXT_CHUNK;
	
	if (chunk_size == 0)
	{
		// first call - init state
		cur_packet = (output_packet_t*)(layout_buffer + sizeof(output_header_t));
		output_state->layout_pos = sizeof(output_header_t);
		output_state->chunk_type = cur_packet->chunk_type;
		output_state->chunk_start_offset = cur_packet->pos;
		return;
	}
	
	while (cur_pos + sizeof(output_packet_t) <= end_pos)
	{
		// get current packet from layout buffer
		cur_packet = (output_packet_t*)cur_pos;
		if (cur_packet->layout_size < sizeof(*cur_packet) || cur_pos + cur_packet->layout_size > end_pos)
		{
			break;		// unexpected - the layout buffer is invalid
		}

		cur_pos += sizeof(*cur_packet);
		
		if (cur_packet->chunk_type == CHUNK_TYPE_TS_HEADER && 
			cur_packet->chunk_type == output_state->chunk_type)
		{
			// got a header buffer - output it as a whole, and move to the next packet
			fix_continuity_counters(&output_header->streams_info, chunk_buffer, chunk_size);
			output->chunk_output_end = chunk_size;
			output_state->layout_pos += cur_packet->layout_size;
			cur_pos = layout_buffer + output_state->layout_pos;
			continue;
		}
		
		if (cur_packet->chunk_type != output_state->chunk_type || 
			cur_packet->pos >= output_state->chunk_start_offset + chunk_size ||
			cur_packet->pos + cur_packet->size <= output_state->chunk_start_offset)
		{
			// nothing to output from this chunk
			output_state->chunk_type = cur_packet->chunk_type;
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
			output->action = (packet_start_offset > output->chunk_output_end ? PBA_CALL_AGAIN : PBA_CLONE_CURRENT_CHUNK);
			return;
		}
		output->chunk_output_end = packet_end_offset;
		
		// update timestamps if we have the beginning of the packet
		if (cur_packet->pos >= output_state->chunk_start_offset)
		{
			packet_chunk_pos = chunk_buffer + cur_packet->pos - output_state->chunk_start_offset;
			if (cur_packet->pcr_offset != NO_OFFSET)
			{
				if (output_header->pcr_pid != cur_packet->dst_pid)
				{
					// the pcr is using a separate pid, remove it from the current packet and insert a packet for it
					mpeg_ts_adaptation_field_set_pcrFlag(packet_chunk_pos + sizeof_mpeg_ts_header, 0);
					memset(packet_chunk_pos + cur_packet->pcr_offset, 0xff, sizeof_pcr);
					delayed_pcr = cur_pos;
				}
				else
				{
					memcpy(packet_chunk_pos + cur_packet->pcr_offset, cur_pos, sizeof_pcr);
				}
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
		stream_info = streams_info_hash_get(&output_header->streams_info, cur_packet->dst_pid);
		for (cur_offset = packet_start_offset; cur_offset < packet_end_offset; cur_offset += TS_PACKET_LENGTH)
		{
			cur_ts_packet = chunk_buffer + cur_offset;
			
			if (mpeg_ts_header_get_PID(cur_ts_packet) != cur_packet->src_pid)
			{
				continue;
			}
			
			mpeg_ts_header_set_PID(cur_ts_packet, cur_packet->dst_pid);

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
			
			if (delayed_pcr != NULL)
			{
				output->output_buffer = create_pcr_packet(output_header->pcr_pid, delayed_pcr, &output->output_buffer_size);
			}
			
			return;
		}
		
		// finished the packet
		output_state->layout_pos += cur_packet->layout_size;
		cur_pos = layout_buffer + output_state->layout_pos;
		
		if (cur_packet->last_packet)
		{
			// it's the last packet of the stream - output null packets to adjust the continuity counters
			output->output_buffer = create_null_packets(stream_info, &output->output_buffer_size, output_header->pcr_pid, delayed_pcr);
			if (output->output_buffer != NULL)
			{
				// output the null packets before continuing
				output->action = PBA_CALL_AGAIN;
				return;
			}
		}
		
		if (delayed_pcr != NULL)
		{
			output->output_buffer = create_pcr_packet(output_header->pcr_pid, delayed_pcr, &output->output_buffer_size);
			if (output->output_buffer != NULL)
			{
				// output the pcr packet before continuing
				output->action = PBA_CALL_AGAIN;
				return;
			}
			
			delayed_pcr = NULL;
		}		
	}
	
	// we're done
	output_state->chunk_type = CHUNK_TYPE_INVALID;
}

bool_t 
is_metadata_buffer_valid(const void* buffer, size_t size)
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

uint32_t 
get_data_size(const void* metadata)
{
	return ((metadata_header_t*)metadata)->data_size;
}
