#ifndef __COMMON_H__
#define __COMMON_H__

#include <stdint.h>

#define PS(x) &x, sizeof(x)
#define STARTS_WITH_STATIC(str, prefix) (strncmp(str, prefix, sizeof(prefix) - 1) == 0)
#define MAX(x,y) (((x) > (y)) ? (x) : (y))
#define MIN(x,y) (((x) < (y)) ? (x) : (y))
#define ARRAY_ENTRIES(x) (sizeof(x) / sizeof(x[0]))

#define TRUE (1)
#define FALSE (0)

typedef unsigned char byte_t;
typedef int bool_t;

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

double microtime();

bool_t search_pattern(const byte_t* buffer, size_t size, const byte_t* pattern, size_t pattern_size);

#ifdef __cplusplus
}
#endif /* __cplusplus */

#endif // __COMMON_H__
