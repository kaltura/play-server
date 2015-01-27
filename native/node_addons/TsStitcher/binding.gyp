{
	"targets": [
		{
			"target_name": "TsStitcher",
			"sources": [ "TsStitcher.cc", "ts_stitcher_impl.c", "../../common/src/mpegTs.c", "../../common/src/mpegTsStreamInfo.c", "../../common/src/dynamicBuffer.c" ],
			'include_dirs': [
				"<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")",
				"../../common/include"
			]
		},
		{
			"target_name": "copy_binary",
			"type":"none",
			"dependencies" : [ "TsStitcher" ],
			"copies": [
				{
					'destination': '<(module_root_dir)/../../../bin/<@(CONFIGURATION_NAME)',
					'files': ['<@(PRODUCT_DIR)/TsStitcher.node']
				}
			]
		}
	]
}
