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

bool GetMetadataHeader(Local<Value> input, const metadata_header_t** result)
{
	*result = NULL;
	
	if (input->IsNull())
	{
		return true;
	}
	
	if (!input->IsObject())
	{
		return false;
	}
	
	v8::Handle<v8::Object> curObject = input->ToObject();
	if (!Buffer::HasInstance(curObject))
	{
		return false;
	}
	
	*result = (metadata_header_t*)Buffer::Data(curObject);
	if (!is_metadata_buffer_valid(*result, Buffer::Length(curObject)))
	{
		return false;
	}
	
	return true;
}

bool FillAdSectionData(Local<Object> inputSection, ad_section_t* result)
{
	// XXX need more validations here
	// XXX save the symbols instead of allocating every time
	result->ad_chunk_type = 	inputSection->Get(String::NewSymbol("adChunkType"))->Int32Value();
	result->filler_chunk_type = inputSection->Get(String::NewSymbol("fillerChunkType"))->Int32Value();
	result->start_pos = 		inputSection->Get(String::NewSymbol("startPos"))->Int32Value();
	result->end_pos = 			inputSection->Get(String::NewSymbol("endPos"))->Int32Value();
	result->alignment = 		(ad_section_alignment)inputSection->Get(String::NewSymbol("alignment"))->Int32Value();

	if (!GetMetadataHeader(inputSection->Get(String::NewSymbol("ad")), &result->ad_header))
	{
		return false;
	}
	
	if (!GetMetadataHeader(inputSection->Get(String::NewSymbol("filler")), &result->filler_header))
	{
		return false;
	}
	
	if (result->filler_header == NULL)
	{
		return false;
	}
	
	return true;
}

/*
	Parameters
	0	Buffer preAdMetadata
	1	Buffer postAdMetadata
	2	Array adSections of object:
			Number adChunkType
			Buffer ad
			Number fillerChunkType
			Buffer filler
			Number startPos		// 0 = start after previous
			Number endPos		// 0 = use video duration
			Number alignment
	3	Number segmentIndex
	4	Number outputStart
	5	Number outputEnd
*/
NAN_METHOD(BuildLayout) {
	NanScope();

	// validate input
	if (args.Length() < 6) 
	{
		return NanThrowTypeError("Function requires 6 arguments");
	}
	
	const metadata_header_t* argBuffers[2];
	memset(&argBuffers, 0, sizeof(argBuffers));
	
	for (int i = 0; i < 2; i++)
	{
		if (!GetMetadataHeader(args[i], &argBuffers[i]))
		{
			return NanThrowTypeError("Arguments 1-2 must be either null or metadata buffer");
		}
	}
	
	if (!args[2]->IsArray())
	{
		return NanThrowTypeError("Arguments 3 must be an array");
	}
		
	if (!args[3]->IsNumber() || !args[4]->IsNumber() || !args[5]->IsNumber()) 
	{
		return NanThrowTypeError("Arguments 4-6 must be numbers");
	}

	// check for mandatory buffers
	if (argBuffers[0] == NULL)
	{
		return NanThrowTypeError("Pre-ad segment must not be null");
	}

/*	if (argBuffers[1] == NULL && args[5]->Int32Value() == 0)
	{
		return NanThrowTypeError("Post-ad segment must not be null in the last segment");
	}*/
	
	// parse the ad sections array
	Local<Array> adSectionsArray = args[2].As<Array>();
	size_t adSectionsCount = adSectionsArray->Length();
	/*if (adSectionsCount < 1)
	{
		return NanThrowTypeError("Ad sections array must not be empty");
	}*/
	
	ad_section_t* adSections = (ad_section_t*)malloc(sizeof(ad_section_t) * adSectionsCount);
	if (adSections == NULL)
	{
		return NanThrowError("Not enough memory to allocate ad sections buffer");
	}
	
	for (size_t i = 0; i < adSectionsCount; i++) 
	{	
		if (!adSectionsArray->Get(i)->IsObject())
		{
			free(adSections);
			return NanThrowTypeError("Ad sections array must contain objects");
		}
		
		Local<Object> curObject = adSectionsArray->Get(i)->ToObject();
		if (!FillAdSectionData(curObject, adSections + i))
		{
			free(adSections);
			return NanThrowTypeError("Failed to process ad sections array element");
		}
	}
	
	// build the layout
	dynamic_buffer_t dynBuffer;
	memset(&dynBuffer, 0, sizeof(dynBuffer));
	
	bool_t status = build_layout(
		&dynBuffer,
		argBuffers[0],
		argBuffers[1],
		adSections,
		adSectionsCount,
		args[3]->Int32Value(),
		args[4]->Int32Value(),
		args[5]->Int32Value());

	free(adSections);
	
	if (!status)
	{
		// XXXX
	}
		
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
	output_state_t outputState;
	memset(&outputState, 0, sizeof(outputState));
	Local<Object> inputState = args[2].As<Object>();
	outputState.layout_pos = 		inputState->Get(String::NewSymbol("layoutPos"))->Uint32Value();
	outputState.chunk_type = 		inputState->Get(String::NewSymbol("chunkType"))->Int32Value();
	outputState.chunk_start_offset = 	inputState->Get(String::NewSymbol("chunkStartOffset"))->Uint32Value();

	// process the chunk
	process_output_t processResult;

	process_chunk(
		(byte_t*)Buffer::Data(args[0]->ToObject()),
		Buffer::Length(args[0]->ToObject()),
		(byte_t*)Buffer::Data(args[1]->ToObject()),
		Buffer::Length(args[1]->ToObject()),
		&outputState,
		&processResult);
	
	// update the state
	inputState->Set(String::NewSymbol("layoutPos"), Number::New(outputState.layout_pos));
	inputState->Set(String::NewSymbol("chunkType"), Number::New(outputState.chunk_type));
	inputState->Set(String::NewSymbol("chunkStartOffset"), Number::New(outputState.chunk_start_offset));
	
	// output the result
	Local<Object> result = Object::New();
	result->Set(String::NewSymbol("chunkOutputStart"), Number::New(processResult.chunk_output_start));
	result->Set(String::NewSymbol("chunkOutputEnd"), Number::New(processResult.chunk_output_end));
	result->Set(String::NewSymbol("action"), Number::New(processResult.action));

	if (processResult.output_buffer != NULL)
	{
		Local<Object> outputBuffer = NanNewBufferHandle((char*)processResult.output_buffer, processResult.output_buffer_size);
		free(processResult.output_buffer);

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
