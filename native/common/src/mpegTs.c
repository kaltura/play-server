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

void get_timestamp_offsets(const byte_t* packet_start, timestamp_offsets_t* timestamp_offsets)
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
	
	if (packet_offset + sizeof_pes_header + sizeof_pes_optional_header < packet_end &&
		pes_header_get_prefix(packet_offset) == PES_MARKER)
	{
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

void update_timestamps(byte_t* packet_start, const timestamp_offsets_t* timestamp_offsets, const timestamps_t* timestamps, int timestamp_offset)
{
	if (timestamp_offsets->pcr != NO_OFFSET)
	{
		update_pcr(packet_start + timestamp_offsets->pcr, timestamps->pcr + timestamp_offset);
	}

	if (timestamp_offsets->pts != NO_OFFSET)
	{
		update_pts(packet_start + timestamp_offsets->pts, timestamps->pts + timestamp_offset);
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

bool_t frame_has_pcr(const byte_t* packet_offset)
{
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	int adapt_size;

	ts_header = packet_offset;
	packet_offset += sizeof_mpeg_ts_header;
	if (!mpeg_ts_header_get_adaptationFieldExist(ts_header))
	{
		return FALSE;
	}
	
	adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
	adapt_size = 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
	
	if (mpeg_ts_adaptation_field_get_pcrFlag(adapt_field) && adapt_size >= sizeof_mpeg_ts_adaptation_field + sizeof_pcr)
	{			
		return TRUE;
	}
	
	return FALSE;
}
