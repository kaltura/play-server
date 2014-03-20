#ifndef __MPEGTS_H__
#define __MPEGTS_H__

#include "mpegTsStructs.h"
#include "common.h"

#define TS_PACKET_LENGTH (188)
#define PAT_PID (0)
#define PES_MARKER (1)
#define MAX_PES_PAYLOAD (200 * 1024)

#define NO_TIMESTAMP (-1)
#define NO_OFFSET (0xff)

#define PTS_ONLY_PTS 0x2
#define PTS_BOTH_PTS 0x3
#define PTS_BOTH_DTS 0x1

#define STREAM_TYPE_AUDIO_AAC       0x0f
#define STREAM_TYPE_VIDEO_H264      0x1b

enum {
	MEDIA_TYPE_NONE,
	MEDIA_TYPE_AUDIO,
	MEDIA_TYPE_VIDEO,
	MEDIA_TYPE_COUNT,
};

typedef struct {
	int64_t pcr;
	int64_t pts;
	int64_t dts;
} timestamps_t;

typedef struct {
	uint8_t pcr;
	uint8_t pts;
	uint8_t dts;
} timestamp_offsets_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

int64_t get_pcr(const pcr_t* pcr);
void update_pcr(pcr_t* pcr, int64_t pcr_val);
void set_pcr(pcr_t* pcr, int64_t pcr_val);

int64_t get_pts(const pts_t* pts);
void update_pts(pts_t* pts, int64_t pts_val);
void set_pts(pts_t* pts, int indicator, int64_t pts_val);

void reset_timestamps(timestamps_t* timestamps);
void get_timestamp_offsets(const byte_t* packet_start, timestamp_offsets_t* timestamp_offsets);
void get_timestamps(const byte_t* packet_start, const timestamp_offsets_t* timestamp_offsets, timestamps_t* timestamps);
void update_timestamps(byte_t* packet_start, const timestamp_offsets_t* timestamp_offsets, const timestamps_t* timestamps, int timestamp_offset);

bool_t frame_has_pcr(const byte_t* packet_offset);
int64_t get_pts_from_packet(const byte_t* packet, int size);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __MPEGTS_H__
