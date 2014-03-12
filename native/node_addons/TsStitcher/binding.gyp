{
  "targets": [
    {
      "target_name": "TsStitcher",
      "sources": [ "TsStitcher.cc", "ts_stitcher_impl.c", "../../common/src/mpegTs.c", "../../common/src/mpegTsStreamInfo.c", "../../common/src/dynamicBuffer.c" ],
      'include_dirs': [
        "<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")",
        "../../common/include"
      ]
    }
  ]
}
