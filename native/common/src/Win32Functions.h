
#ifndef __WIN32FUNCTIONS_H__
#define __WIN32FUNCTIONS_H__

#ifdef  _WIN32
#include <time.h>
#include <windows.h>

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

int gettimeofday(struct timeval *tv, struct timezone *tz);

#ifdef __cplusplus
}
#endif /* __cplusplus */


#endif
#endif
