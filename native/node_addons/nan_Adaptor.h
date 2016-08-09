#ifndef __NAN_ADAPTOR_H__
#define __NAN_ADAPTOR_H__

using namespace std;
class myNan {
public:
template< typename T>
    static v8::Local<T> newNanConstructor(const char* str) {
        return Nan::New<T>(str).ToLocalChecked();
    }
};
//override define in nan.h
#ifdef NAN_METHOD
#undef NAN_METHOD
#define NAN_METHOD(name) Nan::NAN_METHOD_RETURN_TYPE name(const FunctionCallbackInfo<v8::Value>& args)
#endif //NAN_METHOD(name)

#ifndef NanScope
    //Deprecated from nan new module
    #define NanScope()  Isolate* isolate = Isolate::GetCurrent(); v8::HandleScope scope(isolate)
#endif //NanScope()

#ifndef NanThrowError
    //Change location in nan new module
    #define NanThrowTypeError(err) Nan::ThrowError(err)
    #define NanThrowError(err) Nan::ThrowError(err)
#endif //NanThrowError

#ifndef NanReturnValue
    //Deprecated from nan new module
    #define NanReturnValue(result)  return args.GetReturnValue().Set(result)
#endif //NanReturnValue()

#ifndef NanReturnNull
    //Deprecated from nan new module
    #define NanReturnNull()  return args.GetReturnValue().SetNull()
#endif //NanReturnNull()

#ifndef NanNewBufferHandle
    //Using CopyBuffer instead of NewBuffer because the Copy:
        //Using Nan::NewBuffer will not free the char* from memory so you will have to do it yourself.
        //The problem is that by adding delete []data you're getting into a race condition -
        //the data can be deleted from the buffer before returning to node.
    // for reduce changes the original code we use CopyBuffer
    #define NanNewBufferHandle(arg1,arg2) Nan::CopyBuffer(arg1,arg2).ToLocalChecked()
#endif //NanNewBufferHandle

#ifndef NanNew
    //Change location in nan new module
    //but don't support Local but MaybeLocal -> add .ToLocalChecked()
    //suppose using this only for string (args as const char*)
    #define NanNew myNan::newNanConstructor
#endif //NanNew

#ifndef NanNewNumber
    //To hide isolate use from the user
    #define NanNewNumber(val) Number::New(isolate, val)
#endif //NanNew



#endif // __NAN_ADAPTOR_H__
