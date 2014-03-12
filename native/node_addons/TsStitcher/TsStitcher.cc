#include <stdlib.h>
#include "nan.h"
#include "ts_stitcher_impl.h"

using namespace v8;
using namespace node;


/*
void MyFreeCallback(char* data, void* hint)
{
	free(data);
}
*/

NAN_METHOD(BuildLayout) {
	NanScope();

	// validate input
	if (args.Length() < 7) 
	{
		return NanThrowTypeError("Function requires 7 arguments");
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
		
		argBuffers[i] = Buffer::Data(curObject);
		
		if (!is_metadata_buffer_valid(argBuffers[i], Buffer::Length(curObject)))
		{
			return NanThrowTypeError("Invalid metadata buffer");
		}
	}
		
	if (!args[4]->IsNumber() || !args[5]->IsNumber() || !args[6]->IsNumber()) 
	{
		return NanThrowTypeError("Arguments 5-7 must be numbers");
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
	
	if (argBuffers[STATE_POST_AD] == NULL && args[6]->NumberValue() == 0)
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
		args[5]->NumberValue(),
		args[6]->NumberValue());

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
	byte_t* outputBufferData = NULL;
	size_t outputBufferSize = 0;
	bool_t moreDataNeeded = TRUE;

	processChunkImpl(
		(byte_t*)Buffer::Data(args[0]->ToObject()),
		Buffer::Length(args[0]->ToObject()),
		(byte_t*)Buffer::Data(args[1]->ToObject()),
		Buffer::Length(args[1]->ToObject()),
		&outputState,
		&chunkOutputStart,
		&chunkOutputEnd, 
		&outputBufferData,
		&outputBufferSize,
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

	if (outputBufferData != NULL)
	{
		Local<Object> outputBuffer = NanNewBufferHandle((char*)outputBufferData, outputBufferSize);
		free(outputBufferData);

		result->Set(String::NewSymbol("outputBuffer"), outputBuffer);
	}
	
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
	
	if (!is_metadata_buffer_valid(Buffer::Data(inputObject), Buffer::Length(inputObject)))
	{
		return NanThrowTypeError("Invalid metadata buffer");
	}
	
	Local<Number> result = Number::New(get_chunk_count(Buffer::Data(inputObject)));
	NanReturnValue(result);
}

void init(Handle<Object> exports) 
{
	exports->Set(String::NewSymbol("buildLayout"), FunctionTemplate::New(BuildLayout)->GetFunction());
	exports->Set(String::NewSymbol("processChunk"), FunctionTemplate::New(ProcessChunk)->GetFunction());
	exports->Set(String::NewSymbol("getChunkCount"), FunctionTemplate::New(GetChunkCount)->GetFunction());
}

NODE_MODULE(TsStitcher, init)
