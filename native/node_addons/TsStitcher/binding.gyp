{
  "targets": [
    {
      "target_name": "TsStitcher",
      "sources": [ "TsStitcher.cc" ],
      'include_dirs': [
        "<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")"
      ]
    }
  ]
}
