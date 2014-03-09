
#ifdef  _WIN32
#include "Win32Functions.h"
#else
#include <sys/time.h>
#endif
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdio.h>
#include "common.h"

double microtime()
{
	struct timeval tp = {0};

	if (gettimeofday(&tp, NULL)) 
	{
		printf("gettimeofday failed, errno=%d", errno);
		return 0;
	}

	return ((double)(tp.tv_sec + tp.tv_usec / 1000000.00));
}

bool_t search_pattern(const byte_t* buffer, size_t size, const byte_t* pattern, size_t pattern_size)
{
	const byte_t* buffer_end = buffer + size;

	for (; buffer + pattern_size <= buffer_end; buffer++)
	{
		if (memcmp(buffer, pattern, pattern_size) == 0)
		{
			return TRUE;
		}
	}
	return FALSE;
}
