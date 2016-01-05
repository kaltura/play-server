{
	"targets": [
		{
			"target_name": "TsRebase",
			"sources": [ "TsRebase.cc", "ts_rebase_impl.c", "../../common/src/mpegTs.c", "../../common/src/dynamicBuffer.c" ],
			'include_dirs': [
				"<!(node -p -e \"require('path').relative('.', require('path').dirname(require.resolve('nan')))\")",
				"../../common/include"
			]
		}
	]
}
