{
	"targets": [
		{
			"target_name": "TsCutter",
			"sources": [ "TsCutter.cc", "ts_cutter_impl.c", "../../common/src/ffprobe.c", "../../common/src/dynamicBuffer.c", "../../common/src/mpegTs.c" ],
			'include_dirs': [
				"<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")",
				"../../common/include"
			]
		},
		{
			"target_name": "copy_binary",
			"type":"none",
			"dependencies" : [ "TsCutter" ],
			"copies": [
				{
					'destination': '<(module_root_dir)/../../../bin/<@(CONFIGURATION_NAME)',
					'files': ['<@(PRODUCT_DIR)/TsCutter.node']
				}
			]
		}
	]
}
