#include "mpegTsStreamInfo.h"
#include <linux/stddef.h>
#include <stdlib.h>

void 
streams_info_hash_init(streams_info_t* hash)
{
	int i;

	for (i = 0; i < STREAMS_INFO_HASH_SIZE; i++)
	{
		hash->data[i].pid = INVALID_PID;
		hash->data[i].start_cc = INVALID_CONTINUITY_COUNTER;
		hash->data[i].end_cc = INVALID_CONTINUITY_COUNTER;
	}
}

stream_info_t* 
streams_info_hash_get(streams_info_t* hash, int pid)
{
	int initial_hash_key;
	int hash_key;

	initial_hash_key = hash_key = pid % STREAMS_INFO_HASH_SIZE;
	for (;;)
	{
		if (hash->data[hash_key].pid == pid)
			break;
			
		if (hash->data[hash_key].pid == INVALID_PID)
		{
			hash->data[hash_key].pid = pid;
			break;
		}
		
		hash_key++;
		if (hash_key >= STREAMS_INFO_HASH_SIZE)
			hash_key -= STREAMS_INFO_HASH_SIZE;
		if (hash_key == initial_hash_key)
		{
			return NULL;
		}
	}
	
	return hash->data + hash_key;
}
