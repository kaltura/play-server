#include <sys/stat.h>
#include <stdlib.h>
#include <stdio.h>
#include <errno.h>
#include "basicIo.h"

bool_t walk_command_output(const char* cmd, walk_output_callback_t callback, void* context)
{
	double start_time;
	FILE *fp;
	char line[1024];

	printf("Executing %s\n", cmd);
	start_time = microtime();
	
	fp = popen(cmd, "r");
	if (fp == NULL) 
	{
		printf("Failed to run command %s, errno=%d\n", cmd, errno);
		return FALSE;
	}

	while (fgets(line, sizeof(line) - 1, fp) != NULL) 
	{
		callback(context, line);
	}

	printf("Done, took %f\n", microtime() - start_time);
	
	pclose(fp);
	return TRUE;
}

byte_t* read_files(char** files, int file_count, size_t* read_size)
{
	struct stat st;
	size_t total_size = 0;
	byte_t* result = NULL;
	byte_t* read_buf = NULL;
	byte_t* read_pos = NULL;
	FILE *fp = NULL;
	size_t* file_sizes = NULL;
	int cur_file;
	
	file_sizes = malloc(sizeof(file_sizes[0]) * file_count);
	if (file_sizes == NULL)
	{
		printf("malloc failed, file_count=%d\n", file_count);
		goto cleanup;
	}

	for (cur_file = 0; cur_file < file_count; cur_file++)
	{
		if (stat(files[cur_file], &st) == -1)
		{
			printf("stat failed, file=%s, errno=%d\n", files[cur_file], errno);
			goto cleanup;
		}
		file_sizes[cur_file] = st.st_size;
		total_size += st.st_size;
	}
	
	read_buf = malloc(total_size);
	if (read_buf == NULL)
	{
		printf("malloc failed, total_size=%zd\n", total_size);
		goto cleanup;
	}
	read_pos = read_buf;
	
	for (cur_file = 0; cur_file < file_count; cur_file++)
	{
		fp = fopen(files[cur_file], "rb");
		if (fp == NULL)
		{
			printf("fopen failed, file=%s, errno=%d\n", files[cur_file], errno);
			goto cleanup;
		}
		
		if (fread(read_pos, 1, file_sizes[cur_file], fp) != file_sizes[cur_file])
		{
			printf("fread failed, errno=%d\n", errno);
			goto cleanup;
		}
		read_pos += file_sizes[cur_file];
		
		fclose(fp);
		fp = NULL;
	}
	
	*read_size = total_size;
	result = read_buf;
	read_buf = NULL;			// transferred ownership
	
cleanup:

	if (fp != NULL)
		fclose(fp);
		
	free(read_buf);
	free(file_sizes);
	return result;
}	

bool_t write_file(const char* output_file, const dynamic_buffer_t* segments, int segment_count)
{
	FILE *fp = NULL;
	int i;

	fp = fopen(output_file, "wb");
	if (fp == NULL)
	{
		printf("Failed to open file for writing, file=%s, errno=%d\n", output_file, errno);
		return FALSE;
	}
	
	for (i = 0; i < segment_count; i++)
	{
		if (fwrite(segments[i].data, 1, segments[i].write_pos, fp) != segments[i].write_pos)
		{
			printf("Failed to write to file, file=%s, errno=%d\n", output_file, errno);
			fclose(fp);
			return FALSE;
		}
	}

	fclose(fp);	
	return TRUE;
}

bool_t write_file_single(const char* output_file, byte_t* buffer, int len)
{
	dynamic_buffer_t segment;
	segment.data = buffer;
	segment.write_pos = len;	
	return write_file(output_file, &segment, 1);
}
