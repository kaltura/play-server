#include <limits.h>
#include <string.h>
#include "ts_stitcher_impl.h"
#include "mpegTsStreamInfo.h"
#include "mpegTsMetadata.h"
#include "dynamicBuffer.h"
#include "mpegTs.h"

typedef struct {
	streams_info_t streamsInfo;
} OutputHeader;

typedef struct {
	uint32_t layoutSize;
	uint32_t pos;
	uint32_t size;
	uint8_t state;
	uint8_t pcrOffset;
	uint8_t ptsOffset;
	uint8_t dtsOffset;
	uint16_t pid;
	uint8_t last_packet;
	uint8_t padding;
	
	/*uint8_t pcr[sizeof_pcr];
	uint8_t pts[sizeof_pts];
	uint8_t dts[sizeof_pts];*/
} OutputPacket;

bool_t buildLayoutImpl(
	dynamic_buffer_t* result,
	void* preAdMetadata,
	void* adMetadata,
	void* blackMetadata,
	void* postAdMetadata,
	int32_t segmentIndex,
	int32_t outputStart,
	int32_t outputEnd)
{
	metadata_header_t* preAdHeader = (metadata_header_t*)preAdMetadata;
	metadata_header_t* adHeader = (metadata_header_t*)adMetadata;
	metadata_header_t* blackHeader = (metadata_header_t*)blackMetadata;
	metadata_header_t* postAdHeader = (metadata_header_t*)postAdMetadata;
	metadata_frame_info_t* preAdTSFrames = 	(metadata_frame_info_t*)(preAdHeader + 1);
	metadata_frame_info_t* adTSFrames = 	(metadata_frame_info_t*)(adHeader + 1);
	metadata_frame_info_t* blackTSFrames = 	(metadata_frame_info_t*)(blackHeader + 1);
	metadata_frame_info_t* postAdTSFrames = (metadata_frame_info_t*)(postAdHeader + 1);
	int32_t videoAdSlotEndPos = INT_MAX;
	int32_t audioAdSlotEndPos = INT_MAX;
	
	if (postAdHeader != NULL)
	{
		videoAdSlotEndPos = (int32_t)((postAdHeader->media_info[MEDIA_TYPE_VIDEO].timestamps.pts - preAdHeader->media_info[MEDIA_TYPE_VIDEO].timestamps.pts) & ((1LL << 33) - 1));
		audioAdSlotEndPos = (int32_t)((postAdHeader->media_info[MEDIA_TYPE_AUDIO].timestamps.pts - preAdHeader->media_info[MEDIA_TYPE_AUDIO].timestamps.pts) & ((1LL << 33) - 1));
	}
		
	int curState = STATE_PRE_AD;		// ++ doesn't work for enums in cpp
	uint32_t frameIndex = 0;	
	bool_t outputFrames = FALSE;
	bool_t wroteHeader = FALSE;
	int32_t curPos[MEDIA_TYPE_COUNT] = { 0 };
	timestamps_t timestamps[MEDIA_TYPE_COUNT];
	timestamps[MEDIA_TYPE_VIDEO] = preAdHeader->media_info[MEDIA_TYPE_VIDEO].timestamps;
	timestamps[MEDIA_TYPE_AUDIO] = preAdHeader->media_info[MEDIA_TYPE_AUDIO].timestamps;
	int mainMediaType = ((preAdHeader->media_info[MEDIA_TYPE_VIDEO].pid != 0) ? MEDIA_TYPE_VIDEO : MEDIA_TYPE_AUDIO);
	
	metadata_frame_info_t* nextFrame;
	int mediaType;
	bool_t foundFrame;
	bool_t tryVideo;
	bool_t tryAudio;
	OutputPacket outputPacket;
	uint8_t pcr[sizeof_pcr];
	uint8_t pts[sizeof_pts];	
	memset(&outputPacket, 0, sizeof(outputPacket));
	
	uint32_t lastPacketPos[MEDIA_TYPE_COUNT] = { 0 };
	
	// calculate the output header
	OutputHeader outputHeader;
	outputHeader.streamsInfo = preAdHeader->streams_info;
	stream_info_t* streams_data = outputHeader.streamsInfo.data;
	bool_t isMediaPid;
	int i;
	
	for (i = 0; i < STREAMS_INFO_HASH_SIZE; i++)
	{
		if (streams_data[i].pid == INVALID_PID)
			continue;
	
		isMediaPid = streams_data[i].pid != 0 && 
			(preAdHeader->media_info[MEDIA_TYPE_VIDEO].pid == streams_data[i].pid || 
			 preAdHeader->media_info[MEDIA_TYPE_AUDIO].pid == streams_data[i].pid);
					 
		if (!isMediaPid)
		{
			int cc_shift = segmentIndex * (streams_data[i].end_cc + 1 - streams_data[i].start_cc);
			streams_data[i].start_cc += cc_shift;
			streams_data[i].end_cc += cc_shift;
		}
		else
		{
			streams_data[i].end_cc = streams_data[i].start_cc - 1;
		}
		
		if (outputEnd == 0)
		{		
			streams_data[i].end_cc = postAdHeader->streams_info.data[i].end_cc;
		}
		
		streams_data[i].start_cc &= 0x0F;
		streams_data[i].end_cc &= 0x0F;		
	}
	
	if (!append_buffer(result, PS(outputHeader)))
	{
		// XXXX handle this
	}	
	
	if (!outputEnd)
	{
		outputEnd = INT_MAX;
	}
	
	for (;;)
	{
		if (curPos[mainMediaType] > outputEnd)
		{
			break;
		}
		else if (curPos[mainMediaType] >= outputStart)
		{
			outputFrames = TRUE;
		}
		
		foundFrame = FALSE;
		
		switch (curState)
		{
		case STATE_PRE_AD:
			if (frameIndex < preAdHeader->frame_count)
			{
				nextFrame = &preAdTSFrames[frameIndex];
				foundFrame = TRUE;
				break;
			}

			curState++;
			frameIndex = 0;
			/* fallthrough */
		
		case STATE_AD:
			if (adHeader != NULL)
			{
				tryVideo = (adHeader->media_info[MEDIA_TYPE_VIDEO].pid != 0);
				tryAudio = (adHeader->media_info[MEDIA_TYPE_AUDIO].pid != 0);
				while (frameIndex < adHeader->frame_count && (tryVideo || tryAudio))
				{
					nextFrame = &adTSFrames[frameIndex];
					if (tryVideo && nextFrame->media_type == MEDIA_TYPE_VIDEO)
					{
						if (curPos[MEDIA_TYPE_VIDEO] + (int32_t)nextFrame->duration <= videoAdSlotEndPos)
						{
							foundFrame = TRUE;
							break;
						}
						tryVideo = FALSE;
					}
					else if (tryAudio && nextFrame->media_type == MEDIA_TYPE_AUDIO)
					{
						if (curPos[MEDIA_TYPE_AUDIO] + (int32_t)nextFrame->duration <= audioAdSlotEndPos)
						{
							foundFrame = TRUE;
							break;
						}
						tryAudio = FALSE;
					}
					frameIndex++;
				}
				if (foundFrame)
					break;
			}
			
			curState++;
			frameIndex = 0;
			/* fallthrough */
		
		case STATE_PAD:
			tryVideo = (blackHeader->media_info[MEDIA_TYPE_VIDEO].pid != 0);
			tryAudio = (blackHeader->media_info[MEDIA_TYPE_AUDIO].pid != 0);
			while (tryVideo || tryAudio)
			{
				if (frameIndex >= blackHeader->frame_count)
					frameIndex -= blackHeader->frame_count;
				nextFrame = &blackTSFrames[frameIndex];
				if (tryVideo && nextFrame->media_type == MEDIA_TYPE_VIDEO)
				{
					if (curPos[MEDIA_TYPE_VIDEO] + (int32_t)nextFrame->duration <= videoAdSlotEndPos)
					{
						foundFrame = TRUE;
						break;
					}
					tryVideo = FALSE;
				}
				else if (tryAudio && nextFrame->media_type == MEDIA_TYPE_AUDIO)
				{
					if (curPos[MEDIA_TYPE_AUDIO] + (int32_t)nextFrame->duration <= audioAdSlotEndPos)
					{
						foundFrame = TRUE;
						break;
					}
					tryAudio = FALSE;
				}
				frameIndex++;
			}
			if (foundFrame)
				break;
				
			curState++;
			frameIndex = 0;
			/* fallthrough */

		case STATE_POST_AD:
			if (frameIndex < postAdHeader->frame_count)
			{
				nextFrame = &postAdTSFrames[frameIndex];
				foundFrame = TRUE;
				break;
			}
		}
		
		if (!foundFrame)
			break;
			
		mediaType = nextFrame->media_type;
		
		if (outputFrames)
		{
			// output the ts header
			if (!wroteHeader)
			{
				outputPacket.layoutSize = sizeof(outputPacket);
				outputPacket.state = STATE_PRE_AD_HEADER;
				if (!append_buffer(result, &outputPacket, sizeof(outputPacket)))
				{
					// XXXX handle this
				}

				wroteHeader = TRUE;
			}
		
			// output the packet
			outputPacket.layoutSize = sizeof(outputPacket);
			outputPacket.pos = nextFrame->pos;
			outputPacket.size = nextFrame->size;
			outputPacket.state = curState;
			if (timestamps[mediaType].pcr != NO_TIMESTAMP && nextFrame->timestamp_offsets.pcr != NO_OFFSET)
			{
				outputPacket.pcrOffset = nextFrame->timestamp_offsets.pcr;
				outputPacket.layoutSize += sizeof(pcr);
			}
			else
			{
				outputPacket.pcrOffset = NO_OFFSET;
			}
			
			if (timestamps[mediaType].pts != NO_TIMESTAMP && nextFrame->timestamp_offsets.pts != NO_OFFSET)
			{
				outputPacket.ptsOffset = nextFrame->timestamp_offsets.pts;
				outputPacket.layoutSize += sizeof(pts);
			}
			else
			{
				outputPacket.ptsOffset = NO_OFFSET;
			}

			if (timestamps[mediaType].dts != NO_TIMESTAMP && nextFrame->timestamp_offsets.dts != NO_OFFSET)
			{
				outputPacket.dtsOffset = nextFrame->timestamp_offsets.dts;
				outputPacket.layoutSize += sizeof(pts);
			}
			else
			{
				outputPacket.dtsOffset = NO_OFFSET;
			}
			
			outputPacket.pid = preAdHeader->media_info[mediaType].pid;
			
			lastPacketPos[mediaType] = result->write_pos;
				
			if (!append_buffer(result, &outputPacket, sizeof(outputPacket)))
			{
				// XXXX handle this
			}
			
			// output the timestamps
			if (outputPacket.pcrOffset != NO_OFFSET)
			{
				set_pcr(pcr, timestamps[mediaType].pcr);
				if (!append_buffer(result, &pcr, sizeof(pcr)))
				{
					// XXXX handle this
				}
			}
			if (outputPacket.ptsOffset != NO_OFFSET)
			{
				set_pts(pts, nextFrame->timestamp_offsets.dts != NO_OFFSET ? PTS_BOTH_PTS : PTS_ONLY_PTS, timestamps[mediaType].pts);
				if (!append_buffer(result, &pts, sizeof(pts)))
				{
					// XXXX handle this
				}
			}
			if (outputPacket.dtsOffset != NO_OFFSET)
			{
				set_pts(pts, PTS_BOTH_DTS, timestamps[mediaType].dts);
				if (!append_buffer(result, &pts, sizeof(pts)))
				{
					// XXXX handle this
				}
			}
		}
		
		// update timestamps, pos and frame index
		if (timestamps[mediaType].pcr != NO_TIMESTAMP)
			timestamps[mediaType].pcr += nextFrame->duration;
		if (timestamps[mediaType].pts != NO_TIMESTAMP)
			timestamps[mediaType].pts += nextFrame->duration;
		if (timestamps[mediaType].dts != NO_TIMESTAMP)
			timestamps[mediaType].dts += nextFrame->duration;
		curPos[mediaType] += nextFrame->duration;
		frameIndex++;
	}
	
	// mark the last packet of each media type
	for (i = 0; i < (int)ARRAY_ENTRIES(lastPacketPos); i++)
	{
		if (lastPacketPos[i] == 0)
			continue;
			
		((OutputPacket*)(result->data + lastPacketPos[i]))->last_packet = TRUE;
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

void processChunkImpl(
	// input
	byte_t* layoutBuffer,
	uint32_t layoutSize,
	
	// inout
	byte_t* chunkBuffer,
	uint32_t chunkSize,
	OutputState* outputState,
	
	// output
	uint32_t* chunkOutputStart,
	uint32_t* chunkOutputEnd,
	byte_t** outputBuffer,
	size_t* outputBufferSize,
	bool_t* moreDataNeeded)
{
	OutputHeader* outputHeader = (OutputHeader*)layoutBuffer;
	OutputPacket* curPacket;
	byte_t* curPos = layoutBuffer + outputState->layoutPos;
	byte_t* endPos = layoutBuffer + layoutSize;
	byte_t* packetChunkPos;
	bool_t firstOutput = TRUE;
	uint32_t packetStartOffset;
	uint32_t packetEndOffset;
	uint32_t curOffset;
	
	*chunkOutputStart = 0;
	*chunkOutputEnd = 0;
	*outputBuffer = NULL;
	*outputBufferSize = 0;
	*moreDataNeeded = TRUE;
	
	if (chunkSize == 0)
	{
		// first call - init state
		curPacket = (OutputPacket*)(layoutBuffer + sizeof(OutputHeader));
		outputState->layoutPos = sizeof(OutputHeader);
		outputState->chunkType = curPacket->state;
		outputState->chunkStartOffset = curPacket->pos;
		return;
	}
	
	while (curPos + sizeof(OutputPacket) <= endPos)
	{	
		curPacket = (OutputPacket*)curPos;
		if (curPos + curPacket->layoutSize > endPos)
			break;		// unexpected - the layout buffer is invalid

		curPos += sizeof(*curPacket);
		
		if (curPacket->state == outputState->chunkType &&
			curPacket->state == STATE_PRE_AD_HEADER)
		{
			// got a header buffer - output it as is, and move to the next packet
			fix_continuity_counters(&outputHeader->streamsInfo, chunkBuffer, chunkSize);
			*chunkOutputEnd = chunkSize;
			outputState->layoutPos += curPacket->layoutSize;
			curPos = layoutBuffer + outputState->layoutPos;
			continue;
		}
		
		if (curPacket->state != outputState->chunkType || 
			curPacket->pos + curPacket->size <= outputState->chunkStartOffset || 
			curPacket->pos >= outputState->chunkStartOffset + chunkSize)
		{
			// nothing to output from this chunk
			outputState->chunkType = curPacket->state;
			outputState->chunkStartOffset = curPacket->pos;
			return;
		}
				
		// update output offsets
		packetStartOffset = (curPacket->pos > outputState->chunkStartOffset ? curPacket->pos - outputState->chunkStartOffset : 0);
		packetEndOffset = MIN(curPacket->pos + curPacket->size - outputState->chunkStartOffset, chunkSize);

		if (firstOutput)
		{
			*chunkOutputStart = packetStartOffset;
			firstOutput = FALSE;
		}
		else if (packetStartOffset != *chunkOutputEnd)
		{
			// the packet is not adjacent to the last packet, write whatever we have so far first
			*moreDataNeeded = FALSE;
			return;
		}
		*chunkOutputEnd = packetEndOffset;
		
		// update timestamps
		if (curPacket->pos >= outputState->chunkStartOffset)
		{
			packetChunkPos = chunkBuffer + curPacket->pos - outputState->chunkStartOffset;
			if (curPacket->pcrOffset != NO_OFFSET)
			{
				memcpy(packetChunkPos + curPacket->pcrOffset, curPos, sizeof_pcr);
				curPos += sizeof_pcr;
			}
			if (curPacket->ptsOffset != NO_OFFSET)
			{
				memcpy(packetChunkPos + curPacket->ptsOffset, curPos, sizeof_pts);
				curPos += sizeof_pts;
			}
			if (curPacket->dtsOffset != NO_OFFSET)
			{
				memcpy(packetChunkPos + curPacket->dtsOffset, curPos, sizeof_pts);
				curPos += sizeof_pts;
			}
		}

		// update continuity counters and PID
		stream_info_t* stream_info = streams_info_hash_get(&outputHeader->streamsInfo, curPacket->pid);
		for (curOffset = packetStartOffset; curOffset < packetEndOffset; curOffset += TS_PACKET_LENGTH)
		{
			byte_t* curTSPacket = chunkBuffer + curOffset;
			
			mpeg_ts_header_set_PID(curTSPacket, curPacket->pid);
			
			if (stream_info != NULL)
			{
				stream_info->start_cc &= 0x0F;
				mpeg_ts_header_set_continuityCounter(curTSPacket, stream_info->start_cc);
				stream_info->start_cc++;
			}
		}
				
		// update layout position
		if (curPacket->pos + curPacket->size == *chunkOutputEnd + outputState->chunkStartOffset)
		{
			// finished the packet
			outputState->layoutPos += curPacket->layoutSize;
			curPos = layoutBuffer + outputState->layoutPos;
			
			if (curPacket->last_packet)
			{
				*outputBuffer = create_null_packets(stream_info, outputBufferSize);
				if (*outputBuffer != NULL)
				{
					// output the null packets before continuing
					*moreDataNeeded = FALSE;
					return;
				}
			}
		}
		else
		{
			// need the next chunk to complete the packet
			outputState->chunkStartOffset += chunkSize;
			return;
		}
	}
	
	outputState->chunkType = STATE_INVALID;
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
