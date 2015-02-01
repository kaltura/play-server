{
	"targets": [
		{
			"target_name": "TsId3Reader",
			"sources": [ "TsId3Reader.cc", "mpegts_stream_walker.c", "../../common/src/mpegTs.c", "../../common/src/mpegTsPacketizer.c", "../../common/src/common.c" ],
			'include_dirs': [
				"<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")",
				"../../common/include"
			],
  			"libraries": ["-lid3"]
		},
		{
			"target_name": "copy_binary",
			"type":"none",
			"dependencies" : [ "TsId3Reader" ],
			"copies": [
				{
					'destination': '<(module_root_dir)/../../../bin/<@(CONFIGURATION_NAME)',
					'files': ['<@(PRODUCT_DIR)/TsId3Reader.node']
				}
			]
		}
  ]
}
