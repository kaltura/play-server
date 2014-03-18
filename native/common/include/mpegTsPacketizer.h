#ifndef __MPEGTS_PACKETIZER_H__
#define __MPEGTS_PACKETIZER_H__

#include "mpegTsStructs.h"
#include "common.h"

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

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

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

#endif // __MPEGTS_PACKETIZER_H__
