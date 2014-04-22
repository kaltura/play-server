#include <stdlib.h>
#include "nan.h"
#include "ts_cutter_impl.h"

using namespace v8;
using namespace node;

dynamic_buffer_t* ParseArrayOfBuffers(Local<Value> value, size_t* resultCount)
{
	if (!value->IsArray())
	{
		return NULL;
	}

	Local<Array> buffersArray = value.As<Array>();
	size_t buffersCount = buffersArray->Length();
	if (buffersCount < 1)
	{
		return NULL;
	}
	
	dynamic_buffer_t* buffers = (dynamic_buffer_t*)malloc(sizeof(dynamic_buffer_t) * buffersCount);
	if (buffers == NULL)
	{
		return NULL;
	}
	
	for (size_t i = 0; i < buffersCount; i++) 
	{
		if (!buffersArray->Get(i)->IsObject())
		{
			free(buffers);
			return NULL;
		}
		
		Local<Object> curObject = buffersArray->Get(i)->ToObject();
		if (!Buffer::HasInstance(curObject))
		{
			free(buffers);
			return NULL;
		}
	
		buffers[i].data = (byte_t*)Buffer::Data(curObject);
		buffers[i].write_pos = Buffer::Length(curObject);
	}
	
	*resultCount = buffersCount;
	
	return buffers;
}

/*
	Parameters
		Array<Buffer> fileBuffers,
		String framesInfo,
		Number cutOffset
		Boolean leftPortion
		
	Returns
		Object
*/
NAN_METHOD(GetCutDetails) {
	NanScope();
	
	if (args.Length() < 4) 
	{
		return NanThrowTypeError("Function requires 4 arguments");
	}
	
	// validate frames info
	if (!args[1]->IsString())
	{
		return NanThrowTypeError("Argument 2 must be a string");
	}

	v8::String::Utf8Value framesBuffer(args[1]);
	
	// validate cut position
	if (!args[2]->IsNumber()) 
	{
		return NanThrowTypeError("Argument 3 must be a number");
	}
	
	// validate left portion
	if (!args[3]->IsBoolean()) 
	{
		return NanThrowTypeError("Argument 4 must be a boolean");
	}

	// parse file buffers
	size_t fileBuffersCount;
	dynamic_buffer_t* fileBuffers = ParseArrayOfBuffers(args[0], &fileBuffersCount);
	if (fileBuffers == NULL)
	{
		return NanThrowTypeError("Argument 1 must be a non-empty array of buffers");
	}
	
	// calculate the result	
	bounding_iframes_t bounding_iframes; 
	timestamps_t reference_timestamps[MEDIA_TYPE_COUNT];
	
	if (!get_cut_details(
		fileBuffers,
		fileBuffersCount,
		*framesBuffer,
		framesBuffer.length(),
		args[2]->Int32Value(),
		args[3]->BooleanValue(),
		&bounding_iframes, 
		reference_timestamps))
	{
		free(fileBuffers);
		return NanThrowTypeError("Failed to get the cut details");
	}

	free(fileBuffers);
	
	Local<Object> timestamps = Object::New();
	
	Local<Object> audioTimestamps = Object::New();
	audioTimestamps->Set(String::NewSymbol("pcr"), Number::New(reference_timestamps[MEDIA_TYPE_AUDIO].pcr));
	audioTimestamps->Set(String::NewSymbol("pts"), Number::New(reference_timestamps[MEDIA_TYPE_AUDIO].pts));
	audioTimestamps->Set(String::NewSymbol("dts"), Number::New(reference_timestamps[MEDIA_TYPE_AUDIO].dts));
	timestamps->Set(String::NewSymbol("audio"), audioTimestamps);

	Local<Object> videoTimestamps = Object::New();
	videoTimestamps->Set(String::NewSymbol("pcr"), Number::New(reference_timestamps[MEDIA_TYPE_VIDEO].pcr));
	videoTimestamps->Set(String::NewSymbol("pts"), Number::New(reference_timestamps[MEDIA_TYPE_VIDEO].pts));
	videoTimestamps->Set(String::NewSymbol("dts"), Number::New(reference_timestamps[MEDIA_TYPE_VIDEO].dts));	
	timestamps->Set(String::NewSymbol("video"), videoTimestamps);
	
	Local<Object> frames = Object::New();
	frames->Set(String::NewSymbol("leftPos"), 		Number::New(bounding_iframes.left_iframe->pos));
	frames->Set(String::NewSymbol("leftOffset"), 	Number::New(bounding_iframes.left_iframe_offset));
	frames->Set(String::NewSymbol("rightPos"), 		Number::New(bounding_iframes.right_iframe->pos));
	frames->Set(String::NewSymbol("rightOffset"), 	Number::New(bounding_iframes.right_iframe_offset));
	
	Local<Object> result = Object::New();
	result->Set(String::NewSymbol("frames"), frames);
	result->Set(String::NewSymbol("timestamps"), timestamps);
	
	NanReturnValue(result);
}

/*
	Parameters
		Buffer fileBuffer,
		String framesInfo,
		Object timestamps
		Boolean leftPortion
		
	Returns
		Undefined
*/
NAN_METHOD(FixTimestamps) {
	NanScope();

	if (args.Length() < 4) 
	{
		return NanThrowTypeError("Function requires 4 arguments");
	}
	
	// validate source buffer
	if (!args[0]->IsObject())
	{
		return NanThrowTypeError("Argument 1 must be a buffer");
	}
	
	Local<Object> bufferObject = args[0]->ToObject();
	if (!Buffer::HasInstance(bufferObject))
	{
		return NanThrowTypeError("Argument 1 must be a buffer");
	}

	// validate frames info
	if (!args[1]->IsString())
	{
		return NanThrowTypeError("Argument 2 must be a string");
	}

	v8::String::Utf8Value framesBuffer(args[1]);

	// validate timestamps
	if (!args[2]->IsObject()) 
	{
		return NanThrowTypeError("Argument 3 must be an object");
	}

	Local<Object> timestampsObject = args[2]->ToObject();

	Local<Value> audioValue = timestampsObject->Get(String::NewSymbol("audio"));
	if (!audioValue->IsObject())
	{
		return NanThrowTypeError("Argument 3 must contain objects");
	}
	Local<Object> audioObject = audioValue->ToObject();

	Local<Value> videoValue = timestampsObject->Get(String::NewSymbol("video"));
	if (!videoValue->IsObject())
	{
		return NanThrowTypeError("Argument 3 must contain objects");
	}
	Local<Object> videoObject = videoValue->ToObject();
	
	timestamps_t reference_timestamps[MEDIA_TYPE_COUNT];
	reference_timestamps[MEDIA_TYPE_AUDIO].pcr = audioObject->Get(String::NewSymbol("pcr"))->IntegerValue();
	reference_timestamps[MEDIA_TYPE_AUDIO].pts = audioObject->Get(String::NewSymbol("pts"))->IntegerValue();
	reference_timestamps[MEDIA_TYPE_AUDIO].dts = audioObject->Get(String::NewSymbol("dts"))->IntegerValue();
	reference_timestamps[MEDIA_TYPE_VIDEO].pcr = videoObject->Get(String::NewSymbol("pcr"))->IntegerValue();
	reference_timestamps[MEDIA_TYPE_VIDEO].pts = videoObject->Get(String::NewSymbol("pts"))->IntegerValue();
	reference_timestamps[MEDIA_TYPE_VIDEO].dts = videoObject->Get(String::NewSymbol("dts"))->IntegerValue();
	
	// validate left portion
	if (!args[3]->IsBoolean()) 
	{
		return NanThrowTypeError("Argument 4 must be a boolean");
	}

	// fix the timestamps
	if (!fix_timestamps(
		(byte_t*)Buffer::Data(bufferObject),
		Buffer::Length(bufferObject),
		*framesBuffer,
		framesBuffer.length(),
		reference_timestamps,
		args[3]->BooleanValue()))
	{
		return NanThrowTypeError("Failed to fix timestamps");
	}
	
	NanReturnUndefined();
}

/*
	Parameters
		Buffer fileBuffer
		
	Returns
		Object
*/
NAN_METHOD(FindLastPatPmtPackets) {
	NanScope();

	if (args.Length() < 1) 
	{
		return NanThrowTypeError("Function requires 1 argument");
	}
	
	// validate source buffer
	if (!args[0]->IsObject())
	{
		return NanThrowTypeError("Argument 1 must be a buffer");
	}
	
	Local<Object> bufferObject = args[0]->ToObject();
	if (!Buffer::HasInstance(bufferObject))
	{
		return NanThrowTypeError("Argument 1 must be a buffer");
	}
	
	byte_t* sourceBuffer = (byte_t*)Buffer::Data(bufferObject);
	byte_t* lastPatPacket;
	byte_t* lastPmtPacket;
	
	if (!find_last_pat_pmt_packets(
		sourceBuffer,
		Buffer::Length(bufferObject),
		&lastPatPacket, 
		&lastPmtPacket))
	{
		NanReturnNull();
	}
	
	Local<Object> result = Object::New();
	result->Set(String::NewSymbol("pat"), Number::New(lastPatPacket - sourceBuffer));
	result->Set(String::NewSymbol("pmt"), Number::New(lastPmtPacket - sourceBuffer));
	
	NanReturnValue(result);
}

/*
	Parameters
		Array<Buffer> fileBuffers,
		
	Returns
		Undefined
*/
NAN_METHOD(FixContinuityForward) {
	NanScope();

	if (args.Length() < 1) 
	{
		return NanThrowTypeError("Function requires 1 arguments");
	}
	
	size_t fileBuffersCount;
	dynamic_buffer_t* fileBuffers = ParseArrayOfBuffers(args[0], &fileBuffersCount);
	if (fileBuffers == NULL)
	{
		return NanThrowTypeError("Argument 1 must be a non-empty array of buffers");
	}

	fix_continuity_forward(fileBuffers, fileBuffersCount);
	
	free(fileBuffers);
	
	NanReturnUndefined();
}
	
/*
	Parameters
		Array<Buffer> fileBuffers,
		
	Returns
		Undefined
*/
NAN_METHOD(FixContinuityBackward) {
	NanScope();

	if (args.Length() < 1) 
	{
		return NanThrowTypeError("Function requires 1 arguments");
	}
	
	size_t fileBuffersCount;
	dynamic_buffer_t* fileBuffers = ParseArrayOfBuffers(args[0], &fileBuffersCount);
	if (fileBuffers == NULL)
	{
		return NanThrowTypeError("Argument 1 must be a non-empty array of buffers");
	}

	fix_continuity_backward(fileBuffers, fileBuffersCount);
	
	free(fileBuffers);
	
	NanReturnUndefined();
}

void init(Handle<Object> exports) 
{
	exports->Set(String::NewSymbol("getCutDetails"), FunctionTemplate::New(GetCutDetails)->GetFunction());
	exports->Set(String::NewSymbol("fixTimestamps"), FunctionTemplate::New(FixTimestamps)->GetFunction());
	exports->Set(String::NewSymbol("findLastPatPmtPackets"), FunctionTemplate::New(FindLastPatPmtPackets)->GetFunction());
	exports->Set(String::NewSymbol("fixContinuityForward"), FunctionTemplate::New(FixContinuityForward)->GetFunction());
	exports->Set(String::NewSymbol("fixContinuityBackward"), FunctionTemplate::New(FixContinuityBackward)->GetFunction());
}

NODE_MODULE(TsCutter, init)
