{
	"targets": [
		{
			"target_name": "TsPreparer",
			"sources": [ "TsPreparer.cc", "ts_preparer_impl.c", "../../common/src/dynamicBuffer.c", "../../common/src/mpegTs.c", "../../common/src/mpegTsStreamInfo.c" ],
			'include_dirs': [
				"<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")",
				"../../common/include"
			]
		},
		{
			"target_name": "copy_binary",
			"type":"none",
			"dependencies" : [ "TsPreparer" ],
			"copies": [
				{
					'destination': '<(module_root_dir)/../../../bin/<@(CONFIGURATION_NAME)',
					'files': ['<@(PRODUCT_DIR)/TsPreparer.node']
				}
			]
		}
	]
}
