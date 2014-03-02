/* 
	To compile (TODO create Makefile):
gcc ../common/src/basicIo.c ../common/src/common.c ../common/src/dynamicBuffer.c ../common/src/ffprobe.c ../common/src/mpegTs.c ts_cutter.c -o ts_cutter -I../common/include -Wall

	Test command line:
gcc ts_cutter.c -Wall -o ts_cutter
./ts_cutter /tmp/ts_cutter_test.ts /web/content/shared/bin/ffmpeg-2.1-bin/ffmpeg-2.1.sh /web/content/shared/bin/ffmpeg-2.1-bin/ffprobe-2.1.sh 6182200000 right /opt/kaltura/app/alpha/web/erankTest/1208f27d347eb1e16b8ebda99f321f53-1.ts

*/

#include <sys/stat.h>
#include <inttypes.h>
#include <unistd.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "dynamicBuffer.h"
#include "basicIo.h"
#include "ffprobe.h"
#include "common.h"
#include "mpegTs.h"

#define TEMP_FILE_PATTERN "/tmp/adsXXXXXX"
#define CLIPPING_DURATION_THRESHOLD 6000		// 2 frames in 30 fps

#define FFMPEG_CLIP_COMMAND_FORMAT ("%s -i %s %s %s %s %s %s -f mpegts -y %s 2>&1")

// TS definitions

int get_required_bitrate(const char* input_file, int duration)
{
	struct stat st;

	if (stat(input_file, &st) == -1)
	{
		printf("stat failed, file=%s\n", input_file);
		return 0;
	}
		
	return (int)((double)st.st_size * 8 / (duration / 90000.0 * 1024) * 1.2);
}

bool_t clip_with_ffmpeg(
	const char* output_file_name, 
	const char* ffmpeg_bin, 
	const char* input_file_name, 
	int input_duration, 		// measured in 90KHz
	int seek_offset, 			// measured in 90KHz
	int clip_duration, 			// measured in 90KHz
	bool_t has_video, 
	bool_t has_audio)
{
	char clip_switches[100];
	char bitrate_param[100];
	const char* filter = "";
	const char* vcodec = "";
	const char* acodec = "";
	char* command_line;
	int required_bitrate;
	int command_line_size;
	double start_time;
	
	bitrate_param[0] = '\0';
	if (has_video)
	{
		if (seek_offset > 0)
		{
			vcodec = "-vcodec libx264 -subq 7 -qcomp 0.6 -qmin 10 -qmax 50 -qdiff 4 -bf 0 -coder 1 -refs 6 -x264opts b-pyramid:weightb:mixed-refs:8x8dct:no-fast-pskip=0 -vprofile main -level 3.1 -pix_fmt yuv420p -threads 4";
			required_bitrate = get_required_bitrate(input_file_name, input_duration);
			if (required_bitrate > 0)
				sprintf(bitrate_param, " -b:v %dk", required_bitrate);
			filter = "-bsf h264_mp4toannexb";
		}
		else
		{
			vcodec = "-vcodec copy";
		}
	}
	else
	{
		vcodec = "-vn";
	}
	
	if (has_audio)
	{
		if (seek_offset > 0)
		{
			acodec = "-acodec libfdk_aac";
		}
		else
		{
			acodec = "-acodec copy";
		}
	}
	else
	{
		acodec = "-an";
	}
	
	clip_switches[0] = '\0';
	if (seek_offset > 0)
	{
		sprintf(clip_switches, "-ss %f ", seek_offset / 90000.0);
	}
	if (clip_duration > 0)
	{
		sprintf(clip_switches, "-t %f ", clip_duration / 90000.0);
	}
	
	command_line_size = sizeof(FFMPEG_CLIP_COMMAND_FORMAT) + 
		strlen(ffmpeg_bin) + 
		strlen(input_file_name) + 
		strlen(vcodec) + 
		strlen(bitrate_param) + 
		strlen(acodec) +
		strlen(clip_switches) + 
		strlen(filter) + 
		strlen(output_file_name) + 1;
		
	command_line = (char*)malloc(command_line_size);
	if (command_line == NULL)
	{
		printf("malloc failed, command_len=%d\n", command_line_size);
		return FALSE;
	}
	
	sprintf(command_line, "%s -i %s %s %s %s %s %s -f mpegts -y %s 2>&1", 
		ffmpeg_bin, input_file_name, vcodec, bitrate_param, acodec, clip_switches, filter, output_file_name);
	
	printf("Executing %s\n", command_line);	
	start_time = microtime();
	system(command_line);
	printf("Done, took %f\n", microtime() - start_time);
		
	free(command_line);
	
	return TRUE;
}

bool_t find_last_pat_pmt_packets(byte_t* data, int size, byte_t** last_pat_packet, byte_t** last_pmt_packet)
{
	byte_t* end_data = data + size - TS_PACKET_LENGTH;
	byte_t* packet_offset;
	byte_t* cur_data;
	int cur_pid;
	int pmt_program_pid = 0;
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	const pat_t* pat_header;
	const pat_entry_t* pat_entry;
	int pat_entry_count;
	int i;
	
	*last_pat_packet = NULL;
	*last_pmt_packet = NULL;

	for (cur_data = data; cur_data <= end_data; cur_data += TS_PACKET_LENGTH)
	{
		// extract the current PID
		ts_header = (const mpeg_ts_header_t*)cur_data;				
		cur_pid = mpeg_ts_header_get_PID(ts_header);
		
		if (cur_pid == PAT_PID)
		{
			*last_pat_packet = cur_data;

			// skip the adapation field if present
			packet_offset = cur_data + sizeof_mpeg_ts_header;
			if (mpeg_ts_header_get_adaptationFieldExist(ts_header))
			{
				adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
				packet_offset += 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
			}
			
			// extract the pat header
			pat_header = (const pat_t*)packet_offset;
			packet_offset += sizeof_pat;
			pat_entry_count = (pat_get_sectionLength(pat_header) - 9) / sizeof_pat_entry;
			for (i = 0; i < pat_entry_count; i++)
			{
				// extract the pat entry
				pat_entry = (const pat_entry_t*)packet_offset;
				packet_offset += sizeof_pat_entry;
				
				// if the program number is 1, the PID is PID of the PMT
				if (pat_entry_get_programNumber(pat_entry) == 1)
					pmt_program_pid = pat_entry_get_programPID(pat_entry);
			}
		}
		else if (cur_pid == pmt_program_pid)
		{
			*last_pmt_packet = cur_data;
		}
	}
	
	return (*last_pat_packet != NULL) && (*last_pmt_packet != NULL);
}

void fix_continuity_forward(dynamic_buffer_t* segments, int segment_count)
{
	byte_t continuity_values[0x2000];		// last seen continuity counter per PID
	byte_t* cur_counter;
	byte_t* cur_pos;
	byte_t* end_pos;
	int cur_value;
	dynamic_buffer_t* cur_segment;
	dynamic_buffer_t* segments_end;
	
	memset(continuity_values, 0xff, sizeof(continuity_values));

	segments_end = segments + segment_count;
	for (cur_segment = segments; cur_segment < segments_end; cur_segment++)
	{
		end_pos = cur_segment->data + cur_segment->write_pos;
		for (cur_pos = cur_segment->data; cur_pos < end_pos; cur_pos += TS_PACKET_LENGTH)
		{
			cur_counter = continuity_values + mpeg_ts_header_get_PID(cur_pos);
			if (*cur_counter != 0xff)
			{
				cur_value = (*cur_counter + 1) & 0x0f;
				mpeg_ts_header_set_continuityCounter(cur_pos, cur_value);
			}
			else
				cur_value = mpeg_ts_header_get_continuityCounter(cur_pos);
			
			*cur_counter = cur_value;			
		}
	}
}

void fix_continuity_backward(dynamic_buffer_t* segments, int segment_count)
{
	byte_t continuity_values[0x2000];
	byte_t* cur_counter;
	byte_t* cur_pos;
	byte_t* end_pos;
	int cur_value;
	dynamic_buffer_t* cur_segment;
	
	memset(continuity_values, 0xff, sizeof(continuity_values));

	for (cur_segment = segments + segment_count - 1; cur_segment >= segments; cur_segment--)
	{
		end_pos = cur_segment->data;
		for (cur_pos = cur_segment->data + cur_segment->write_pos - TS_PACKET_LENGTH; cur_pos >= end_pos; cur_pos -= TS_PACKET_LENGTH)
		{
			cur_counter = continuity_values + mpeg_ts_header_get_PID(cur_pos);
			if (*cur_counter != 0xff)
			{
				cur_value = (*cur_counter - 1) & 0x0f;
				mpeg_ts_header_set_continuityCounter(cur_pos, cur_value);
			}
			else
				cur_value = mpeg_ts_header_get_continuityCounter(cur_pos);
			
			*cur_counter = cur_value;			
		}
	}
}

bool_t save_ts_portion(const char* output_file, byte_t* data, int start_pos, int end_pos, bool_t fix_continuity)
{
	dynamic_buffer_t segments[3];
	byte_t* last_pat_packet;
	byte_t* last_pmt_packet;

	// find PAT and PMT
	if (!find_last_pat_pmt_packets(data, start_pos, &last_pat_packet, &last_pmt_packet))
	{
		printf("Failed to find any PAT/PMT packets\n");
		return FALSE;
	}
	
	segments[0].data = last_pat_packet;
	segments[0].write_pos = TS_PACKET_LENGTH;
	segments[1].data = last_pmt_packet;
	segments[1].write_pos = TS_PACKET_LENGTH;
	segments[2].data = data + start_pos;
	segments[2].write_pos = end_pos - start_pos;
	
	if (fix_continuity)
		fix_continuity_backward(segments, 3);
	
	return write_file(output_file, segments, 3);
}

void calc_duration_before(frame_info_t* frames, int frame_count)
{
	int durations[MEDIA_TYPE_COUNT] = { 0 };
	int *cur_duration;
	int i;
	
	for (i = 0; i < frame_count; i++)
	{
		cur_duration = durations + frames[i].media_type;
		frames[i].relative_duration = *cur_duration;
		*cur_duration += frames[i].duration;
	}
}

void calc_duration_after(frame_info_t* frames, int frame_count)
{
	int durations[MEDIA_TYPE_COUNT] = { 0 };
	int *cur_duration;
	int i;
	
	for (i = frame_count - 1; i >= 0; i--)
	{
		cur_duration = durations + frames[i].media_type;
		*cur_duration -= frames[i].duration;
		frames[i].relative_duration = *cur_duration;
	}
}

void reset_timestamps(timestamps_t* timestamps)
{
	timestamps->pcr = -1;
	timestamps->pts = -1;
	timestamps->dts = -1;
}

void get_frame_timestamps(const byte_t* packet_offset, timestamps_t* timestamps)
{
	const byte_t* packet_end = packet_offset + TS_PACKET_LENGTH;
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	int adapt_size;
	const pes_optional_header_t* pes_optional_header;

	reset_timestamps(timestamps);
	
	ts_header = packet_offset;
	packet_offset += sizeof_mpeg_ts_header;
	if (mpeg_ts_header_get_adaptationFieldExist(ts_header))
	{
		adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
		adapt_size = 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
		
		if (mpeg_ts_adaptation_field_get_pcrFlag(adapt_field) && adapt_size >= sizeof_mpeg_ts_adaptation_field + sizeof_pcr)
		{			
			timestamps->pcr = get_pcr(packet_offset + sizeof_mpeg_ts_adaptation_field);
		}

		packet_offset += adapt_size;
	}
	
	if (packet_offset + sizeof_pes_header + sizeof_pes_optional_header < packet_end &&
		pes_header_get_prefix(packet_offset) == PES_MARKER)
	{
		packet_offset += sizeof_pes_header;
		pes_optional_header = packet_offset;
		packet_offset += sizeof_pes_optional_header;

		if (pes_optional_header_get_ptsFlag(pes_optional_header))
		{
			timestamps->pts = get_pts(packet_offset);
			packet_offset += sizeof_pts;
			if (pes_optional_header_get_dtsFlag(pes_optional_header))
			{
				timestamps->dts = get_pts(packet_offset);
			}
		}
	}
}

void set_frame_timestamps(byte_t* packet_offset, timestamps_t* timestamps, int timestamp_offset)
{
	const byte_t* packet_end = packet_offset + TS_PACKET_LENGTH;
	const mpeg_ts_header_t* ts_header;
	const mpeg_ts_adaptation_field_t* adapt_field;
	int adapt_size;
	const pes_optional_header_t* pes_optional_header;
	
	ts_header = packet_offset;
	packet_offset += sizeof_mpeg_ts_header;
	if (mpeg_ts_header_get_adaptationFieldExist(ts_header))
	{
		adapt_field = (const mpeg_ts_adaptation_field_t*)packet_offset;
		adapt_size = 1 + mpeg_ts_adaptation_field_get_adaptationFieldLength(adapt_field);
		
		if (mpeg_ts_adaptation_field_get_pcrFlag(adapt_field) && adapt_size >= sizeof_mpeg_ts_adaptation_field + sizeof_pcr)
		{
			set_pcr(packet_offset + sizeof_mpeg_ts_adaptation_field, timestamps->pcr + timestamp_offset);
		}

		packet_offset += adapt_size;
	}
	
	if (packet_offset + sizeof_pes_header + sizeof_pes_optional_header < packet_end &&
		pes_header_get_prefix(packet_offset) == PES_MARKER)
	{
		packet_offset += sizeof_pes_header;
		pes_optional_header = packet_offset;
		packet_offset += sizeof_pes_optional_header;

		if (pes_optional_header_get_ptsFlag(pes_optional_header))
		{
			set_pts(packet_offset, timestamps->pts + timestamp_offset);
			packet_offset += sizeof_pts;
			if (pes_optional_header_get_dtsFlag(pes_optional_header))
			{
				set_pts(packet_offset, timestamps->dts + timestamp_offset);
			}
		}
	}
}


void fix_timestamps(
	byte_t* target, frame_info_t* target_frames, int target_frame_count, 
	byte_t* reference, frame_info_t* reference_frames, int reference_frame_count,
	bool_t left_portion)
{
	timestamps_t offsets[MEDIA_TYPE_COUNT];
	timestamps_t cur_timestamps;
	timestamps_t* cur_offsets;
	frame_info_t* target_frames_end;
	frame_info_t* reference_frames_end;
	frame_info_t* cur_frame;
		
	reset_timestamps(&offsets[MEDIA_TYPE_VIDEO]);
	reset_timestamps(&offsets[MEDIA_TYPE_AUDIO]);
	
	if (left_portion)
	{
		calc_duration_before(target_frames, target_frame_count);
		calc_duration_before(reference_frames, reference_frame_count);
	}
	else
	{
		calc_duration_after(target_frames, target_frame_count);
		calc_duration_after(reference_frames, reference_frame_count);
	}

	reference_frames_end = reference_frames + reference_frame_count;
	for (cur_frame = reference_frames; cur_frame < reference_frames_end; cur_frame++)
	{
		cur_offsets = offsets + cur_frame->media_type;
		get_frame_timestamps(reference + cur_frame->pos, &cur_timestamps);
		
		if (cur_timestamps.pcr != -1)
			cur_offsets->pcr = cur_timestamps.pcr - cur_frame->relative_duration;

		if (cur_timestamps.pts != -1)
			cur_offsets->pts = cur_timestamps.pts - cur_frame->relative_duration;

		if (cur_timestamps.dts != -1)
			cur_offsets->dts = cur_timestamps.dts - cur_frame->relative_duration;
	}
	
	// if dts offset was not found, use pts offset
	if (offsets[MEDIA_TYPE_VIDEO].dts == -1)
		offsets[MEDIA_TYPE_VIDEO].dts = offsets[MEDIA_TYPE_VIDEO].pts;

	if (offsets[MEDIA_TYPE_AUDIO].dts == -1)
		offsets[MEDIA_TYPE_AUDIO].dts = offsets[MEDIA_TYPE_AUDIO].pts;

	printf("Video offsets: PCR=%" PRId64 " PTS=%" PRId64 " DTS=%" PRId64 "\n", offsets[MEDIA_TYPE_VIDEO].pcr, offsets[MEDIA_TYPE_VIDEO].pts, offsets[MEDIA_TYPE_VIDEO].dts);
	printf("Audio offsets: PCR=%" PRId64 " PTS=%" PRId64 " DTS=%" PRId64 "\n", offsets[MEDIA_TYPE_AUDIO].pcr, offsets[MEDIA_TYPE_AUDIO].pts, offsets[MEDIA_TYPE_AUDIO].dts);

	target_frames_end = target_frames + target_frame_count;
	for (cur_frame = target_frames; cur_frame < target_frames_end; cur_frame++)
	{
		cur_offsets = offsets + cur_frame->media_type;
		set_frame_timestamps(target + cur_frame->pos, cur_offsets, cur_frame->relative_duration);
	}
}

typedef struct {
	const char* output_file_name;
	const char* ffmpeg_bin;
	const char* ffprobe_bin;
	int cut_offset;
	bool_t left_portion;
	char** input_files;
	int file_count;
} command_line_options_t;

bool_t parse_command_line(command_line_options_t* opts, int argc, char *argv[])
{
	if (argc < 7)
	{
		printf("Usage:\n\tts_cutter <output file> <ffmpeg bin> <ffprobe bin> <cut offset> <left/right> <file1> [<file2> [ ... ] ]\n");
		return FALSE;
	}

	opts->output_file_name = argv[1];
	opts->ffmpeg_bin = argv[2];
	opts->ffprobe_bin = argv[3];
	opts->cut_offset = atoi(argv[4]);
	if (strcmp(argv[5], "left") == 0)
		opts->left_portion = TRUE;
	else if (strcmp(argv[5], "right") == 0)
		opts->left_portion = FALSE;
	else
	{
		printf("Invalid portion requested %s, should be either left or right\n", argv[5]);
		return FALSE;
	}
	opts->input_files = argv + 6;
	opts->file_count = argc - 6;
	return TRUE;
}

void has_video_audio_frames(frame_info_t* frames, int frame_count, bool_t* has_video, bool_t* has_audio)
{
	frame_info_t* frames_end = frames + frame_count;
	frame_info_t* cur_frame;
	
	*has_video = FALSE;
	*has_audio = FALSE;
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		if (cur_frame->media_type == MEDIA_TYPE_VIDEO)
		{
			*has_video = TRUE;
		}
		else
		{
			*has_audio = TRUE;
		}
		
		if (*has_video && *has_audio)
			break;
	}
}

typedef struct {
	frame_info_t* left_iframe;
	frame_info_t* right_iframe;
	int left_iframe_offset;
	int right_iframe_offset;	
} bounding_iframes_t;

bool_t get_bounding_iframes(frame_info_t* frames, int frame_count, bool_t is_video, int cut_offset, bounding_iframes_t* result)
{
	frame_info_t* frames_end = frames + frame_count;
	frame_info_t* cur_frame;
	int frame_offset = 0;

	memset(result, 0, sizeof(*result));
	
	for (cur_frame = frames; cur_frame < frames_end; cur_frame++)
	{
		// ignore audio frames in a video TS file
		if (is_video && cur_frame->media_type != MEDIA_TYPE_VIDEO)
		{
			continue;
		}
	
		// we care only about iframes
		if (!cur_frame->is_iframe)
		{
			frame_offset += cur_frame->duration;
			continue;
		}
			
		if (frame_offset < cut_offset)
		{
			// iframe is before cut_offset, use as left frame (override any previously found frame)
			result->left_iframe = cur_frame;
			result->left_iframe_offset = frame_offset;
			
			// if frame is close enough to the cut position use it also as right frame
			if (cut_offset - frame_offset < CLIPPING_DURATION_THRESHOLD)
			{
				break;
			}
		}
		else
		{
			// iframe is after cut_offset, use as right frame
			result->right_iframe = cur_frame;
			result->right_iframe_offset = frame_offset;
			break;
		}
		frame_offset += cur_frame->duration;
	}

	// if no frame was found return error
	if (result->left_iframe == NULL && result->right_iframe == NULL)
	{
		return FALSE;
	}
	
	// use the left frame if the right frame was not found
	if (result->right_iframe == NULL)
	{
		result->right_iframe = result->left_iframe;
		result->right_iframe_offset = result->left_iframe_offset;
	}

	// use the right frame if no left frame was found / right frame is close enough to the cut position
	if (result->left_iframe == NULL || result->right_iframe_offset - cut_offset < CLIPPING_DURATION_THRESHOLD)
	{
		result->left_iframe = result->right_iframe;
		result->left_iframe_offset = result->right_iframe_offset;
	}
		
	printf("iframe positions: left=%d right=%d\n", result->left_iframe->pos, result->right_iframe->pos);
	printf("iframe offsets: left=%d right=%d\n", result->left_iframe_offset, result->right_iframe_offset);
	
	return TRUE;
}

int main( int argc, char *argv[] )
{
	command_line_options_t opts;
	
	// source info
	frame_info_t* source_frames;
	int source_frame_count;	
	byte_t* source_buf;
	size_t source_size;
	bool_t has_video;
	bool_t has_audio;

	// cut positions
	bounding_iframes_t bounding_iframes;
	
	int seek_offset = -1;
	int clip_duration = -1;
	byte_t* clipped_buf;
	size_t clipped_size;
	
	frame_info_t* clipped_frames;
	int clipped_frame_count;
	
	dynamic_buffer_t result_segments[4] = { { 0 } };
	int result_segment_count;
	byte_t* last_pat_packet;
	byte_t* last_pmt_packet;
	char bounded_section_file[] = TEMP_FILE_PATTERN;
	char clipped_section_file[] = TEMP_FILE_PATTERN;
	char* clipped_section_file_array[] = { clipped_section_file };
	int return_code = 1;
	int fd;

	// parse the command line
	if (!parse_command_line(&opts, argc, argv))
	{
		goto cleanup;
	}
	
	// read the source files
	source_buf = read_files(opts.input_files, opts.file_count, &source_size);
	if (source_buf == NULL)
	{
		printf("Failed to read input files\n");
		goto cleanup;
	}
	
	// get bounding iframes
	source_frames = get_frames(opts.ffprobe_bin, opts.input_files, opts.file_count, &source_frame_count);
	if (source_frames == NULL)
	{
		printf("Failed to get the frames of the input files\n");
		goto cleanup;
	}
	
	has_video_audio_frames(source_frames, source_frame_count, &has_video, &has_audio);
	
	if (!get_bounding_iframes(source_frames, source_frame_count, has_video, opts.cut_offset, &bounding_iframes))
	{
		printf("Failed to get bounding iframes\n");
		goto cleanup;
	}
	
	// if the frames are identical use simple cutting without ffmpeg
	if (bounding_iframes.left_iframe == bounding_iframes.right_iframe)
	{
		printf("Performing simple cut, pos=%d offset=%d\n", bounding_iframes.left_iframe->pos, bounding_iframes.left_iframe_offset);
		
		if (opts.left_portion)
		{
			if (!write_file_single(opts.output_file_name, source_buf, bounding_iframes.left_iframe->pos))
			{
				printf("Failed to write output file (1)\n");
				goto cleanup;
			}
		}
		else
		{
			if (!save_ts_portion(opts.output_file_name, source_buf, bounding_iframes.left_iframe->pos, source_size, TRUE))
			{
				printf("Failed to write output file (2)\n");
				goto cleanup;
			}
		}
		return_code = 0;
		goto cleanup;
	}
	
	// save the iframe bounded section
	fd = mkstemp(bounded_section_file);
	if (fd == -1)
	{
		printf("Failed create temp file (1)\n");
		goto cleanup;
	}
	close(fd);
	
	if (!save_ts_portion(bounded_section_file, source_buf, bounding_iframes.left_iframe->pos, bounding_iframes.right_iframe->pos, FALSE))
	{
		printf("Failed save bounded region to temp file\n");
		goto cleanup;
	}
	
	// clip the bounded section using ffmpeg
	fd = mkstemp(clipped_section_file);
	if (fd == -1)
	{
		printf("Failed create temp file (2)\n");
		goto cleanup;
	}
	close(fd);
	
	if (opts.left_portion)
		clip_duration = opts.cut_offset - bounding_iframes.left_iframe_offset;
	else
		seek_offset = opts.cut_offset - bounding_iframes.left_iframe_offset;
	
	if (!clip_with_ffmpeg(clipped_section_file, 
		opts.ffmpeg_bin, 
		bounded_section_file, 
		bounding_iframes.right_iframe_offset - bounding_iframes.left_iframe_offset, 
		seek_offset, 
		clip_duration, 
		has_video,
		has_audio))
	{
		printf("Failed to clip using ffmpeg\n");
		goto cleanup;
	}

	// fix the timestamps of the clipped section
	clipped_frames = get_frames(opts.ffprobe_bin, clipped_section_file_array, 1, &clipped_frame_count);	
	if (clipped_frames == NULL)
	{
		printf("Failed to get the frames of the clipped section\n");
		goto cleanup;
	}
	
	clipped_buf = read_files(clipped_section_file_array, 1, &clipped_size);	
	if (clipped_buf == NULL)
	{
		printf("Failed to read the clipped section\n");
		goto cleanup;
	}
	
	fix_timestamps(
		clipped_buf, 
		clipped_frames, 
		clipped_frame_count, 
		source_buf, 
		bounding_iframes.left_iframe, 
		bounding_iframes.right_iframe - bounding_iframes.left_iframe, 
		opts.left_portion);
	
	// build the output segments and fix the continuity counters
	if (opts.left_portion)
	{
		result_segments[0].data = source_buf;
		result_segments[0].write_pos = bounding_iframes.left_iframe->pos;
		
		result_segments[1].data = clipped_buf;
		result_segments[1].write_pos = clipped_size;
		
		result_segment_count = 2;

		fix_continuity_forward(result_segments, result_segment_count);
	}
	else
	{
		if (!find_last_pat_pmt_packets(source_buf, bounding_iframes.right_iframe->pos, &last_pat_packet, &last_pmt_packet))
		{
			printf("Failed to find any PAT/PMT packets before the right iframe\n");
			goto cleanup;
		}

		result_segments[0].data = clipped_buf;
		result_segments[0].write_pos = clipped_size;

		result_segments[1].data = last_pat_packet;
		result_segments[1].write_pos = TS_PACKET_LENGTH;

		result_segments[2].data = last_pmt_packet;
		result_segments[2].write_pos = TS_PACKET_LENGTH;

		result_segments[3].data = source_buf + bounding_iframes.right_iframe->pos;
		result_segments[3].write_pos = source_size - bounding_iframes.right_iframe->pos;
		
		result_segment_count = 4;

		fix_continuity_backward(result_segments, result_segment_count);
	}
	
	// write the result
	if (!write_file(opts.output_file_name, result_segments, result_segment_count))
	{
		printf("Failed to write output file (3)\n");
		goto cleanup;
	}
	
	return_code = 0;
	
cleanup:

	// Note: not freeing memory since the process quits (source_buf, source_frames, clipped_frames, clipped_buf)

	// clean up
	if (strcmp(bounded_section_file, TEMP_FILE_PATTERN) != 0)
		remove(bounded_section_file);

	if (strcmp(clipped_section_file, TEMP_FILE_PATTERN) != 0)
		remove(clipped_section_file);
	
	return return_code;
}
