#include <stdlib.h>
#include <string.h>
#include "dynamicBuffer.h"

bool_t append_buffer(dynamic_buffer_t* buf, const void* data, int len)
{
	byte_t* new_data;
	int new_size;

	if (buf->write_pos + len > buf->alloc_size)
	{
		new_size = MAX(buf->write_pos + len, buf->alloc_size * 2);
		new_data = (byte_t*)realloc(buf->data, new_size);
		if (new_data == NULL)
			return FALSE;
		buf->data = new_data;
		buf->alloc_size = new_size;
	}
	
	memcpy(buf->data + buf->write_pos, data, len);
	buf->write_pos += len;
	return TRUE;
}

void free_buffer(dynamic_buffer_t* buf)
{
	free(buf->data);
}

