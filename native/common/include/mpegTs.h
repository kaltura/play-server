#ifndef __MPEGTS_H__
#define __MPEGTS_H__

#include "mpegTsStructs.h"
#include "common.h"

#define TS_PACKET_LENGTH (188)
#define PAT_PID (0)
#define PES_MARKER (1)
#define MAX_PES_PAYLOAD (200 * 1024)

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

typedef void (*packetizer_callback_t)(void* context, const byte_t* packet, int size, int64_t pts);

typedef void (*pmt_header_callback_t)(void* context, const pmt_t* pmt_header);
typedef void (*pmt_entry_callback_t)(void* context, const pmt_entry_t* pmt_entry, int size);
typedef bool_t (*packet_data_callback_t)(void* context, int cur_pid, const byte_t* packet, int size);

typedef struct
{
	packetizer_callback_t callback;
	void* callback_context;
	bool_t in_packet;
	byte_t* packet_buffer;
	byte_t* packet_pos;
	int64_t pts;
	int packet_size;
	int size_left;
} ts_packetizer_state_t;

typedef struct {
	int64_t pcr;
	int64_t pts;
	int64_t dts;
} timestamps_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

int64_t get_pcr(const pcr_t* pcr);
void update_pcr(pcr_t* pcr, int64_t pcr_val);
void set_pcr(pcr_t* pcr, int64_t pcr_val);

int64_t get_pts(const pts_t* pts);
void update_pts(pts_t* pts, int64_t pts_val);
void set_pts(pts_t* pts, int indicator, int64_t pts_val);

int64_t get_pts_from_packet(const byte_t* packet, int size);

void ts_packetizer_init(ts_packetizer_state_t* state, packetizer_callback_t callback, void* callback_context);
bool_t ts_packetizer_process_data(ts_packetizer_state_t* state, const byte_t* packet_offset, int size);
void ts_packetizer_free(ts_packetizer_state_t* state);

bool_t walk_ts_streams(
	const byte_t* data,
	int size,
	pmt_header_callback_t pmt_header_callback,
	pmt_entry_callback_t pmt_entry_callback,
	packet_data_callback_t packet_data_callback,
	void* callback_context);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __MPEGTS_H__
