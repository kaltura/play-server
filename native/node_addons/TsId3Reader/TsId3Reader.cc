#include "nan.h"
#include <id3/tag.h>
#include <id3/readers.h>
#include <id3/misc_support.h>

#include "mpegTs.h"
#include "common.h"

using namespace v8;
using namespace node;

const char* id3FieldNames[] = {			// must match ID3_FieldID in order
	"NOFIELD",		  /**< No field */
	"TEXTENC",        /**< Text encoding (unicode or ASCII) */
	"TEXT",           /**< Text field */
	"URL",            /**< A URL */
	"DATA",           /**< Data field */
	"DESCRIPTION",    /**< Description field */
	"OWNER",          /**< Owner field */
	"EMAIL",          /**< Email field */
	"RATING",         /**< Rating field */
	"FILENAME",       /**< Filename field */
	"LANGUAGE",       /**< Language field */
	"PICTURETYPE",    /**< Picture type field */
	"IMAGEFORMAT",    /**< Image format field */
	"MIMETYPE",       /**< Mimetype field */
	"COUNTER",        /**< Counter field */
	"ID",             /**< Identifier/Symbol field */
	"VOLUMEADJ",      /**< Volume adjustment field */
	"NUMBITS",        /**< Number of bits field */
	"VOLCHGRIGHT",    /**< Volume chage on the right channel */
	"VOLCHGLEFT",     /**< Volume chage on the left channel */
	"PEAKVOLRIGHT",   /**< Peak volume on the right channel */
	"PEAKVOLLEFT",    /**< Peak volume on the left channel */
	"TIMESTAMPFORMAT",/**< SYLT Timestamp Format */
	"CONTENTTYPE",    /**< SYLT content type */
};

///////////

typedef struct {
	int audio_pid;
	int video_pid;
	int id3_pid;
	int64_t initial_video_pts;
	int64_t initial_audio_pts;
	ts_packetizer_state_t packetizer_state;
} stream_walker_state_t;

void stream_walker_init(stream_walker_state_t* state, packetizer_callback_t callback, void* callback_context)
{
	memset(state, 0, sizeof(*state));
	state->initial_video_pts = NO_TIMESTAMP;
	state->initial_audio_pts = NO_TIMESTAMP;
	ts_packetizer_init(&state->packetizer_state, callback, callback_context);
}

void stream_walker_pmt_header_callback(void* context, const pmt_t* pmt_header)
{
	stream_walker_state_t* state = (stream_walker_state_t*)context;
	
	state->audio_pid = 0;
	state->video_pid = 0;
	state->id3_pid = 0;
}

void stream_walker_pmt_entry_callback(void* context, const pmt_entry_t* pmt_entry, int size)
{
	stream_walker_state_t* state = (stream_walker_state_t*)context;
	
	switch (pmt_entry_get_streamType(pmt_entry))
	{
	case STREAM_TYPE_AUDIO_AAC:
		state->audio_pid = pmt_entry_get_elementaryPID(pmt_entry);
		break;
		
	case STREAM_TYPE_VIDEO_H264:
		state->video_pid = pmt_entry_get_elementaryPID(pmt_entry);
		break;
		
	default:
		if (search_pattern(pmt_entry, size, (const byte_t*)"ID3 ", 4))
		{
			state->id3_pid = pmt_entry_get_elementaryPID(pmt_entry);
		}
	}
}

bool_t stream_walker_packet_data_callback(void* context, int cur_pid, const byte_t* packet, int size)
{
	stream_walker_state_t* state = (stream_walker_state_t*)context;
	
	if (cur_pid == state->audio_pid && state->initial_audio_pts == NO_TIMESTAMP)
	{
		state->initial_audio_pts = get_pts_from_packet(packet, size);
	}
	else if (cur_pid == state->video_pid && state->initial_video_pts == NO_TIMESTAMP)
	{
		state->initial_video_pts = get_pts_from_packet(packet, size);
	}
	else if (cur_pid == state->id3_pid)
	{
		if (!ts_packetizer_process_data(&state->packetizer_state, packet, size))
		{
			return FALSE;
		}			
	}
	return TRUE;
}

void stream_walker_free(stream_walker_state_t* state)
{
	ts_packetizer_free(&state->packetizer_state);
}


	
void ParseID3Tag(void* context, const byte_t* buf, int size, int64_t pts)
{
	Local<Array>& result = *(Local<Array>*)context;
	Local<Object> tagResult = Object::New();
	ID3_Tag id3Tag;

	tagResult->Set(String::NewSymbol("PTS"), Number::New(pts));
	
	result->Set(result->Length(), tagResult);
	
	ID3_MemoryReader mr(buf, size);
	if (!id3Tag.Parse(mr))
	{
		return;
	}

	ID3_Tag::Iterator* frameIter = id3Tag.CreateIterator();
	ID3_Frame* id3Frame = NULL;
	while (NULL != (id3Frame = frameIter->GetNext()))
	{
		Local<Object> frameResult = Object::New();
		
		ID3_Frame::Iterator* fieldIter = id3Frame->CreateIterator();
		ID3_Field* id3Field = NULL;
		while (NULL != (id3Field = fieldIter->GetNext()))
		{
			const char* fieldName = id3FieldNames[0];
			
			if (id3Field->GetID() < ARRAY_ENTRIES(id3FieldNames))
			{
				fieldName = id3FieldNames[id3Field->GetID()];
			}
		
			switch (id3Field->GetType())
			{
			case ID3FTY_INTEGER:
				frameResult->Set(String::NewSymbol(fieldName), Number::New(id3Field->Get()));
				break;

			case ID3FTY_TEXTSTRING: 
			{
				char *value = ID3_GetString(id3Frame, id3Field->GetID());
				frameResult->Set(String::NewSymbol(fieldName), String::New(value));
				ID3_FreeString(value);
				break;
			}

			default:;	// unsupported
			}
		}
		delete fieldIter;
		
		tagResult->Set(String::NewSymbol(id3Frame->GetTextID()), frameResult);
	}
	delete frameIter;
}

NAN_METHOD(ParseBuffer) {
	NanScope();

	if (args.Length() < 1) {
		return NanThrowTypeError("Function requires 1 argument");
	}
  
	if (!args[0]->IsObject() || !Buffer::HasInstance(args[0])) {
		return NanThrowTypeError("Expected buffer argument");
	}

	Local<Array> id3TagArray = Array::New();
	
	stream_walker_state_t stream_walker_state;

	stream_walker_init(&stream_walker_state, ParseID3Tag, &id3TagArray);

	walk_ts_streams(
		(const byte_t*)Buffer::Data(args[0]->ToObject()), 
		Buffer::Length(args[0]->ToObject()),
		stream_walker_pmt_header_callback,
		stream_walker_pmt_entry_callback,
		stream_walker_packet_data_callback,
		&stream_walker_state);
	
	stream_walker_free(&stream_walker_state);
			
	Local<Object> result = Object::New();
	result->Set(String::NewSymbol("videoPts"), Number::New(stream_walker_state.initial_video_pts));
	result->Set(String::NewSymbol("audioPts"), Number::New(stream_walker_state.initial_audio_pts));
	result->Set(String::NewSymbol("id3tags"), id3TagArray);	
	NanReturnValue(result);
}

void init(Handle<Object> exports)
{
	exports->Set(String::NewSymbol("parseBuffer"), FunctionTemplate::New(ParseBuffer)->GetFunction());
}

NODE_MODULE(TsId3Reader, init)
