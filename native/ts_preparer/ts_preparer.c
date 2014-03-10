/*

To compile (TODO create Makefile):
	gcc ../common/src/basicIo.c ../common/src/common.c ../common/src/dynamicBuffer.c ../common/src/ffprobe.c ../common/src/mpegTs.c ts_preparer.c -o ts_preparer -I../common/include -Wall -lmemcached

Test command line:
	./ts_preparer /tmp/downloadedTS/postAd-e69fa096bd0736fef2a93923163822a6-abcd139435656.ts /web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh localhost 11211 1000 mukkaukk

Install libmemcached:
	wget https://launchpad.net/libmemcached/1.0/1.0.18/+download/libmemcached-1.0.18.tar.gz
	tar zxvf libmemcached-1.0.18.tar.gz
	cd libmemcached-1.0.18
	./configure
	make
	make install
	ldconfig			# refresh loader cache
	
*/
#include <libmemcached/memcached.h>
#include <stdio.h>

#include "mpegTsMetadata.h"
#include "dynamicBuffer.h"
#include "ffprobe.h"
#include "basicIo.h"
#include "mpegTs.h"

#define MAX_KEY_POSTFIX_SIZE (20)

bool_t prepare_ts_data(
	const byte_t* file_data, 
	size_t file_size, 
	const frame_info_t* frames, 
	int frame_count, 
	dynamic_buffer_t* output_metadata, 
	dynamic_buffer_t* output_data)
{
	metadata_header_t metadata_header;
	metadata_frame_info_t cur_frame_info;
	timestamps_t cur_timestamps;
	timestamps_t* target_timestamps;
	const frame_info_t* cur_frame;
	const frame_info_t* frames_end = frames + frame_count;
	int durations[MEDIA_TYPE_COUNT];
	unsigned int i;
	const byte_t* start_pos;
	const byte_t* end_pos;
	const byte_t* cur_packet;
	int cur_pid;
	
	// initialize locals
	memset(&durations, 0, sizeof(durations));
	memset(&metadata_header, 0, sizeof(metadata_header));
	
	for (i = 0; i < ARRAY_ENTRIES(metadata_header.timestamps); i++)
	{
		reset_timestamps(&metadata_header.timestamps[i]);
	}

	// pre-allocate the buffers to avoid the need to realloc them later
	if (!resize_buffer(output_metadata, sizeof(metadata_header) + sizeof(cur_frame_info) * frame_count))
	{
		printf("Failed to allocate output metadata buffer\n");
		return FALSE;
	}

	if (!resize_buffer(output_data, file_size))
	{
		printf("Failed to allocate output data buffer\n");
		return FALSE;
	}

	// append the metadata header
	metadata_header.ts_header_size = frames[0].pos;
	metadata_header.frame_count = frame_count;
	if (!append_buffer(output_metadata, PS(metadata_header)))
	{
		printf("Failed to append metadata header\n");
		return FALSE;
	}

	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		// initialize TS packet start / end pos
		start_pos = file_data + cur_frame->pos;
		end_pos = file_data;
		if (cur_frame + 1 < frames_end)
			end_pos += cur_frame[1].pos;		// current frame runs until the start pos of the next frame
		else
			end_pos += file_size;				// it's the last frame, read until end of file
		end_pos -= TS_PACKET_LENGTH - 1;		// in case the input is somehow not a multiple of packets, avoid overflow
			
		// save the frame start position
		cur_frame_info.pos = output_data->write_pos;

		// update audio / video pids
		cur_pid = mpeg_ts_header_get_PID(start_pos);
		switch (cur_frame->media_type)
		{
		case MEDIA_TYPE_AUDIO:
			metadata_header.audio_pid = cur_pid;
			break;
			
		case MEDIA_TYPE_VIDEO:
			metadata_header.video_pid = cur_pid;
			break;
		}

		// copy the packet while filtering only the relevant stream id
		for (cur_packet = start_pos; cur_packet < end_pos; cur_packet += TS_PACKET_LENGTH)
		{
			if (mpeg_ts_header_get_PID(cur_packet) != cur_pid)
			{
				continue;
			}
				
			if (!append_buffer(output_data, cur_packet, TS_PACKET_LENGTH))
			{
				printf("Failed to append packet data\n");
				return FALSE;
			}
		}

		// append frame info
		cur_frame_info.size = output_data->write_pos - cur_frame_info.pos;
		cur_frame_info.duration = cur_frame->duration;
		cur_frame_info.media_type = cur_frame->media_type;
		get_timestamp_offsets(start_pos, &cur_frame_info.timestamp_offsets);
		
		if (!append_buffer(output_metadata, PS(cur_frame_info)))
		{
			printf("Failed to append frame info\n");
			return FALSE;
		}
		
		// update timestamps
		get_timestamps(start_pos, &cur_frame_info.timestamp_offsets, &cur_timestamps);		
		target_timestamps = &metadata_header.timestamps[cur_frame->media_type];
		
		if (target_timestamps->pcr == NO_TIMESTAMP && cur_timestamps.pcr != NO_TIMESTAMP)
		{
			target_timestamps->pcr = cur_timestamps.pcr - durations[cur_frame->media_type];
		}
		if (target_timestamps->pts == NO_TIMESTAMP && cur_timestamps.pts != NO_TIMESTAMP)
		{
			target_timestamps->pts = cur_timestamps.pts - durations[cur_frame->media_type];
		}
		if (target_timestamps->dts == NO_TIMESTAMP && cur_timestamps.dts != NO_TIMESTAMP)
		{
			target_timestamps->dts = cur_timestamps.dts - durations[cur_frame->media_type];
		}
		
		durations[cur_frame->media_type] += cur_frame->duration;
	}

	// use the pts in case a dts was not found
	for (i = 0; i < ARRAY_ENTRIES(metadata_header.timestamps); i++)
	{
		if (metadata_header.timestamps[i].pts != NO_TIMESTAMP && metadata_header.timestamps[i].dts == NO_TIMESTAMP)
		{
			metadata_header.timestamps[i].dts = metadata_header.timestamps[i].pts;
		}
	}

	// update the metadata header
	memcpy(metadata_header.durations, PS(durations));
	memcpy(output_metadata->data, PS(metadata_header));
	
	return TRUE;
}

int save_ts_data_to_memcache(memcached_st *memc, char* output_key, const char* output_key_base, time_t expiration, const byte_t* data, int size)
{
	const byte_t* end_pos = data + size;
	const byte_t* cur_pos;
	memcached_return rc;
	int chunk_count = 0;
	int chunk_size = 0;
	
	for (cur_pos = data; cur_pos < end_pos; cur_pos += chunk_size, chunk_count++)
	{
		sprintf(output_key, "%s-%d", output_key_base, chunk_count);
		chunk_size = MIN(end_pos - cur_pos, FILE_CHUNK_SIZE);
		rc = memcached_set(memc, output_key, strlen(output_key), (const char*)cur_pos, chunk_size, expiration, (uint32_t)0);
		if (rc != MEMCACHED_SUCCESS)
		{
			printf("Failed to set a data chunk in memcache, rc=%d\n", rc);
			return 0;
		}
	}
	
	return chunk_count;
}

int compare_frame_positions(const void* frame1, const void* frame2)
{
	return ((frame_info_t*)frame1)->pos - ((frame_info_t*)frame2)->pos;
}

typedef struct {
	const char* input_file;
	const char* ffprobe_bin;
	const char* memcache_host;
	int memcache_port;
	time_t expiration;
	const char* output_key;
} command_line_options_t;

bool_t parse_command_line(command_line_options_t* opts, int argc, char *argv[])
{
	if (argc < 7)
	{
		printf("Usage:\n\tts_preparer <source file> <ffprobe bin> <memcache host> <memcache port> <expiration> <output key>\n");
		return FALSE;
	}

	opts->input_file = argv[1];
	opts->ffprobe_bin = argv[2];
	opts->memcache_host = argv[3];
	opts->memcache_port = atoi(argv[4]);
	opts->expiration = atoi(argv[5]);
	opts->output_key = argv[6];
	return TRUE;
}

int main( int argc, char *argv[] )
{
	command_line_options_t opts;
	
	byte_t* file_data = NULL;
	size_t file_size;

	frame_info_t* frames = NULL;
	int frame_count;	

	dynamic_buffer_t output_data = { 0 };
	dynamic_buffer_t output_metadata = { 0 };

	memcached_server_st *servers = NULL;
	memcached_st* memc = NULL;
	memcached_return rc;

	char* output_key = NULL;
	int chunk_count;
	int result = 1;
	
	if (!parse_command_line(&opts, argc, argv))
	{
		goto cleanup;
	}
		
	// connect to memcache
	memc = memcached_create(NULL);
	if (memc == NULL)
	{
		printf("Failed to allocate memcache context\n");
		goto cleanup;
	}

	servers = memcached_server_list_append(servers, opts.memcache_host, opts.memcache_port, &rc);
	if (servers == NULL)
	{
		printf("Failed to append memcache server to list\n");
		goto cleanup;
	}
	
	rc = memcached_server_push(memc, servers);
	if (rc != MEMCACHED_SUCCESS)
	{
		printf("Failed to push memcache server list, rc=%d\n", rc);
		goto cleanup;
	}

	// allocate key buffer
	output_key = malloc(strlen(opts.output_key) + MAX_KEY_POSTFIX_SIZE);
	if (output_key == NULL)
	{
		printf("Failed to allocate key buffer\n");
		goto cleanup;
	}
  
	// read the source file
	file_data = read_file(opts.input_file, &file_size);
	if (file_data == NULL)
	{
		printf("Failed to read input file, file=%s", opts.input_file);
		goto cleanup;
	}

	// extract and sort the frames by pos
	frames = get_frames_single(opts.ffprobe_bin, opts.input_file, &frame_count);
	if (frames == NULL)
	{
		printf("Failed to get the input file frames, file=%s", opts.input_file);
		goto cleanup;
	}

	qsort(frames, frame_count, sizeof(frames[0]), &compare_frame_positions);

	// prepare the ts data & metadata
	if (!prepare_ts_data(file_data, file_size, frames, frame_count, &output_metadata, &output_data))
	{
		goto cleanup;
	}

	// save the data in chunks
	chunk_count = save_ts_data_to_memcache(memc, output_key, opts.output_key, opts.expiration, output_data.data, output_data.write_pos);
	if (chunk_count == 0)
	{
		goto cleanup;
	}

	// save the header
	sprintf(output_key, "%s-header", opts.output_key);
	rc = memcached_set(
		memc, 
		output_key, 
		strlen(output_key), 
		(const char*)file_data, 
		((metadata_header_t*)output_metadata.data)->ts_header_size, 
		opts.expiration, 
		(uint32_t)0);
	if (rc != MEMCACHED_SUCCESS)
	{
		printf("Failed to set the header chunk in memcache, rc=%d\n", rc);
		goto cleanup;
	}
	
	// update the metadata header
	((metadata_header_t*)output_metadata.data)->chunk_count = chunk_count;

	sprintf(output_key, "%s-metadata", opts.output_key);

	rc = memcached_set(
		memc, 
		output_key, 
		strlen(output_key), 
		(const char*)output_metadata.data, 
		output_metadata.write_pos, 
		opts.expiration, 
		(uint32_t)0);
	if (rc != MEMCACHED_SUCCESS)
	{
		printf("Failed to set the metadata in memcache, rc=%d\n", rc);
		goto cleanup;
	}
	
	result = 0;
	
cleanup:

	// Note: not freeing memory since the process quits (file_data, frames, output_data, output_metadata, servers, output_key)
	
	memcached_free(memc);

	return result;
}
