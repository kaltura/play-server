#include <stdlib.h>
#include <string.h>
#include "mpegTs.h"

int64_t get_pcr(const pcr_t* pcr)
{
	return (((int64_t)pcr_get_pcr90kHzHigh(pcr)) << 16) | pcr_get_pcr90kHzLow(pcr);
}

void set_pcr(pcr_t* pcr, int64_t pcr_val)
{
	pcr_set_pcr90kHzHigh(pcr, 	(pcr_val >> 16));
	pcr_set_pcr90kHzLow	(pcr, 	 pcr_val 	   );
}

int64_t get_pts(const pts_t* pts)
{
	return (((int64_t)pts_get_high(pts)) << 30) | (((int64_t)pts_get_medium(pts)) << 15) | (int64_t)pts_get_low(pts);
}

void set_pts(pts_t* pts, int64_t pts_val)
{
	pts_set_high	(pts, 	(pts_val >> 30));
	pts_set_medium	(pts,	(pts_val >> 15));
	pts_set_low		(pts, 	 pts_val	   );
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

void ts_packetizer_init(ts_packetizer_state_t* state, packetizer_callback_t callback, void* callback_context)
{
	memset(state, 0, sizeof(*state));
	state->callback = callback;
	state->callback_context = callback_context;
}

bool_t ts_packetizer_process_data(ts_packetizer_state_t* state, const byte_t* packet_offset, int size)
{
	const byte_t* packet_end = packet_offset + size;
	const pes_optional_header_t* pes_optional_header;
	const pes_header_t* pes_header;
	int copy_size;

	// check whether we have a PES packet
	if (!state->in_packet &&
		packet_offset + sizeof_pes_header + sizeof_pes_optional_header < packet_end &&
		pes_header_get_prefix(packet_offset) == PES_MARKER)
	{
		// skip the PES header and optional header
		pes_header = packet_offset;
		packet_offset += sizeof_pes_header;
		pes_optional_header = packet_offset;
		packet_offset += sizeof_pes_optional_header;
		state->pts = pes_optional_header_get_ptsFlag(pes_optional_header) ? get_pts(packet_offset) : -1;
		packet_offset += pes_optional_header_get_pesHeaderLength(pes_optional_header);
		
		state->packet_size = pes_header_get_pesPacketLength(pes_header) - 
			sizeof_pes_optional_header - 
			pes_optional_header_get_pesHeaderLength(pes_optional_header);
		
		if (state->packet_size > 0 && state->packet_size < MAX_PES_PAYLOAD)
		{
			// initialize the state for a packet
			state->packet_buffer = (byte_t*)malloc(state->packet_size);
			if (state->packet_buffer == NULL)
			{
				return FALSE;
			}
			state->packet_pos = state->packet_buffer;
			state->size_left = state->packet_size;
			state->in_packet = TRUE;
		}
	}
	
	if (state->in_packet)
	{
		// copy to the packet buffer
		copy_size = MIN(state->size_left, packet_end - packet_offset);
		memcpy(state->packet_pos, packet_offset, copy_size);
		state->packet_pos += copy_size;
		state->size_left -= copy_size;
		
		if (state->size_left <= 0)
		{
			// finished the packet
			state->callback(
				state->callback_context, 
				state->packet_buffer, 
				state->packet_size, 
				state->pts);
			free(state->packet_buffer);
			state->packet_buffer = NULL;
			state->in_packet = FALSE;
		}
	}
	
	return TRUE;
}

void ts_packetizer_free(ts_packetizer_state_t* state)
{
	free(state->packet_buffer);
}

bool_t walk_ts_streams(
	const byte_t* data, 
	int size, 
	pmt_header_callback_t pmt_header_callback,
	pmt_entry_callback_t pmt_entry_callback,
	packet_data_callback_t packet_data_callback,
	void* callback_context)
{
	const byte_t* end_data = data + size - TS_PACKET_LENGTH;
	const byte_t* packet_offset;
	const byte_t* cur_data;
	int cur_pid;
	int pmt_program_pid = 0;
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	const pat_t* pat_header;
	const pat_entry_t* pat_entry;
	const pmt_t* pmt_header;
	const pmt_entry_t* pmt_entry;
	int pat_entry_count;
	int i;
	const byte_t* end_offset;
	
	for (cur_data = data; cur_data <= end_data; cur_data += TS_PACKET_LENGTH)
	{
		// extract the current PID
		ts_header = (const mpeg_ts_header_t*)cur_data;				
		cur_pid = mpeg_ts_header_get_PID(ts_header);

		// skip the adapation field if present
		packet_offset = cur_data + sizeof_mpeg_ts_header;
		if (mpeg_ts_header_get_adaptationFieldExist(ts_header))
		{
			adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
			packet_offset += 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
		}
		
		if (cur_pid == PAT_PID)
		{			
			// extract the pat header
			pat_header = (const pat_t*)packet_offset;
			packet_offset += sizeof_pat;
			pat_entry_count = (pat_get_sectionLength(pat_header) - sizeof_pat) / sizeof_pat_entry;
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
			// extract the pmt header
			pmt_header = (const pmt_t*)packet_offset;
			packet_offset += sizeof_pmt + pmt_get_programInfoLength(pmt_header);
		
			// call the pmt header callback
			pmt_header_callback(callback_context, pmt_header);
			
			end_offset = packet_offset + pmt_get_sectionLength(pmt_header) - sizeof_pmt;
			while (packet_offset < end_offset)
			{
				// extract the pmt entry
				pmt_entry = (const pmt_entry_t*)packet_offset;
				packet_offset += sizeof_pmt_entry + pmt_entry_get_esInfoLength(pmt_entry);

				// call the pmt entry callback
				pmt_entry_callback(callback_context, pmt_entry, packet_offset - pmt_entry);
			}
		}
		else
		{
			// call the data callback
			if (!packet_data_callback(callback_context, cur_pid, packet_offset, cur_data + TS_PACKET_LENGTH - packet_offset))
			{
				return FALSE;
			}
		}
	}
	return TRUE;
}
