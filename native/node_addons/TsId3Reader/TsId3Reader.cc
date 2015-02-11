#include "nan.h"
#include <id3/tag.h>
#include <id3/readers.h>
#include <id3/misc_support.h>

#include "mpegts_stream_walker.h"
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
	
static void 
ParseID3Tag(void* context, const byte_t* buf, size_t size, int64_t pts)
{
	Local<Array>& result = *(Local<Array>*)context;
	Local<Object> tagResult = Object::New();
	ID3_Tag id3Tag;

	tagResult->Set(NanNew<String>("PTS"), Number::New(pts));
	
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
				frameResult->Set(NanNew<String>(fieldName), Number::New(id3Field->Get()));
				break;

			case ID3FTY_TEXTSTRING: 
			{
				char *value = ID3_GetString(id3Frame, id3Field->GetID());
				frameResult->Set(NanNew<String>(fieldName), String::New(value));
				ID3_FreeString(value);
				break;
			}

			default:;	// unsupported
			}
		}
		delete fieldIter;
		
		tagResult->Set(NanNew<String>(id3Frame->GetTextID()), frameResult);
	}
	delete frameIter;
}

/*
	Parameters
	0	Buffer tsBuffer,
		
	Returns
		Object
			Number videoPts
			Number audioPts
			Array<Object> id3tags
*/
NAN_METHOD(ParseBuffer) 
{
	NanScope();

	if (args.Length() < 1) 
	{
		return NanThrowTypeError("Function requires 1 argument");
	}
  
	if (!args[0]->IsObject() || !Buffer::HasInstance(args[0])) 
	{
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
	result->Set(NanNew<String>("videoPts"), Number::New(stream_walker_state.initial_video_pts));
	result->Set(NanNew<String>("audioPts"), Number::New(stream_walker_state.initial_audio_pts));
	result->Set(NanNew<String>("id3tags"), id3TagArray);	
	NanReturnValue(result);
}

void init(Handle<Object> exports)
{
	exports->Set(NanNew<String>("parseBuffer"), FunctionTemplate::New(ParseBuffer)->GetFunction());
}

NODE_MODULE(TsId3Reader, init)
