#include <climits>
#include "nan.h"
#include "dynamicBuffer.h"
#include "mpegTsMetadata.h"
#include "mpegTs.h"

using namespace v8;
using namespace node;

typedef struct {
	uint32_t layoutSize;
	uint32_t pos;
	uint32_t size;
	uint8_t state;
	uint8_t pcrOffset;
	uint8_t ptsOffset;
	uint8_t dtsOffset;
	/*uint8_t pcr[sizeof_pcr];
	uint8_t pts[sizeof_pts];
	uint8_t dts[sizeof_pts];*/
} OutputPacket;

typedef enum {
	STATE_PRE_AD,
	STATE_AD,
	STATE_PAD,
	STATE_POST_AD,
	
	STATE_PRE_AD_HEADER,
	STATE_AD_HEADER,
	STATE_PAD_HEADER,
	STATE_POST_AD_HEADER,
	
	STATE_INVALID,
} LayoutState;

bool buildLayoutImpl(
	dynamic_buffer_t* result,
	void* preAdMetadata,
	void* adMetadata,
	void* blackMetadata,
	void* postAdMetadata,
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
		videoAdSlotEndPos = (int32_t)((postAdHeader->timestamps[MEDIA_TYPE_VIDEO].pts - preAdHeader->timestamps[MEDIA_TYPE_VIDEO].pts) & ((1LL << 33) - 1));
		audioAdSlotEndPos = (int32_t)((postAdHeader->timestamps[MEDIA_TYPE_AUDIO].pts - preAdHeader->timestamps[MEDIA_TYPE_AUDIO].pts) & ((1LL << 33) - 1));
	}
		
	int curState = STATE_PRE_AD;		// ++ doesn't work for enums in cpp
	uint32_t frameIndex = 0;	
	bool outputFrames = false;
	bool wroteHeader = false;
	int32_t curPos[MEDIA_TYPE_COUNT] = { 0 };
	timestamps_t timestamps[MEDIA_TYPE_COUNT];
	memcpy(&timestamps, preAdHeader->timestamps, sizeof(timestamps));
	int mainMediaType = ((preAdHeader->video_pid != 0) ? MEDIA_TYPE_VIDEO : MEDIA_TYPE_AUDIO);
	
	metadata_frame_info_t* nextFrame;
	int mediaType;
	bool foundFrame;
	bool tryVideo;
	bool tryAudio;
	OutputPacket outputPacket;
	uint8_t pcr[sizeof_pcr];
	uint8_t pts[sizeof_pts];	
	memset(&outputPacket, 0, sizeof(outputPacket));
	
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
			outputFrames = true;
		}
		
		foundFrame = false;
		
		switch (curState)
		{
		case STATE_PRE_AD:
			if (frameIndex < preAdHeader->frame_count)
			{
				nextFrame = &preAdTSFrames[frameIndex];
				foundFrame = true;
				break;
			}

			curState++;
			frameIndex = 0;
			/* fallthrough */
		
		case STATE_AD:
			if (adHeader != NULL)
			{
				tryVideo = (adHeader->video_pid != 0);
				tryAudio = (adHeader->audio_pid != 0);
				while (frameIndex < adHeader->frame_count && (tryVideo || tryAudio))
				{
					nextFrame = &adTSFrames[frameIndex];
					if (tryVideo && nextFrame->media_type == MEDIA_TYPE_VIDEO)
					{
						if (curPos[MEDIA_TYPE_VIDEO] + (int32_t)nextFrame->duration <= videoAdSlotEndPos)
						{
							foundFrame = true;
							break;
						}
						tryVideo = false;
					}
					else if (tryAudio && nextFrame->media_type == MEDIA_TYPE_AUDIO)
					{
						if (curPos[MEDIA_TYPE_AUDIO] + (int32_t)nextFrame->duration <= audioAdSlotEndPos)
						{
							foundFrame = true;
							break;
						}
						tryAudio = false;
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
			tryVideo = (blackHeader->video_pid != 0);
			tryAudio = (blackHeader->audio_pid != 0);
			while (tryVideo || tryAudio)
			{
				if (frameIndex >= blackHeader->frame_count)
					frameIndex -= blackHeader->frame_count;
				nextFrame = &blackTSFrames[frameIndex];
				if (tryVideo && nextFrame->media_type == MEDIA_TYPE_VIDEO)
				{
					if (curPos[MEDIA_TYPE_VIDEO] + (int32_t)nextFrame->duration <= videoAdSlotEndPos)
					{
						foundFrame = true;
						break;
					}
					tryVideo = false;
				}
				else if (tryAudio && nextFrame->media_type == MEDIA_TYPE_AUDIO)
				{
					if (curPos[MEDIA_TYPE_AUDIO] + (int32_t)nextFrame->duration <= audioAdSlotEndPos)
					{
						foundFrame = true;
						break;
					}
					tryAudio = false;
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
				foundFrame = true;
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
				outputPacket.state = curState + STATE_PRE_AD_HEADER - STATE_PRE_AD;
				if (!append_buffer(result, &outputPacket, sizeof(outputPacket)))
				{
					// XXXX handle this
				}

				wroteHeader = true;
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
	
	return true;
}

typedef struct {
	uint32_t layoutPos;
	int chunkType;
	uint32_t chunkStartOffset;
} OutputState;

// TODO XXX fix mpeg ts continuity counters

void processChunkImpl(
	// input
	char* layoutBuffer,
	uint32_t layoutSize,
	
	// inout
	char* chunkBuffer,
	uint32_t chunkSize,
	OutputState* outputState,
	
	// output
	uint32_t* chunkOutputStart,
	uint32_t* chunkOutputEnd,
	bool* moreDataNeeded)
{
	OutputPacket* curPacket;
	char* curPos = layoutBuffer + outputState->layoutPos;
	char* endPos = layoutBuffer + layoutSize;
	char* packetChunkPos;
	bool firstOutput = true;
	uint32_t packetStartOffset;
	uint32_t packetEndOffset;
	
	*chunkOutputStart = 0;
	*chunkOutputEnd = 0;
	*moreDataNeeded = true;
	
	if (chunkSize == 0)
	{
		// first call - init state
		curPacket = (OutputPacket*)layoutBuffer;
		outputState->layoutPos = 0;
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
			curPacket->state >= STATE_PRE_AD_HEADER)
		{
			// got a header buffer - output it as is, and move to the next packet
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
			firstOutput = false;
		}
		else if (packetStartOffset != *chunkOutputEnd)
		{
			// the packet is not adjacent to the last packet, write whatever we have so far first
			*moreDataNeeded = false;
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
				
		// update layout position
		if (curPacket->pos + curPacket->size == *chunkOutputEnd + outputState->chunkStartOffset)
		{
			// finished the packet
			outputState->layoutPos += curPacket->layoutSize;
			curPos = layoutBuffer + outputState->layoutPos;
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

/*
void MyFreeCallback(char* data, void* hint)
{
	free(data);
}
*/

NAN_METHOD(BuildLayout) {
	NanScope();

	// validate input
	if (args.Length() < 6) 
	{
		return NanThrowTypeError("Function requires 6 arguments");
	}
	
	void* argBuffers[4];
	memset(&argBuffers, 0, sizeof(argBuffers));
	
	for (int i = 0; i < 4; i++)
	{
		if (args[i]->IsNull())
			continue;
		
		if (!args[i]->IsObject())
		{
			return NanThrowTypeError("Arguments 1-4 must be either null or buffer");
		}
		
		v8::Handle<v8::Object> curObject = args[i]->ToObject();
		if (!Buffer::HasInstance(curObject))
		{
			return NanThrowTypeError("Arguments 1-4 must be either null or buffer");
		}
		
		size_t curLength = Buffer::Length(curObject);
		if (curLength < sizeof(metadata_header_t))
		{
			return NanThrowTypeError("Invalid metadata buffer (1)");
		}
		
		argBuffers[i] = Buffer::Data(curObject);
		if (curLength < sizeof(metadata_header_t) + ((metadata_header_t*)argBuffers[i])->frame_count * sizeof(metadata_frame_info_t))
		{
			return NanThrowTypeError("Invalid metadata buffer (2)");
		}
	}
		
	if (!args[4]->IsNumber() || !args[5]->IsNumber()) 
	{
		return NanThrowTypeError("Arguments 5-6 must be numbers");
	}

	// check for mandatory buffers
	if (argBuffers[STATE_PRE_AD] == NULL)
	{
		return NanThrowTypeError("Pre-ad segment must not be null");
	}

	if (argBuffers[STATE_PAD] == NULL)
	{
		return NanThrowTypeError("Pad segment must not be null");
	}
	
	if (argBuffers[STATE_POST_AD] == NULL && args[5]->NumberValue() == 0)
	{
		return NanThrowTypeError("Post-ad segment must not be null in the last segment");
	}
	
	// build the layout
	dynamic_buffer_t dynBuffer;
	memset(&dynBuffer, 0, sizeof(dynBuffer));
	
	buildLayoutImpl(
		&dynBuffer,
		argBuffers[0],
		argBuffers[1],
		argBuffers[2],
		argBuffers[3],
		args[4]->NumberValue(),
		args[5]->NumberValue());

	// return the result
	// XXXX TODO check if we can avoid this memory copy
	// appending (smalloc::FreeCallback)MyFreeCallback, (void*)NULL didn't work - unresolved symbol
	Local<Object> result = NanNewBufferHandle((char*)dynBuffer.data, dynBuffer.write_pos);

	free_buffer(&dynBuffer);
	
	NanReturnValue(result);
}

NAN_METHOD(ProcessChunk) {
	NanScope();

	// validate input
	if (args.Length() < 3) 
	{
		return NanThrowTypeError("Function requires 3 arguments");
	}
	
	if (!args[0]->IsObject() || !args[1]->IsObject())
	{
		return NanThrowTypeError("Arguments 1-2 must be buffers");
	}

	v8::Handle<v8::Object> layoutBuffer = args[0]->ToObject();
	v8::Handle<v8::Object> chunkBuffer = args[1]->ToObject();

	if (!Buffer::HasInstance(layoutBuffer) || !Buffer::HasInstance(chunkBuffer))
	{
		return NanThrowTypeError("Arguments 1-2 must be buffers");
	}
	
	if (!args[2]->IsObject())
	{
		return NanThrowTypeError("Argument 3 must be object");
	}
	
	// parse the state
	OutputState outputState;
	memset(&outputState, 0, sizeof(outputState));
	Local<Object> inputState = args[2].As<Object>();
	outputState.layoutPos = 		inputState->Get(String::NewSymbol("layoutPos"))->NumberValue();
	outputState.chunkType = 		inputState->Get(String::NewSymbol("chunkType"))->NumberValue();
	outputState.chunkStartOffset = 	inputState->Get(String::NewSymbol("chunkStartOffset"))->NumberValue();

	// process the chunk
	uint32_t chunkOutputStart = 0;
	uint32_t chunkOutputEnd = 0;
	bool moreDataNeeded = true;

	processChunkImpl(
		Buffer::Data(args[0]->ToObject()),
		Buffer::Length(args[0]->ToObject()),
		Buffer::Data(args[1]->ToObject()),
		Buffer::Length(args[1]->ToObject()),
		&outputState,
		&chunkOutputStart,
		&chunkOutputEnd, 
		&moreDataNeeded);
	
	// update the state
	inputState->Set(String::NewSymbol("layoutPos"), Number::New(outputState.layoutPos));
	inputState->Set(String::NewSymbol("chunkType"), Number::New(outputState.chunkType));
	inputState->Set(String::NewSymbol("chunkStartOffset"), Number::New(outputState.chunkStartOffset));
	
	// output the result
	Local<Object> result = Object::New();
	result->Set(String::NewSymbol("chunkOutputStart"), Number::New(chunkOutputStart));
	result->Set(String::NewSymbol("chunkOutputEnd"), Number::New(chunkOutputEnd));
	result->Set(String::NewSymbol("moreDataNeeded"), Boolean::New(moreDataNeeded));
	
	NanReturnValue(result);
}

NAN_METHOD(GetChunkCount) {
	NanScope();

	// validate input
	if (args.Length() < 1) 
	{
		return NanThrowTypeError("Function requires one argument");
	}
	
	if (!args[0]->IsObject())
	{
		return NanThrowTypeError("Argument must be buffer");
	}
		
	v8::Handle<v8::Object> inputObject = args[0]->ToObject();
	if (!Buffer::HasInstance(inputObject))
	{
		return NanThrowTypeError("Argument must be buffer");
	}
	
	if (Buffer::Length(inputObject) < sizeof(metadata_header_t))
	{
		return NanThrowTypeError("Invalid metadata buffer");
	}
	
	Local<Number> result = Number::New(((metadata_header_t*)Buffer::Data(inputObject))->chunk_count);
	NanReturnValue(result);
}

void init(Handle<Object> exports) 
{
	exports->Set(String::NewSymbol("buildLayout"), FunctionTemplate::New(BuildLayout)->GetFunction());
	exports->Set(String::NewSymbol("processChunk"), FunctionTemplate::New(ProcessChunk)->GetFunction());
	exports->Set(String::NewSymbol("getChunkCount"), FunctionTemplate::New(GetChunkCount)->GetFunction());
}

NODE_MODULE(TsStitcher, init)
