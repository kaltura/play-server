import os
import re

def isStringNumeric(theStr):
	try:
		int(theStr)
		return True
	except ValueError:
		return False

outputFileName = os.path.join(os.path.dirname(__file__), 'h264Dump.py')

outputBuffer = '# auto generated code - start\n'

# constants
outputBuffer += 'Extended_SAR = 255\n'

# the following was copied from H264. Only the following changes were applied:
# - in case of constructs such as u(v) pasted the field length
# - added 'cur_pps.' where needed

specPortion = '''
hrd_parameters( ) { C Descriptor  cpb_cnt_minus1 0 ue(v)  bit_rate_scale 0 u(4)  cpb_size_scale 0 u(4)  for( SchedSelIdx = 0; SchedSelIdx <= cpb_cnt_minus1; SchedSelIdx++ ) {     bit_rate_value_minus1[ SchedSelIdx ] 0 ue(v)   cpb_size_value_minus1[ SchedSelIdx ] 0 ue(v)   cbr_flag[ SchedSelIdx ] 0 u(1)  }    initial_cpb_removal_delay_length_minus1 0 u(5)  cpb_removal_delay_length_minus1 0 u(5)  dpb_output_delay_length_minus1 0 u(5)  time_offset_length 0 u(5) }   
vui_parameters( ) { C Descriptor  aspect_ratio_info_present_flag 0 u(1)  if( aspect_ratio_info_present_flag ) {     aspect_ratio_idc 0 u(8)   if( aspect_ratio_idc  = =  Extended_SAR ) {      sar_width 0 u(16)    sar_height 0 u(16)   }    }    overscan_info_present_flag 0 u(1)  if( overscan_info_present_flag )     overscan_appropriate_flag 0 u(1)  video_signal_type_present_flag 0 u(1)  if( video_signal_type_present_flag ) {     video_format 0 u(3)   video_full_range_flag 0 u(1)   colour_description_present_flag 0 u(1)   if( colour_description_present_flag ) {      colour_primaries 0 u(8)    transfer_characteristics 0 u(8)    matrix_coefficients 0 u(8)   }    }    chroma_loc_info_present_flag 0 u(1)  if( chroma_loc_info_present_flag ) {     chroma_sample_loc_type_top_field 0 ue(v)   chroma_sample_loc_type_bottom_field 0 ue(v)  }    timing_info_present_flag 0 u(1)  if( timing_info_present_flag ) {     num_units_in_tick 0 u(32)   time_scale 0 u(32)   fixed_frame_rate_flag 0 u(1)  }    nal_hrd_parameters_present_flag 0 u(1)  if( nal_hrd_parameters_present_flag )     hrd_parameters( )    vcl_hrd_parameters_present_flag 0 u(1)  if( vcl_hrd_parameters_present_flag )     hrd_parameters( )    if( nal_hrd_parameters_present_flag  | |  vcl_hrd_parameters_present_flag )     low_delay_hrd_flag 0 u(1)  pic_struct_present_flag  0 u(1)  bitstream_restriction_flag 0 u(1)  if( bitstream_restriction_flag ) {     motion_vectors_over_pic_boundaries_flag 0 u(1)   max_bytes_per_pic_denom 0 ue(v)   max_bits_per_mb_denom 0 ue(v)   log2_max_mv_length_horizontal 0 ue(v)   log2_max_mv_length_vertical 0 ue(v)   num_reorder_frames 0 ue(v)   max_dec_frame_buffering 0 ue(v)  }   }
seq_parameter_set_rbsp( ) { C Descriptor  profile_idc 0 u(8)  constraint_set0_flag 0 u(1)  constraint_set1_flag 0 u(1)  constraint_set2_flag 0 u(1)  reserved_zero_5bits /* equal to 0 */ 0 u(5)  level_idc 0 u(8)  seq_parameter_set_id 0 ue(v)  log2_max_frame_num_minus4 0 ue(v)  pic_order_cnt_type 0 ue(v)  if( pic_order_cnt_type  = =  0 )     log2_max_pic_order_cnt_lsb_minus4 0 ue(v)  else if( pic_order_cnt_type  = =  1 ) {     delta_pic_order_always_zero_flag 0 u(1)   offset_for_non_ref_pic 0 se(v)   offset_for_top_to_bottom_field 0 se(v)   num_ref_frames_in_pic_order_cnt_cycle 0 ue(v)   for( i = 0; i < num_ref_frames_in_pic_order_cnt_cycle; i++ )      offset_for_ref_frame[ i ] 0 se(v)  }    num_ref_frames 0 ue(v)  gaps_in_frame_num_value_allowed_flag 0 u(1)  pic_width_in_mbs_minus1 0 ue(v)  pic_height_in_map_units_minus1 0 ue(v)  frame_mbs_only_flag 0 u(1)  if( !frame_mbs_only_flag )     mb_adaptive_frame_field_flag 0 u(1)  direct_8x8_inference_flag 0 u(1)  frame_cropping_flag 0 u(1)  if( frame_cropping_flag ) {     frame_crop_left_offset 0 ue(v)   frame_crop_right_offset 0 ue(v)   frame_crop_top_offset 0 ue(v)   frame_crop_bottom_offset 0 ue(v)  }    vui_parameters_present_flag 0 u(1)  if( vui_parameters_present_flag )     vui_parameters( ) 0   rbsp_trailing_bits( ) 0  }
pic_parameter_set_rbsp( ) { C Descriptor  pic_parameter_set_id 1 ue(v)  seq_parameter_set_id 1 ue(v)  entropy_coding_mode_flag 1 u(1)  pic_order_present_flag 1 u(1)  num_slice_groups_minus1 1 ue(v)  if( num_slice_groups_minus1 > 0 ) {     slice_group_map_type 1 ue(v)   if( slice_group_map_type  = =  0 )      for( iGroup = 0; iGroup <= num_slice_groups_minus1; iGroup++ )       run_length_minus1[ iGroup ] 1 ue(v)   else if( slice_group_map_type  = =  2 )      for( iGroup = 0; iGroup < num_slice_groups_minus1; iGroup++ ) {       top_left[ iGroup ] 1 ue(v)     bottom_right[ iGroup ] 1 ue(v)    }     else if(  slice_group_map_type  = =  3  | |	slice_group_map_type  = =  4  | |	slice_group_map_type  = =  5 ) {      slice_group_change_direction_flag 1 u(1)    slice_group_change_rate_minus1 1 ue(v)   } else if( slice_group_map_type  = =  6 ) {      pic_size_in_map_units_minus1 1 ue(v)    for( i = 0; i <= pic_size_in_map_units_minus1; i++ )       slice_group_id[ i ] 1 u(v)   }    }    num_ref_idx_l0_active_minus1 1 ue(v)  num_ref_idx_l1_active_minus1 1 ue(v)  weighted_pred_flag 1 u(1)  weighted_bipred_idc 1 u(2)  pic_init_qp_minus26  /* relative to 26 */ 1 se(v)  pic_init_qs_minus26  /* relative to 26 */ 1 se(v)  chroma_qp_index_offset 1 se(v)  deblocking_filter_control_present_flag 1 u(1)  constrained_intra_pred_flag 1 u(1)  redundant_pic_cnt_present_flag 1 u(1)  rbsp_trailing_bits( ) 1  }   
slice_header( ) { C Descriptor  first_mb_in_slice 2 ue(v)  slice_type 2 ue(v)  pic_parameter_set_id 2 ue(v)  frame_num 2 u(v)  if( !frame_mbs_only_flag ) {     field_pic_flag 2 u(1)   if( field_pic_flag )      bottom_field_flag 2 u(1)  }    if( nal_unit_type  = =  5 )     idr_pic_id 2 ue(v)  if( pic_order_cnt_type  = =  0 ) {     pic_order_cnt_lsb 2 u(v)   if( pic_order_present_flag &&  !field_pic_flag )      delta_pic_order_cnt_bottom 2 se(v)  }    if( pic_order_cnt_type = = 1 && !delta_pic_order_always_zero_flag ) {     delta_pic_order_cnt[ 0 ] 2 se(v)   if( pic_order_present_flag  &&  !field_pic_flag )      delta_pic_order_cnt[ 1 ] 2 se(v)  }    if( redundant_pic_cnt_present_flag )     redundant_pic_cnt 2 ue(v)  if( slice_type  = =  B )     direct_spatial_mv_pred_flag 2 u(1)  if( slice_type = = P | | slice_type = = SP | | slice_type = = B ) {     num_ref_idx_active_override_flag 2 u(1)   if( num_ref_idx_active_override_flag ) {      num_ref_idx_l0_active_minus1 2 ue(v)    if( slice_type  = =  B )       num_ref_idx_l1_active_minus1 2 ue(v)   }    }    ref_pic_list_reordering( ) 2   if( ( weighted_pred_flag  &&  ( slice_type = = P  | |  slice_type = = SP ) )  | |   ( weighted_bipred_idc  = =  1  &&  slice_type  = =  B ) )     pred_weight_table( ) 2   if( nal_ref_idc != 0 )     dec_ref_pic_marking( ) 2   if( entropy_coding_mode_flag  &&  slice_type  !=  I  &&  slice_type  !=  SI )     cabac_init_idc 2 ue(v)  slice_qp_delta 2 se(v)  if( slice_type  = =  SP  | |  slice_type  = =  SI ) {     if( slice_type  = =  SP )      sp_for_switch_flag 2 u(1)   slice_qs_delta 2 se(v)  }    if( deblocking_filter_control_present_flag ) {     disable_deblocking_filter_idc 2 ue(v)   if( disable_deblocking_filter_idc  !=  1 ) {      slice_alpha_c0_offset_div2 2 se(v)    slice_beta_offset_div2 2 se(v)   }    }    if( num_slice_groups_minus1 > 0  &&   slice_group_map_type >= 3  &&  slice_group_map_type <= 5)     slice_group_change_cycle 2 u(v) }  
access_unit_delimiter_rbsp( ) { C Descriptor  primary_pic_type 6 u(3)  rbsp_trailing_bits( ) 6  } 
sei_payload( payloadType, payloadSize ) { C Descriptor if( payloadType = = 0 )   buffering_period( payloadSize ) 5  else if( payloadType = = 1 )   pic_timing( payloadSize ) 5  else if( payloadType = = 2 )   pan_scan_rect( payloadSize ) 5  else if( payloadType = = 3 )    filler_payload( payloadSize ) 5  else if( payloadType = = 4 )    user_data_registered_itu_t_t35( payloadSize ) 5  else if( payloadType = = 5 )    user_data_unregistered( payloadSize ) 5  else if( payloadType = = 6 )    recovery_point( payloadSize ) 5  else if( payloadType = = 7 )    dec_ref_pic_marking_repetition( payloadSize ) 5  else if( payloadType = = 8 )    spare_pic( payloadSize ) 5  else if( payloadType = = 9 )    scene_info( payloadSize ) 5  else if( payloadType = = 10 )    sub_seq_info( payloadSize ) 5  else if( payloadType = = 11 )    sub_seq_layer_characteristics( payloadSize ) 5  else if( payloadType = = 12 )    sub_seq_characteristics( payloadSize ) 5  else if( payloadType = = 13 )    full_frame_freeze( payloadSize ) 5  else if( payloadType = = 14 )    full_frame_freeze_release( payloadSize ) 5  else if( payloadType = = 15 )    full_frame_snapshot( payloadSize ) 5  else if( payloadType = = 16 )    progressive_refinement_segment_start( payloadSize ) 5  else if( payloadType = = 17 )    progressive_refinement_segment_end( payloadSize ) 5  else if( payloadType = = 18 )    motion_constrained_slice_group_set( payloadSize ) 5  else    reserved_sei_message( payloadSize ) 5  if( !byte_aligned( ) ) {   bit_equal_to_one  /* equal to 1 */ 5 f(1) while( !byte_aligned( ) )   bit_equal_to_zero  /* equal to 0 */ 5 f(1) }   }
buffering_period( payloadSize ) { C Descriptor  seq_parameter_set_id 5 ue(v)  if( NalHrdBpPresentFlag ) {     for( SchedSelIdx = 0; SchedSelIdx <= cur_pps.cpb_cnt_minus1; SchedSelIdx++ ) {      initial_cpb_removal_delay[ SchedSelIdx ] 5 u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1)    initial_cpb_removal_delay_offset[ SchedSelIdx ] 5 u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1)   }    }    if( VclHrdBpPresentFlag ) {     for( SchedSelIdx = 0; SchedSelIdx <= cpb_cnt_minus1; SchedSelIdx++ ) {      initial_cpb_removal_delay[ SchedSelIdx ] 5 u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1)    initial_cpb_removal_delay_offset[ SchedSelIdx ] 5 u(cur_pps.initial_cpb_removal_delay_length_minus1 + 1)   }    }   } 
pic_timing( payloadSize ) { C Descriptor  if( CpbDpbDelaysPresentFlag ) {     cpb_removal_delay 5 u(cur_pps.cpb_removal_delay_length_minus1 + 1)   dpb_output_delay 5 u(cur_pps.dpb_output_delay_length_minus1 + 1)  }    if( cur_pps.pic_struct_present_flag ) {     pic_struct 5 u(4)   for( i = 0; i < NumClockTS ; i++ ) {      clock_timestamp_flag[ i ] 5 u(1)    if( clock_timestamp_flag[i] ) {      ct_type 5 u(2)    nuit_field_based_flag 5 u(1)    counting_type 5 u(5)    full_timestamp_flag 5 u(1)    discontinuity_flag 5 u(1)    cnt_dropped_flag 5 u(1)    n_frames 5 u(8)    if( full_timestamp_flag ) {      seconds_value /* 0..59 */ 5 u(6)    minutes_value /* 0..59 */ 5 u(6)    hours_value /* 0..23 */ 5 u(5)    } else {      seconds_flag 5 u(1)    if( seconds_flag ) {	 seconds_value /* range 0..59 */ 5 u(6)       minutes_flag 5 u(1)       if( minutes_flag ) {	  minutes_value /* 0..59 */ 5 u(6)	hours_flag 5 u(1)	if( hours_flag )	   hours_value /* 0..23 */ 5 u(5)       }	}       }       if( cur_pps.time_offset_length > 0 )	time_offset 5 i(cur_pps.time_offset_length)    }     }    }   } 
pan_scan_rect( payloadSize ) { C Descriptor pan_scan_rect_id 5 ue(v) pan_scan_rect_cancel_flag 5 u(1) if( !pan_scan_rect_cancel_flag ) {    pan_scan_cnt_minus1 5 ue(v)  for( i = 0; i <= pan_scan_cnt_minus1; i++ ) {     pan_scan_rect_left_offset[ i ] 5 se(v)   pan_scan_rect_right_offset[ i ] 5 se(v)   pan_scan_rect_top_offset[ i ] 5 se(v)   pan_scan_rect_bottom_offset[ i ] 5 se(v)  }    pan_scan_rect_repetition_period 5 ue(v) }   } 
filler_payload( payloadSize ) { C Descriptor  for( k = 0; k < payloadSize; k++)     ff_byte  /* equal to 0xFF */ 5 f(8) }
user_data_unregistered( payloadSize ) { C Descriptor  uuid_iso_iec_11578 5 u(128)  for( i = 16; i < payloadSize; i++ )     user_data_payload_byte 5 b(8) } 
recovery_point( payloadSize ) { C Descriptor  recovery_frame_cnt 5 ue(v)  exact_match_flag 5 u(1)  broken_link_flag 5 u(1)  changing_slice_group_idc 5 u(2) } 
dec_ref_pic_marking_repetition( payloadSize ) { C Descriptor  original_idr_flag 5 u(1)  original_frame_num 5 ue(v)  if( !frame_mbs_only_flag ) {     original_field_pic_flag 5 u(1)   if( original_field_pic_flag )      original_bottom_field_flag 5 u(1)  }    dec_ref_pic_marking( ) 5  }
scene_info( payloadSize ) { C Descriptor  scene_info_present_flag 5 u(1)  if( scene_info_present_flag ) {     scene_id 5 ue(v)   scene_transition_type 5 ue(v)   if( scene_transition_type > 3 )      second_scene_id 5 ue(v)  }   } 
sub_seq_info( payloadSize ) { C Descriptor  sub_seq_layer_num 5 ue(v)  sub_seq_id 5 ue(v)  first_ref_pic_flag 5 u(1)  leading_non_ref_pic_flag 5 u(1)  last_pic_flag 5 u(1)  sub_seq_frame_num_flag 5 u(1)  if( sub_seq_frame_num_flag )     sub_seq_frame_num 5 ue(v) } 
sub_seq_layer_characteristics( payloadSize ) { C Descriptor  num_sub_seq_layers_minus1 5 ue(v)  for( layer = 0; layer <= num_sub_seq_layers_minus1; layer++ ) {     accurate_statistics_flag 5 u(1)   average_bit_rate 5 u(16)   average_frame_rate 5 u(16)  }   } 
sub_seq_characteristics( payloadSize ) { C Descriptor  sub_seq_layer_num 5 ue(v)  sub_seq_id 5 ue(v)  duration_flag 5 u(1)  if( duration_flag)     sub_seq_duration 5 u(32)  average_rate_flag 5 u(1)  if( average_rate_flag ) {     accurate_statistics_flag 5 u(1)   average_bit_rate 5 u(16)   average_frame_rate 5 u(16)  }    num_referenced_subseqs 5 ue(v)  for( n = 0; n < num_referenced_subseqs; n++ ) {     ref_sub_seq_layer_num 5 ue(v)   ref_sub_seq_id 5 ue(v)   ref_sub_seq_direction 5 u(1)  }   }
full_frame_freeze( payloadSize ) { C Descriptor  full_frame_freeze_repetition_period 5 ue(v) } 
full_frame_freeze_release( payloadSize ) { C Descriptor } 
full_frame_snapshot( payloadSize ) { C Descriptor  snapshot_id 5 ue(v) } 
progressive_refinement_segment_start( payloadSize ) { C Descriptor  progressive_refinement_id 5 ue(v)  num_refinement_steps_minus1 5 ue(v) } 
progressive_refinement_segment_end( payloadSize ) { C Descriptor  progressive_refinement_id 5 ue(v) } 
motion_constrained_slice_group_set( payloadSize ) { C Descriptor num_slice_groups_in_set_minus1 5 ue(v) for( i = 0; i <= num_slice_groups_in_set_minus1; i++)   slice_group_id[ i ] 5 u(v) exact_sample_value_match_flag 5 u(1) pan_scan_rect_flag 5 u(1) if( pan_scan_rect_flag )   pan_scan_rect_id 5 ue(v) } 
reserved_sei_message( payloadSize ) { C Descriptor  for( i = 0; i < payloadSize; i++ )     reserved_sei_message_payload_byte 5 b(8) } 
'''

# match operators and other notation syntax elements to python
specPortion = specPortion.replace('= =', '==').replace('| |', 'or').replace('&&', 'and').replace('!', 'not ').replace(' not =', ' !=')
specPortion = specPortion.replace('else if', 'elif').replace('++', ' += 1')
specPortion = specPortion.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')

# strip comments
curPos = 0
while True:
	commentStart = specPortion.find('/*')
	if commentStart < 0:
		break
	commentEnd = specPortion.find('*/', commentStart)
	if commentEnd < 0:
		break
	comment = specPortion[commentStart:(commentEnd + 2)]
	specPortion = specPortion.replace(comment, '')

# generate parsing code
parentCount = 0
brackCount = 0
curItem = ''
curVarName = ''
indent = ''
lastWasFunction = False
for curToken in specPortion.split(' '):
	curToken = curToken.strip()
	if len(curToken) == 0:
		continue
	
	# update parenthesis / bracket count
	if '(' in curToken:
		parentCount += 1
	if ')' in curToken:
		parentCount -= 1
	if '[' in curToken:
		brackCount += 1
	if ']' in curToken:
		brackCount -= 1
	curItem += ' ' + curToken
	if parentCount > 0 or brackCount > 0:
		continue
		
	# skip values that are not part of the specification
	curItem = curItem.strip()
	if curItem in ['C', 'Descriptor'] or isStringNumeric(curItem):
		curItem = ''
		continue
		
	if len(curVarName) == 0:
		if indent == '' and curItem.endswith(' )'):
			# function definition
			if curItem.endswith('( )'):
				curItem = curItem.replace('( )', '( parser )')
			else:
				curItem = curItem.replace('( ', '( parser, ')
			if lastWasFunction:
				outputBuffer += '\tpass\n'
			outputBuffer += '\t' * len(indent) + '\ndef ' + curItem + ':\n'
			lastWasFunction = True
		elif '(' in curItem or curItem == 'else':
			# control statement or function call
			if curItem.startswith('if(') or curItem.startswith('elif(') or curItem.startswith('for(') or curItem.startswith('while(') or curItem == 'else':
				# control statement
				curItem = curItem.replace('[', '_').replace(']', '_')
				curItem += ':'
			else:
				# function call, e.g. hrd_parameters( )
				if curItem.endswith('( )'):
					curItem = curItem.replace('( )', '( parser )')
				else:
					curItem = curItem.replace('( ', '( parser, ')
			outputBuffer += '\t' * len(indent) + curItem + '\n'
			lastWasFunction = False
			if curItem.endswith(':'):
				indent += ' '
			else:
				indent = indent.rstrip()
		elif curItem == '{':
			# block opening
			if indent.endswith(' '):
				indent = indent[:-1]
			indent += '{'
		elif curItem == '}':
			# block closing
			indent = indent[:-1].rstrip()
		else:
			# variable name definition, e.g. time_offset_length
			curVarName = curItem.replace(' ', '').replace('[', '_').replace(']', '_')
	else:
		# variable value, e.g. u(8)
		funcName = curItem.split('(')[0]
		params = curItem[(curItem.find('(') + 1):curItem.rfind(')')].strip()
		if len(params) > 0 and params != 'v':
			params = params.split(',')
		else:
			params = []
		params.append("'%s'" % curVarName)
		
		outputBuffer += '\t' * len(indent) + '%s = parser.%s(%s)\n' % (curVarName, funcName, ', '.join(params))
		lastWasFunction = False
		curVarName = ''
		indent = indent.rstrip()
		
	curItem = ''

# translate 'for' syntax, from 'for(x=0;x<10;x++)' to 'for x in xrange(10)'
for curMatch in re.finditer('for\s*\(\s*([\w\.]+)\s*=\s*(\d+)\s*;\s*([\w\.]+)\s*(\<=?)\s*([\w\.]+)\s*;\s*([\w\.]+)\s*\+=\s*(\d+)\s*\)', outputBuffer):
	originalFor = curMatch.group(0)
	iterVar1, startVal, iterVal2, compareOperator, endVal, iterVal3, increment = curMatch.groups()
	if iterVar1 != iterVal2 or iterVar1 != iterVal3:
		continue
	if compareOperator == '<=':
		endVal = endVal + ' + 1'
	if startVal == '0' and increment == '1':
		newFor = 'for %s in xrange(%s)' % (iterVar1, endVal)
	else:
		newFor = 'for %s in xrange(%s, %s, %s)' % (iterVar1, startVal, endVal, increment)
	outputBuffer = outputBuffer.replace(originalFor, newFor)

# replace variables defined in the h264 spec text
outputBuffer = outputBuffer.replace('NalHrdBpPresentFlag', 'cur_pps.nal_hrd_parameters_present_flag')
outputBuffer = outputBuffer.replace('VclHrdBpPresentFlag', 'cur_pps.vcl_hrd_parameters_present_flag')
outputBuffer = outputBuffer.replace('CpbDpbDelaysPresentFlag', '(cur_pps.nal_hrd_parameters_present_flag or cur_pps.vcl_hrd_parameters_present_flag)')
outputBuffer = outputBuffer.replace('NumClockTS', 'NumClockTS(pic_struct)')
	
# append several manually converted functions
outputBuffer += '''
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
'''

outputBuffer += '''
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

'''

outputBuffer += '\n# auto generated code - end\n'

outputBuffer = outputBuffer.replace('byte_aligned( )', 'parser.byte_aligned( )')

file(outputFileName, 'wb').write(outputBuffer)
