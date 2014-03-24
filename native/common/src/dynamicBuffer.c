#include <stdlib.h>
#include <string.h>
#include "dynamicBuffer.h"

bool_t append_buffer(dynamic_buffer_t* buf, const void* data, int len)
{
	int new_size;

	if (buf->write_pos + len > buf->alloc_size)
	{
		new_size = MAX(buf->write_pos + len, buf->alloc_size * 2);
		if (!resize_buffer(buf, new_size))
			return FALSE;
	}
	
	memcpy(buf->data + buf->write_pos, data, len);
	buf->write_pos += len;
	return TRUE;
}

bool_t alloc_buffer_space(dynamic_buffer_t* buf, int len)
{
	int new_size;

	if (buf->write_pos + len > buf->alloc_size)
	{
		new_size = MAX(buf->write_pos + len, buf->alloc_size * 2);
		if (!resize_buffer(buf, new_size))
			return FALSE;
	}
	
	return TRUE;
}

bool_t resize_buffer(dynamic_buffer_t* buf, int len)
{
	byte_t* new_data;
	
	new_data = (byte_t*)realloc(buf->data, len);
	if (new_data == NULL)
		return FALSE;
		
	buf->data = new_data;
	buf->alloc_size = len;
	buf->write_pos = MIN(buf->write_pos, len);
	return TRUE;
}

void free_buffer(dynamic_buffer_t* buf)
{
	free(buf->data);
}

