#ifndef __MPEGTSSTREAMINFO_H__
#define __MPEGTSSTREAMINFO_H__

// includes
#include <stdint.h>

// constants
#define STREAMS_INFO_HASH_SIZE (31)			// chosen since common pids (0, 4095, 4096, 256, 257, 258) do not collide

#define INVALID_PID (-1)
#define INVALID_CONTINUITY_COUNTER (0xFF)

// typedefs
typedef struct {
	int16_t pid;
	uint8_t start_cc;
	uint8_t end_cc;
} stream_info_t;

typedef struct {
	stream_info_t data[STREAMS_INFO_HASH_SIZE];
} streams_info_t;

// functions
#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

void streams_info_hash_init(streams_info_t* hash);
stream_info_t* streams_info_hash_get(streams_info_t* hash, int pid);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __MPEGTSSTREAMINFO_H__
