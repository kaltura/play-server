# auto generated code - start
Extended_SAR = 255

def hrd_parameters( parser ):
	cpb_cnt_minus1 = parser.ue('cpb_cnt_minus1')
	bit_rate_scale = parser.u(4, 'bit_rate_scale')
	cpb_size_scale = parser.u(4, 'cpb_size_scale')
	for SchedSelIdx in xrange(cpb_cnt_minus1 + 1):
		bit_rate_value_minus1_SchedSelIdx_ = parser.ue('bit_rate_value_minus1_SchedSelIdx_')
		cpb_size_value_minus1_SchedSelIdx_ = parser.ue('cpb_size_value_minus1_SchedSelIdx_')
		cbr_flag_SchedSelIdx_ = parser.u(1, 'cbr_flag_SchedSelIdx_')
	initial_cpb_removal_delay_length_minus1 = parser.u(5, 'initial_cpb_removal_delay_length_minus1')
	cpb_removal_delay_length_minus1 = parser.u(5, 'cpb_removal_delay_length_minus1')
	dpb_output_delay_length_minus1 = parser.u(5, 'dpb_output_delay_length_minus1')
	time_offset_length = parser.u(5, 'time_offset_length')

def vui_parameters( parser ):
	aspect_ratio_info_present_flag = parser.u(1, 'aspect_ratio_info_present_flag')
	if( aspect_ratio_info_present_flag ):
		aspect_ratio_idc = parser.u(8, 'aspect_ratio_idc')
		if( aspect_ratio_idc == Extended_SAR ):
			sar_width = parser.u(16, 'sar_width')
			sar_height = parser.u(16, 'sar_height')
	overscan_info_present_flag = parser.u(1, 'overscan_info_present_flag')
	if( overscan_info_present_flag ):
		overscan_appropriate_flag = parser.u(1, 'overscan_appropriate_flag')
	video_signal_type_present_flag = parser.u(1, 'video_signal_type_present_flag')
	if( video_signal_type_present_flag ):
		video_format = parser.u(3, 'video_format')
		video_full_range_flag = parser.u(1, 'video_full_range_flag')
		colour_description_present_flag = parser.u(1, 'colour_description_present_flag')
		if( colour_description_present_flag ):
			colour_primaries = parser.u(8, 'colour_primaries')
			transfer_characteristics = parser.u(8, 'transfer_characteristics')
			matrix_coefficients = parser.u(8, 'matrix_coefficients')
	chroma_loc_info_present_flag = parser.u(1, 'chroma_loc_info_present_flag')
	if( chroma_loc_info_present_flag ):
		chroma_sample_loc_type_top_field = parser.ue('chroma_sample_loc_type_top_field')
		chroma_sample_loc_type_bottom_field = parser.ue('chroma_sample_loc_type_bottom_field')
	timing_info_present_flag = parser.u(1, 'timing_info_present_flag')
	if( timing_info_present_flag ):
		num_units_in_tick = parser.u(32, 'num_units_in_tick')
		time_scale = parser.u(32, 'time_scale')
		fixed_frame_rate_flag = parser.u(1, 'fixed_frame_rate_flag')
	nal_hrd_parameters_present_flag = parser.u(1, 'nal_hrd_parameters_present_flag')
	if( nal_hrd_parameters_present_flag ):
		hrd_parameters( parser )
	vcl_hrd_parameters_present_flag = parser.u(1, 'vcl_hrd_parameters_present_flag')
	if( vcl_hrd_parameters_present_flag ):
		hrd_parameters( parser )
	if( nal_hrd_parameters_present_flag or vcl_hrd_parameters_present_flag ):
		low_delay_hrd_flag = parser.u(1, 'low_delay_hrd_flag')
	pic_struct_present_flag = parser.u(1, 'pic_struct_present_flag')
	bitstream_restriction_flag = parser.u(1, 'bitstream_restriction_flag')
	if( bitstream_restriction_flag ):
		motion_vectors_over_pic_boundaries_flag = parser.u(1, 'motion_vectors_over_pic_boundaries_flag')
		max_bytes_per_pic_denom = parser.ue('max_bytes_per_pic_denom')
		max_bits_per_mb_denom = parser.ue('max_bits_per_mb_denom')
		log2_max_mv_length_horizontal = parser.ue('log2_max_mv_length_horizontal')
		log2_max_mv_length_vertical = parser.ue('log2_max_mv_length_vertical')
		num_reorder_frames = parser.ue('num_reorder_frames')
		max_dec_frame_buffering = parser.ue('max_dec_frame_buffering')

def seq_parameter_set_rbsp( parser ):
	profile_idc = parser.u(8, 'profile_idc')
	constraint_set0_flag = parser.u(1, 'constraint_set0_flag')
	constraint_set1_flag = parser.u(1, 'constraint_set1_flag')
	constraint_set2_flag = parser.u(1, 'constraint_set2_flag')
	reserved_zero_5bits = parser.u(5, 'reserved_zero_5bits')
	level_idc = parser.u(8, 'level_idc')
	seq_parameter_set_id = parser.ue('seq_parameter_set_id')
	
	if profile_idc in set([100,110,122,244, 44, 83, 86,118,128,138,144]):
		chroma_format_idc = parser.ue('chroma_format_idc')
		if chroma_format_idc == 3:
			residual_color_transform_flag = parser.u(1, 'residual_color_transform_flag')
		bit_depth_luma = parser.ue('bit_depth_luma')
		bit_depth_chroma = parser.ue('bit_depth_chroma')
		transform_bypass = parser.u(1, 'transform_bypass')
	
	log2_max_frame_num_minus4 = parser.ue('log2_max_frame_num_minus4')
	pic_order_cnt_type = parser.ue('pic_order_cnt_type')
	if( pic_order_cnt_type == 0 ):
		log2_max_pic_order_cnt_lsb_minus4 = parser.ue('log2_max_pic_order_cnt_lsb_minus4')
	elif( pic_order_cnt_type == 1 ):
		delta_pic_order_always_zero_flag = parser.u(1, 'delta_pic_order_always_zero_flag')
		offset_for_non_ref_pic = parser.se('offset_for_non_ref_pic')
		offset_for_top_to_bottom_field = parser.se('offset_for_top_to_bottom_field')
		num_ref_frames_in_pic_order_cnt_cycle = parser.ue('num_ref_frames_in_pic_order_cnt_cycle')
		for i in xrange(num_ref_frames_in_pic_order_cnt_cycle):
			offset_for_ref_frame_i_ = parser.se('offset_for_ref_frame_i_')
	num_ref_frames = parser.ue('num_ref_frames')
	gaps_in_frame_num_value_allowed_flag = parser.u(1, 'gaps_in_frame_num_value_allowed_flag')
	pic_width_in_mbs_minus1 = parser.ue('pic_width_in_mbs_minus1')
	pic_height_in_map_units_minus1 = parser.ue('pic_height_in_map_units_minus1')
	frame_mbs_only_flag = parser.u(1, 'frame_mbs_only_flag')
	if( not frame_mbs_only_flag ):
		mb_adaptive_frame_field_flag = parser.u(1, 'mb_adaptive_frame_field_flag')
	direct_8x8_inference_flag = parser.u(1, 'direct_8x8_inference_flag')
	frame_cropping_flag = parser.u(1, 'frame_cropping_flag')
	if( frame_cropping_flag ):
		frame_crop_left_offset = parser.ue('frame_crop_left_offset')
		frame_crop_right_offset = parser.ue('frame_crop_right_offset')
		frame_crop_top_offset = parser.ue('frame_crop_top_offset')
		frame_crop_bottom_offset = parser.ue('frame_crop_bottom_offset')
	vui_parameters_present_flag = parser.u(1, 'vui_parameters_present_flag')
	if( vui_parameters_present_flag ):
		vui_parameters( parser )
	rbsp_trailing_bits( parser )

def pic_parameter_set_rbsp( parser ):
	pic_parameter_set_id = parser.ue('pic_parameter_set_id')
	seq_parameter_set_id = parser.ue('seq_parameter_set_id')
	entropy_coding_mode_flag = parser.u(1, 'entropy_coding_mode_flag')
	pic_order_present_flag = parser.u(1, 'pic_order_present_flag')
	num_slice_groups_minus1 = parser.ue('num_slice_groups_minus1')
	if( num_slice_groups_minus1 > 0 ):
		slice_group_map_type = parser.ue('slice_group_map_type')
		if( slice_group_map_type == 0 ):
			for iGroup in xrange(num_slice_groups_minus1 + 1):
				run_length_minus1_iGroup_ = parser.ue('run_length_minus1_iGroup_')
		elif( slice_group_map_type == 2 ):
			for iGroup in xrange(num_slice_groups_minus1):
				top_left_iGroup_ = parser.ue('top_left_iGroup_')
				bottom_right_iGroup_ = parser.ue('bottom_right_iGroup_')
		elif( slice_group_map_type == 3 or slice_group_map_type == 4 or slice_group_map_type == 5 ):
			slice_group_change_direction_flag = parser.u(1, 'slice_group_change_direction_flag')
			slice_group_change_rate_minus1 = parser.ue('slice_group_change_rate_minus1')
		elif( slice_group_map_type == 6 ):
			pic_size_in_map_units_minus1 = parser.ue('pic_size_in_map_units_minus1')
			for i in xrange(pic_size_in_map_units_minus1 + 1):
				slice_group_id_i_ = parser.u('slice_group_id_i_')
	num_ref_idx_l0_active_minus1 = parser.ue('num_ref_idx_l0_active_minus1')
	num_ref_idx_l1_active_minus1 = parser.ue('num_ref_idx_l1_active_minus1')
	weighted_pred_flag = parser.u(1, 'weighted_pred_flag')
	weighted_bipred_idc = parser.u(2, 'weighted_bipred_idc')
	pic_init_qp_minus26 = parser.se('pic_init_qp_minus26')
	pic_init_qs_minus26 = parser.se('pic_init_qs_minus26')
	chroma_qp_index_offset = parser.se('chroma_qp_index_offset')
	deblocking_filter_control_present_flag = parser.u(1, 'deblocking_filter_control_present_flag')
	constrained_intra_pred_flag = parser.u(1, 'constrained_intra_pred_flag')
	redundant_pic_cnt_present_flag = parser.u(1, 'redundant_pic_cnt_present_flag')
	rbsp_trailing_bits( parser )

def slice_header( parser ):
	first_mb_in_slice = parser.ue('first_mb_in_slice')
	slice_type = parser.ue('slice_type')
	pic_parameter_set_id = parser.ue('pic_parameter_set_id')
	frame_num = parser.u('frame_num')
	if( not frame_mbs_only_flag ):
		field_pic_flag = parser.u(1, 'field_pic_flag')
		if( field_pic_flag ):
			bottom_field_flag = parser.u(1, 'bottom_field_flag')
	if( nal_unit_type == 5 ):
		idr_pic_id = parser.ue('idr_pic_id')
	if( pic_order_cnt_type == 0 ):
		pic_order_cnt_lsb = parser.u('pic_order_cnt_lsb')
		if( pic_order_present_flag and not field_pic_flag ):
			delta_pic_order_cnt_bottom = parser.se('delta_pic_order_cnt_bottom')
	if( pic_order_cnt_type == 1 and not delta_pic_order_always_zero_flag ):
		delta_pic_order_cnt_0_ = parser.se('delta_pic_order_cnt_0_')
		if( pic_order_present_flag and not field_pic_flag ):
			delta_pic_order_cnt_1_ = parser.se('delta_pic_order_cnt_1_')
	if( redundant_pic_cnt_present_flag ):
		redundant_pic_cnt = parser.ue('redundant_pic_cnt')
	if( slice_type == B ):
		direct_spatial_mv_pred_flag = parser.u(1, 'direct_spatial_mv_pred_flag')
	if( slice_type == P or slice_type == SP or slice_type == B ):
		num_ref_idx_active_override_flag = parser.u(1, 'num_ref_idx_active_override_flag')
		if( num_ref_idx_active_override_flag ):
			num_ref_idx_l0_active_minus1 = parser.ue('num_ref_idx_l0_active_minus1')
			if( slice_type == B ):
				num_ref_idx_l1_active_minus1 = parser.ue('num_ref_idx_l1_active_minus1')
	ref_pic_list_reordering( parser )
	if( ( weighted_pred_flag and ( slice_type == P or slice_type == SP ) ) or ( weighted_bipred_idc == 1 and slice_type == B ) ):
		pred_weight_table( parser )
	if( nal_ref_idc != 0 ):
		dec_ref_pic_marking( parser )
	if( entropy_coding_mode_flag and slice_type != I and slice_type != SI ):
		cabac_init_idc = parser.ue('cabac_init_idc')
	slice_qp_delta = parser.se('slice_qp_delta')
	if( slice_type == SP or slice_type == SI ):
		if( slice_type == SP ):
			sp_for_switch_flag = parser.u(1, 'sp_for_switch_flag')
		slice_qs_delta = parser.se('slice_qs_delta')
	if( deblocking_filter_control_present_flag ):
		disable_deblocking_filter_idc = parser.ue('disable_deblocking_filter_idc')
		if( disable_deblocking_filter_idc != 1 ):
			slice_alpha_c0_offset_div2 = parser.se('slice_alpha_c0_offset_div2')
			slice_beta_offset_div2 = parser.se('slice_beta_offset_div2')
	if( num_slice_groups_minus1 > 0 and slice_group_map_type >= 3 and slice_group_map_type <= 5):
		slice_group_change_cycle = parser.u('slice_group_change_cycle')

def access_unit_delimiter_rbsp( parser ):
	primary_pic_type = parser.u(3, 'primary_pic_type')
	rbsp_trailing_bits( parser )

def sei_payload( parser, payloadType, payloadSize ):
	if( payloadType == 0 ):
		buffering_period( parser, payloadSize )
	elif( payloadType == 1 ):
		pic_timing( parser, payloadSize )
	elif( payloadType == 2 ):
		pan_scan_rect( parser, payloadSize )
	elif( payloadType == 3 ):
		filler_payload( parser, payloadSize )
	elif( payloadType == 4 ):
		user_data_registered_itu_t_t35( parser, payloadSize )
	elif( payloadType == 5 ):
		user_data_unregistered( parser, payloadSize )
	elif( payloadType == 6 ):
		recovery_point( parser, payloadSize )
	elif( payloadType == 7 ):
		dec_ref_pic_marking_repetition( parser, payloadSize )
	elif( payloadType == 8 ):
		spare_pic( parser, payloadSize )
	elif( payloadType == 9 ):
		scene_info( parser, payloadSize )
	elif( payloadType == 10 ):
		sub_seq_info( parser, payloadSize )
	elif( payloadType == 11 ):
		sub_seq_layer_characteristics( parser, payloadSize )
	elif( payloadType == 12 ):
		sub_seq_characteristics( parser, payloadSize )
	elif( payloadType == 13 ):
		full_frame_freeze( parser, payloadSize )
	elif( payloadType == 14 ):
		full_frame_freeze_release( parser, payloadSize )
	elif( payloadType == 15 ):
		full_frame_snapshot( parser, payloadSize )
	elif( payloadType == 16 ):
		progressive_refinement_segment_start( parser, payloadSize )
	elif( payloadType == 17 ):
		progressive_refinement_segment_end( parser, payloadSize )
	elif( payloadType == 18 ):
		motion_constrained_slice_group_set( parser, payloadSize )
	else:
		reserved_sei_message( parser, payloadSize )
	if( not parser.byte_aligned( ) ):
		bit_equal_to_one = parser.f(1, 'bit_equal_to_one')
		while( not parser.byte_aligned( ) ):
			bit_equal_to_zero = parser.f(1, 'bit_equal_to_zero')

def buffering_period( parser, payloadSize ):
	seq_parameter_set_id = parser.ue('seq_parameter_set_id')
	if( cur_pps.nal_hrd_parameters_present_flag ):
		for SchedSelIdx in xrange(cur_pps.cpb_cnt_minus1 + 1):
			initial_cpb_removal_delay_SchedSelIdx_ = parser.u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1, 'initial_cpb_removal_delay_SchedSelIdx_')
			initial_cpb_removal_delay_offset_SchedSelIdx_ = parser.u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1, 'initial_cpb_removal_delay_offset_SchedSelIdx_')
	if( cur_pps.vcl_hrd_parameters_present_flag ):
		for SchedSelIdx in xrange(cpb_cnt_minus1 + 1):
			initial_cpb_removal_delay_SchedSelIdx_ = parser.u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1, 'initial_cpb_removal_delay_SchedSelIdx_')
			initial_cpb_removal_delay_offset_SchedSelIdx_ = parser.u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1, 'initial_cpb_removal_delay_offset_SchedSelIdx_')

def pic_timing( parser, payloadSize ):
	if( (cur_pps.nal_hrd_parameters_present_flag or cur_pps.vcl_hrd_parameters_present_flag) ):
		cpb_removal_delay = parser.u(cur_pps.cpb_removal_delay_length_minus1 + 1, 'cpb_removal_delay')
		dpb_output_delay = parser.u(cur_pps.dpb_output_delay_length_minus1 + 1, 'dpb_output_delay')
	if( cur_pps.pic_struct_present_flag ):
		pic_struct = parser.u(4, 'pic_struct')
		for i in xrange(NumClockTS(pic_struct)):
			clock_timestamp_flag_i_ = parser.u(1, 'clock_timestamp_flag_i_')
			if( clock_timestamp_flag_i_ ):
				ct_type = parser.u(2, 'ct_type')
				nuit_field_based_flag = parser.u(1, 'nuit_field_based_flag')
				counting_type = parser.u(5, 'counting_type')
				full_timestamp_flag = parser.u(1, 'full_timestamp_flag')
				discontinuity_flag = parser.u(1, 'discontinuity_flag')
				cnt_dropped_flag = parser.u(1, 'cnt_dropped_flag')
				n_frames = parser.u(8, 'n_frames')
				if( full_timestamp_flag ):
					seconds_value = parser.u(6, 'seconds_value')
					minutes_value = parser.u(6, 'minutes_value')
					hours_value = parser.u(5, 'hours_value')
				else:
					seconds_flag = parser.u(1, 'seconds_flag')
					if( seconds_flag ):
						seconds_value = parser.u(6, 'seconds_value')
						minutes_flag = parser.u(1, 'minutes_flag')
						if( minutes_flag ):
							minutes_value = parser.u(6, 'minutes_value')
							hours_flag = parser.u(1, 'hours_flag')
							if( hours_flag ):
								hours_value = parser.u(5, 'hours_value')
				if( cur_pps.time_offset_length > 0 ):
					time_offset = parser.i(cur_pps.time_offset_length, 'time_offset')

def pan_scan_rect( parser, payloadSize ):
	pan_scan_rect_id = parser.ue('pan_scan_rect_id')
	pan_scan_rect_cancel_flag = parser.u(1, 'pan_scan_rect_cancel_flag')
	if( not pan_scan_rect_cancel_flag ):
		pan_scan_cnt_minus1 = parser.ue('pan_scan_cnt_minus1')
		for i in xrange(pan_scan_cnt_minus1 + 1):
			pan_scan_rect_left_offset_i_ = parser.se('pan_scan_rect_left_offset_i_')
			pan_scan_rect_right_offset_i_ = parser.se('pan_scan_rect_right_offset_i_')
			pan_scan_rect_top_offset_i_ = parser.se('pan_scan_rect_top_offset_i_')
			pan_scan_rect_bottom_offset_i_ = parser.se('pan_scan_rect_bottom_offset_i_')
		pan_scan_rect_repetition_period = parser.ue('pan_scan_rect_repetition_period')

def filler_payload( parser, payloadSize ):
	for k in xrange(payloadSize):
		ff_byte = parser.f(8, 'ff_byte')

def user_data_unregistered( parser, payloadSize ):
	uuid_iso_iec_11578 = parser.u(128, 'uuid_iso_iec_11578')
	for i in xrange(16, payloadSize, 1):
		user_data_payload_byte = parser.b(8, 'user_data_payload_byte')

def recovery_point( parser, payloadSize ):
	recovery_frame_cnt = parser.ue('recovery_frame_cnt')
	exact_match_flag = parser.u(1, 'exact_match_flag')
	broken_link_flag = parser.u(1, 'broken_link_flag')
	changing_slice_group_idc = parser.u(2, 'changing_slice_group_idc')

def dec_ref_pic_marking_repetition( parser, payloadSize ):
	original_idr_flag = parser.u(1, 'original_idr_flag')
	original_frame_num = parser.ue('original_frame_num')
	if( not frame_mbs_only_flag ):
		original_field_pic_flag = parser.u(1, 'original_field_pic_flag')
		if( original_field_pic_flag ):
			original_bottom_field_flag = parser.u(1, 'original_bottom_field_flag')
	dec_ref_pic_marking( parser )

def scene_info( parser, payloadSize ):
	scene_info_present_flag = parser.u(1, 'scene_info_present_flag')
	if( scene_info_present_flag ):
		scene_id = parser.ue('scene_id')
		scene_transition_type = parser.ue('scene_transition_type')
		if( scene_transition_type > 3 ):
			second_scene_id = parser.ue('second_scene_id')

def sub_seq_info( parser, payloadSize ):
	sub_seq_layer_num = parser.ue('sub_seq_layer_num')
	sub_seq_id = parser.ue('sub_seq_id')
	first_ref_pic_flag = parser.u(1, 'first_ref_pic_flag')
	leading_non_ref_pic_flag = parser.u(1, 'leading_non_ref_pic_flag')
	last_pic_flag = parser.u(1, 'last_pic_flag')
	sub_seq_frame_num_flag = parser.u(1, 'sub_seq_frame_num_flag')
	if( sub_seq_frame_num_flag ):
		sub_seq_frame_num = parser.ue('sub_seq_frame_num')

def sub_seq_layer_characteristics( parser, payloadSize ):
	num_sub_seq_layers_minus1 = parser.ue('num_sub_seq_layers_minus1')
	for layer in xrange(num_sub_seq_layers_minus1 + 1):
		accurate_statistics_flag = parser.u(1, 'accurate_statistics_flag')
		average_bit_rate = parser.u(16, 'average_bit_rate')
		average_frame_rate = parser.u(16, 'average_frame_rate')

def sub_seq_characteristics( parser, payloadSize ):
	sub_seq_layer_num = parser.ue('sub_seq_layer_num')
	sub_seq_id = parser.ue('sub_seq_id')
	duration_flag = parser.u(1, 'duration_flag')
	if( duration_flag):
		sub_seq_duration = parser.u(32, 'sub_seq_duration')
	average_rate_flag = parser.u(1, 'average_rate_flag')
	if( average_rate_flag ):
		accurate_statistics_flag = parser.u(1, 'accurate_statistics_flag')
		average_bit_rate = parser.u(16, 'average_bit_rate')
		average_frame_rate = parser.u(16, 'average_frame_rate')
	num_referenced_subseqs = parser.ue('num_referenced_subseqs')
	for n in xrange(num_referenced_subseqs):
		ref_sub_seq_layer_num = parser.ue('ref_sub_seq_layer_num')
		ref_sub_seq_id = parser.ue('ref_sub_seq_id')
		ref_sub_seq_direction = parser.u(1, 'ref_sub_seq_direction')

def full_frame_freeze( parser, payloadSize ):
	full_frame_freeze_repetition_period = parser.ue('full_frame_freeze_repetition_period')

def full_frame_freeze_release( parser, payloadSize ):
	pass

def full_frame_snapshot( parser, payloadSize ):
	snapshot_id = parser.ue('snapshot_id')

def progressive_refinement_segment_start( parser, payloadSize ):
	progressive_refinement_id = parser.ue('progressive_refinement_id')
	num_refinement_steps_minus1 = parser.ue('num_refinement_steps_minus1')

def progressive_refinement_segment_end( parser, payloadSize ):
	progressive_refinement_id = parser.ue('progressive_refinement_id')

def motion_constrained_slice_group_set( parser, payloadSize ):
	num_slice_groups_in_set_minus1 = parser.ue('num_slice_groups_in_set_minus1')
	for i in xrange(num_slice_groups_in_set_minus1 + 1):
		slice_group_id_i_ = parser.u('slice_group_id_i_')
	exact_sample_value_match_flag = parser.u(1, 'exact_sample_value_match_flag')
	pan_scan_rect_flag = parser.u(1, 'pan_scan_rect_flag')
	if( pan_scan_rect_flag ):
		pan_scan_rect_id = parser.ue('pan_scan_rect_id')

def reserved_sei_message( parser, payloadSize ):
	for i in xrange(payloadSize):
		reserved_sei_message_payload_byte = parser.b(8, 'reserved_sei_message_payload_byte')

def sei_message(parser):
	payloadType = 0
	while( parser.next_bits( 8 ) == 0xFF ):
		ff_byte = parser.u(8, 'ff_byte')
		payloadType += 0xFF
	last_payload_type_byte = parser.u(8, 'last_payload_type_byte')
	payloadType += last_payload_type_byte
	payloadSize = 0
	while( parser.next_bits( 8 ) == 0xFF ):
		ff_byte = parser.u(8, 'ff_byte')
		payloadSize += 0xFF
	last_payload_size_byte = parser.u(8, 'last_payload_size_byte')
	payloadSize += last_payload_size_byte
	if not hasattr(parser, 'seiPayloadTypes'):
		parser.seiPayloadTypes = []
	parser.seiPayloadTypes.append(payloadType)
	sei_payload(parser, payloadType,  payloadSize)

def user_data_registered_itu_t_t35( parser, payloadSize ):
	itu_t_t35_country_code = parser.b(8, 'itu_t_t35_country_code')
	if( itu_t_t35_country_code != 0xFF ):
		i = 1
	else:
		itu_t_t35_country_code_extension_byte = parser.b(8, 'itu_t_t35_country_code_extension_byte')
		i = 2
	while( i < payloadSize ):
		itu_t_t35_payload_byte = parser.b(8, 'itu_t_t35_payload_byte')
		i += 1

def spare_pic( parser, payloadSize ):
	target_frame_num = parser.ue('target_frame_num')
	spare_field_flag = parser.u(1, 'spare_field_flag')
	if( spare_field_flag ):
		target_bottom_field_flag = parser.u(1, 'target_bottom_field_flag')
	num_spare_pics_minus1 = parser.ue('num_spare_pics_minus1')
	for i in xrange(num_spare_pics_minus1 + 1):
		delta_spare_frame_num_i_ = parser.ue('delta_spare_frame_num_i_')
		if( spare_field_flag ):
			spare_bottom_field_flag_i_ = parser.u(1, 'spare_bottom_field_flag_i_')
		spare_area_idc_i_ = parser.ue('spare_area_idc_i_')
		if( spare_area_idc_i_ == 1 ):
			for j in xrange(PicSizeInMapUnits):
				spare_unit_flag_i__j_ = parser.u(1, 'spare_unit_flag_i__j_')
		elif( spare_area_idc_i_ == 2 ):
			mapUnitCnt = 0
			while mapUnitCnt < PicSizeInMapUnits:
				zero_run_length_i__j_ = parser.ue('zero_run_length_i__j_')
				mapUnitCnt += zero_run_length_i__j_ + 1 

def sei_rbsp( parser ):
	while( parser.more_rbsp_data() ):
		sei_message(parser) 
	rbsp_trailing_bits(parser)

def rbsp_trailing_bits(parser):
	parser.rbsp_trailing_bits()

def set_pps(parser):
	global cur_pps
	cur_pps = parser

def get_pps():
	global cur_pps
	return cur_pps
	
def NumClockTS(pic_struct):
	resultMap = {0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 2, 8: 3}
	return resultMap[pic_struct]


# auto generated code - end
