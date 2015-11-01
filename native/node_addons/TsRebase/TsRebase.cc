#include "nan.h"
#include "ts_rebase_impl.h"

// object keys
#define CONTEXT_EXPECTED_DTS			"expectedDts"
#define CONTEXT_TOTAL_FRAME_DURATIONS	"totalFrameDurations"
#define CONTEXT_TOTAL_FRAME_COUNT		"totalFrameCount"

using namespace v8;
using namespace node;

/*
	Parameters
	0	Object context
			Number expectedDts
			Number totalFrameDurations
			Number totalFrameCount
	1	Buffer tsData
		
	Returns
		Number tsDuration
*/
NAN_METHOD(RebaseTs)
{
	NanScope();
	
	// validate args
	if (args.Length() < 2)
	{
		return NanThrowTypeError("Function requires 2 arguments");
	}
	
	if (!args[0]->IsObject())
	{
		return NanThrowTypeError("Argument 1 must be an object");
	}

	if (!args[1]->IsObject() || !Buffer::HasInstance(args[1]))
	{
		return NanThrowTypeError("Argument 2 must be a buffer");
	}

	// parse the context
	ts_rebase_context_t context;
	Local<Value> curValue;
	Local<Object> inputContext = args[0]->ToObject();
	
	curValue = inputContext->Get(NanNew<String>(CONTEXT_EXPECTED_DTS));
	context.expected_dts = curValue->IsNumber() ? curValue->IntegerValue() : NO_TIMESTAMP;

	curValue = inputContext->Get(NanNew<String>(CONTEXT_TOTAL_FRAME_DURATIONS));
	context.total_frame_durations = curValue->IsNumber() ? curValue->IntegerValue() : 0;

	curValue = inputContext->Get(NanNew<String>(CONTEXT_TOTAL_FRAME_COUNT));
	context.total_frame_count = curValue->IsNumber() ? curValue->IntegerValue() : 0;

	// perform the rebase
	uint64_t duration;

	ts_rebase_impl(
		&context,
		(u_char*)Buffer::Data(args[1]->ToObject()),
		Buffer::Length(args[1]->ToObject()), 
		&duration);

	// update the context object
	inputContext->Set(NanNew<String>("expectedDts"), NanNew<Number>(context.expected_dts));
	inputContext->Set(NanNew<String>("totalFrameDurations"), NanNew<Number>(context.total_frame_durations));
	inputContext->Set(NanNew<String>("totalFrameCount"), NanNew<Number>(context.total_frame_count));
	
	Local<Value> result = NanNew<Number>(duration);

	NanReturnValue(result);
}

void init(Handle<Object> exports) 
{
	exports->Set(NanNew<String>("rebaseTs"), NanNew<FunctionTemplate>(RebaseTs)->GetFunction());
}

NODE_MODULE(TsRebase, init)
