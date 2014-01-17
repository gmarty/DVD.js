'use strict';


import ifoTypes = require('./ifo_types');
import ifoRead = require('./ifo_read');
import config = require('../config');
import utils = require('../utils');
import vm = require('../vm/index');

export = ifo_print;

var DEBUG = config.DEBUG;
var sprintf = utils.sprintf;
var assert = utils.assert;
var ifoOpen = ifoRead.ifoOpen;

var outputBuffer;

var _vm = new vm();

// Put this in some other file / package? It's used in nav_print too.
/**
 * @param {number} level
 * @param {Object.<string, number>} dtime (passed as reference).
 */
function ifo_print_time(level, dtime) {
  // \@todo assert() here is OK?
  assert((dtime.hour >> 4) < 0x0A && (dtime.hour & 0x0F) < 0x0A);
  assert((dtime.minute >> 4) < 0x07 && (dtime.minute & 0x0F) < 0x0A);
  assert((dtime.second >> 4) < 0x07 && (dtime.second & 0x0F) < 0x0A);
  assert((dtime.frame_u & 0x0F) < 0x0A);

  /** @type {string} */ var rate = '';
  /** @type {string} */ var str = sprintf('%02x:%02x:%02x.%02x',
    dtime.hour,
    dtime.minute,
    dtime.second,
    dtime.frame_u & 0x3F);
  switch ((dtime.frame_u & 0xc0) >> 6) {
    case 1:
      rate = '25.00';
      break;
    case 3:
      rate = '29.97';
      break;
    default:
      if (dtime.hour == 0 && dtime.minute == 0
        && dtime.second == 0 && dtime.frame_u == 0)
        rate = 'no';
      else {
        rate = '(please send a bug report)';
        console.error('Unknown dvd_time_t %s', JSON.stringify(dtime));
      }
      break;
  }

  return str + sprintf(' @ %s fps', rate);
}


/**
 * @param {Object.<string, number>} dtime (passed as reference).
 */
function dvdread_print_time(dtime) {
  return ifo_print_time(5, dtime);
}


/* Put this in some other file / package?  It's used in nav_print too.
 Possibly also by the vm / navigator. */
/**
 * @param {number} level
 * @param {video_attr_t} attr (passed as reference).
 */
function ifo_print_video_attributes(level, attr) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var height = 480;

  /* The following test is shorter but not correct ISO C,
   memcmp(attr,my_friendly_zeros, sizeof(video_attr_t)) */
  if (attr.mpeg_version == 0
    && attr.video_format == 0
    && attr.display_aspect_ratio == 0
    && attr.permitted_df == 0
    && attr.unknown1 == 0
    && attr.line21_cc_1 == 0
    && attr.line21_cc_2 == 0
    && attr.video_format == 0
    && attr.letterboxed == 0
    && attr.film_mode == 0) {
    return '<i>-- Unspecified --</i>';
  }

  switch (attr.mpeg_version) {
    case 0:
      str += 'mpeg1, ';
      break;
    case 1:
      str += 'mpeg2, ';
      break;
    default:
      str += '(please send a bug report), ';
      console.error('Unknown mpeg_version %s', attr.mpeg_version);
  }

  switch (attr.video_format) {
    case 0:
      str += 'ntsc, ';
      break;
    case 1:
      str += 'pal, ';
      break;
    default:
      str += '(please send a bug report), ';
      console.error('Unknown video_format %s', attr.video_format);
  }

  switch (attr.display_aspect_ratio) {
    case 0:
      str += '4:3, ';
      break;
    case 3:
      str += '16:9, ';
      break;
    default:
      str += '(please send a bug report), ';
      console.error('Unknown display_aspect_ratio %s',
        attr.display_aspect_ratio);
  }

  // Wide is always allowed..!!!
  switch (attr.permitted_df) {
    case 0:
      str += 'pan&scan+letterboxed, ';
      break;
    case 1:
      str += 'only pan&scan, '; //??
      break;
    case 2:
      str += 'only letterboxed, ';
      break;
    case 3:
      str += 'unspecified, ';
      break;
    default:
      str += '(please send a bug report), ';
      console.error('Unknown permitted_df %s', attr.permitted_df);
  }

  str += sprintf('U%x, ', attr.unknown1);
  // \@todo assert() here is OK?
  assert(!attr.unknown1);

  if (attr.line21_cc_1 || attr.line21_cc_2) {
    str += 'NTSC CC ';
    if (attr.line21_cc_1)
      str += '1, ';
    if (attr.line21_cc_2)
      str += '2, ';
  }

  if (attr.video_format != 0)
    height = 576;
  switch (attr.picture_size) {
    case 0:
      str += sprintf('720x%d, ', height);
      break;
    case 1:
      str += sprintf('704x%d, ', height);
      break;
    case 2:
      str += sprintf('352x%d, ', height);
      break;
    case 3:
      str += sprintf('352x%d, ', height / 2);
      break;
    default:
      str += '(please send a bug report), ';
      console.error('Unknown picture_size %s', attr.picture_size);
  }

  if (attr.letterboxed) {
    str += 'source letterboxed, ';
  }

  if (attr.film_mode) {
    str += 'film.';
  } else {
    str += 'video.'; //camera
  }

  return str;
}


/**
 * @param {number} level
 * @param {audio_attr_t} attr (passed as reference).
 */
function ifo_print_audio_attributes(level, attr) {
  /** @type {string} */ var str = '';

  if (attr.audio_format == 0
    && attr.multichannel_extension == 0
    && attr.lang_type == 0
    && attr.application_mode == 0
    && attr.quantization == 0
    && attr.sample_frequency == 0
    && attr.channels == 0
    && attr.lang_extension == 0
    && attr.unknown1 == 0
    && attr.unknown3 == 0) {
    return '<i>-- Unspecified --</i>';
  }

  switch (attr.audio_format) {
    case 0:
      str += 'ac3 ';
      if (attr.quantization != 3) {
        str += sprintf('(please send a bug report) ac3 quant/drc not 3 (%d)',
          attr.quantization);
        console.error('ac3 quant/drc not 3 (%d)', attr.quantization);
      }
      break;
    case 1:
      str += '(please send a bug report) ';
      console.error('Unknown audio_format %s', attr.audio_format);
      break;
    case 2:
      str += 'mpeg1 ';
    // \@todo No `break;` here?
    case 3:
      str += 'mpeg2ext ';
      switch (attr.quantization) {
        case 0:
          str += 'no drc ';
          break;
        case 1:
          str += 'drc ';
          break;
        default:
          str += sprintf('(please send a bug report) mpeg reserved quant/drc  (%d)',
            attr.quantization);
          console.error('mpeg reserved quant/drc  (%d)', attr.quantization);
      }
      break;
    case 4:
      str += 'lpcm ';
      switch (attr.quantization) {
        case 0:
          str += '16bit ';
          break;
        case 1:
          str += '20bit ';
          break;
        case 2:
          str += '24bit ';
          break;
        case 3:
          str += sprintf('(please send a bug report) lpcm reserved quant/drc  (%d)',
            attr.quantization);
          console.error('lpcm reserved quant/drc  (%d)', attr.quantization);
          break;
      }
      break;
    case 5:
      str += '(please send a bug report) ';
      break;
    case 6:
      str += 'dts ';
      if (attr.quantization != 3) {
        str += sprintf('(please send a bug report) dts quant/drc not 3 (%d)',
          attr.quantization);
        console.error('dts quant/drc not 3 (%d)', attr.quantization);
      }
      break;
    default:
      str += '(please send a bug report) ';
      console.error('Unknown audio_format %s', attr.audio_format);
  }

  if (attr.multichannel_extension)
    str += 'multichannel_extension ';

  switch (attr.lang_type) {
    case 0:
      // Unspecified
      // \@todo assert() here is OK?
      assert(attr.lang_code == 0 || attr.lang_code == 0xFFFF);
      break;
    case 1:
      str += sprintf('%s ', utils.bit2str(attr.lang_code));
      break;
    default:
      str += '(please send a bug report) ';
      console.error('Unknown lang_type %s', attr.lang_type);
  }

  switch (attr.application_mode) {
    case 0:
      // Unspecified
      break;
    case 1:
      str += 'karaoke mode ';
      break;
    case 2:
      str += 'surround sound mode ';
      break;
    default:
      str += '(please send a bug report) ';
      console.error('Unknown application_mode %s', attr.application_mode);
  }

  switch (attr.quantization) {
    case 0:
      str += '16bit ';
      break;
    case 1:
      str += '20bit ';
      break;
    case 2:
      str += '24bit ';
      break;
    case 3:
      str += 'drc ';
      break;
    default:
      str += '(please send a bug report) ';
      console.error('Unknown quantization %s', attr.quantization);
  }

  switch (attr.sample_frequency) {
    case 0:
      str += '48kHz ';
      break;
    case 1:
      str += '??kHz ';
      break;
    default:
      str += '(please send a bug report) ';
      console.error('Unknown sample_frequency %s', attr.sample_frequency);
  }

  str += sprintf('%dCh ', attr.channels + 1);

  switch (attr.lang_extension) {
    case 0:
      str += 'unspecified ';
      break;
    case 1: // Normal audio
      str += 'Normal Caption ';
      break;
    case 2: // visually impaired
      str += 'Audio for visually impaired ';
      break;
    case 3: // Directors 1
      str += "Director's comments 1 ";
      break;
    case 4: // Directors 2
      str += "Director's comments 2 ";
      break;
    //case 4: // Music score ?
    default:
      str += '(please send a bug report) ';
      console.error('Unknown lang_extension %s', attr.lang_extension);
  }

  str += sprintf('%d ', attr.unknown1);
  str += sprintf('%d ', attr.unknown3);

  return str;
}


/**
 * @param {number} level
 * @param {subp_attr_t} attr (passed as reference).
 */
function ifo_print_subp_attributes(level, attr) {
  /** @type {string} */ var str = '';

  if (attr.type == 0
    && attr.lang_code == 0
    && attr.zero1 == 0
    && attr.zero2 == 0
    && attr.lang_extension == 0) {
    return '<i>-- Unspecified --</i>';
  }

  str += sprintf('type %02x ', attr.type);

  if (utils.isalpha(attr.lang_code >> 8) && utils.isalpha(attr.lang_code & 0xFF)) {
    str += sprintf('%s ', utils.bit2str(attr.lang_code));
  } else {
    str += sprintf('%02x%02x ', 0xFF & (attr.lang_code >> 8), 0xff & (attr.lang_code & 0xFF));
  }

  str += sprintf('%d ', attr.zero1);
  str += sprintf('%d ', attr.zero2);

  switch (attr.lang_extension) {
    case 0:
      str += 'unspecified ';
      break;
    case 1:
      str += 'Caption with normal size character ';
      break;
    case 2:
      str += 'Caption with bigger size character ';
      break;
    case 3:
      str += 'Caption for children ';
      break;
    case 4:
      str += 'reserved ';
      break;
    case 5:
      str += 'Closed Caption with normal size character ';
      break;
    case 6:
      str += 'Closed Caption with bigger size character ';
      break;
    case 7:
      str += 'Closed Caption for children ';
      break;
    case 8:
      str += 'reserved ';
      break;
    case 9:
      str += 'Forced Caption';
      break;
    case 10:
      str += 'reserved ';
      break;
    case 11:
      str += 'reserved ';
      break;
    case 12:
      str += 'reserved ';
      break;
    case 13:
      str += "Director's comments with normal size character ";
      break;
    case 14:
      str += "Director's comments with bigger size character ";
      break;
    case 15:
      str += "Director's comments for children ";
      break;
    default:
      str += '(please send a bug report) ';
  }

  return str;
}


/**
 * @param {user_ops_t} user_ops (passed as reference).
 */
function ifoPrint_USER_OPS(user_ops) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var ptr = user_ops;
  /** @type {number} */ var uops;

  uops = (ptr++ << 24);
  uops |= (ptr++ << 16);
  uops |= (ptr++ << 8);
  uops |= (ptr++);

  if (uops == 0) {
    str += 'None';
  } else if (uops == 0x01FFFFFF) {
    str += 'All';
  } else {
    if (user_ops.title_or_time_play)
      str += 'Title or Time Play, ';
    if (user_ops.chapter_search_or_play)
      str += 'Chapter Search or Play, ';
    if (user_ops.title_play)
      str += 'Title Play, ';
    if (user_ops.stop)
      str += 'Stop, ';
    if (user_ops.go_up)
      str += 'Go Up, ';
    if (user_ops.time_or_chapter_search)
      str += 'Time or Chapter Search, ';
    if (user_ops.prev_or_top_pg_search)
      str += 'Prev or Top PG Search, ';
    if (user_ops.next_pg_search)
      str += 'Next PG Search, ';
    if (user_ops.forward_scan)
      str += 'Forward Scan, ';
    if (user_ops.backward_scan)
      str += 'Backward Scan, ';
    if (user_ops.title_menu_call)
      str += 'Title Menu Call, ';
    if (user_ops.root_menu_call)
      str += 'Root Menu Call, ';
    if (user_ops.subpic_menu_call)
      str += 'SubPic Menu Call, ';
    if (user_ops.audio_menu_call)
      str += 'Audio Menu Call, ';
    if (user_ops.angle_menu_call)
      str += 'Angle Menu Call, ';
    if (user_ops.chapter_menu_call)
      str += 'Chapter Menu Call, ';
    if (user_ops.resume)
      str += 'Resume, ';
    if (user_ops.button_select_or_activate)
      str += 'Button Select or Activate, ';
    if (user_ops.still_off)
      str += 'Still Off, ';
    if (user_ops.pause_on)
      str += 'Pause On, ';
    if (user_ops.audio_stream_change)
      str += 'Audio Stream Change, ';
    if (user_ops.subpic_stream_change)
      str += 'SubPic Stream Change, ';
    if (user_ops.angle_change)
      str += 'Angle Change, ';
    if (user_ops.karaoke_audio_pres_mode_change)
      str += 'Karaoke Audio Pres Mode Change, ';
    if (user_ops.video_pres_mode_change)
      str += 'Video Pres Mode Change, ';
  }

  return str;
}


/**
 * @param {vmgi_mat_t} vmgi_mat (passed as reference).
 */
function ifoPrint_VMGI_MAT(vmgi_mat) {

  output('VMG Identifier: %.12s', vmgi_mat.vmg_identifier);
  output('Last Sector of VMG: %08x', vmgi_mat.vmg_last_sector);
  output('Last Sector of VMGI: %08x', vmgi_mat.vmgi_last_sector);
  output('Specification version number: %01x.%01x',
    vmgi_mat.specification_version >> 4,
    vmgi_mat.specification_version & 0x0F);
  // Byte 2 of 'VMG Category' (00xx0000) is the Region Code
  output('VMG Category: %08x (Region Code=%02x)',
    vmgi_mat.vmg_category, ((vmgi_mat.vmg_category >> 16) & 0xFF) ^ 0xFF);
  output('VMG Number of Volumes: %i', vmgi_mat.vmg_nr_of_volumes);
  output('VMG This Volume: %i', vmgi_mat.vmg_this_volume_nr);
  output('Disc side: %i', vmgi_mat.disc_side);
  output('VMG Number of Title Sets: %i', vmgi_mat.vmg_nr_of_title_sets);
  output('Provider ID: %.32s', vmgi_mat.provider_identifier);
  output('VMG POS Code: %08x', (vmgi_mat.vmg_pos_code >> 32));
  //output('%08x', vmgi_mat.vmg_pos_code);
  output('End byte of VMGI_MAT: %08x', vmgi_mat.vmgi_last_byte);
  output('Start byte of First Play PGC (FP PGC): %08x',
    vmgi_mat.first_play_pgc);
  output('Start sector of VMGM_VOBS: %08x', vmgi_mat.vmgm_vobs);
  output('Start sector of TT_SRPT: %08x', vmgi_mat.tt_srpt);
  output('Start sector of VMGM_PGCI_UT: %08x', vmgi_mat.vmgm_pgci_ut);
  output('Start sector of PTL_MAIT: %08x', vmgi_mat.ptl_mait);
  output('Start sector of VTS_ATRT: %08x', vmgi_mat.vts_atrt);
  output('Start sector of TXTDT_MG: %08x', vmgi_mat.txtdt_mgi);
  output('Start sector of VMGM_C_ADT: %08x', vmgi_mat.vmgm_c_adt);
  output('Start sector of VMGM_VOBU_ADMAP: %08x',
    vmgi_mat.vmgm_vobu_admap);
  output('Video attributes of VMGM_VOBS: %s',
    ifo_print_video_attributes(5, vmgi_mat.vmgm_video_attr));
  output('VMGM Number of Audio attributes: %i',
    vmgi_mat.nr_of_vmgm_audio_streams);
  if (vmgi_mat.nr_of_vmgm_audio_streams > 0) {
    output('\tstream %i status: %s',
      1, ifo_print_audio_attributes(5, vmgi_mat.vmgm_audio_attr));
  }
  output('VMGM Number of Sub-picture attributes: %i',
    vmgi_mat.nr_of_vmgm_subp_streams);
  if (vmgi_mat.nr_of_vmgm_subp_streams > 0) {
    output('\tstream %2i status: ', 1);
    ifo_print_subp_attributes(5, vmgi_mat.vmgm_subp_attr);
  }
}


/**
 * @param {vtsi_mat_t} vtsi_mat (passed as reference).
 */
function ifoPrint_VTSI_MAT(vtsi_mat) {
  /** @type {number} */ var i;

  output('VTS Identifier: %.12s', vtsi_mat.vts_identifier);
  output('Last Sector of VTS: %08x', vtsi_mat.vts_last_sector);
  output('Last Sector of VTSI: %08x', vtsi_mat.vtsi_last_sector);
  output('Specification version number: %01x.%01x',
    vtsi_mat.specification_version >> 4,
    vtsi_mat.specification_version & 0x0F);
  output('VTS Category: %08x', vtsi_mat.vts_category);
  output('End byte of VTSI_MAT: %08x', vtsi_mat.vtsi_last_byte);
  output('Start sector of VTSM_VOBS:  %08x', vtsi_mat.vtsm_vobs);
  output('Start sector of VTSTT_VOBS: %08x', vtsi_mat.vtstt_vobs);
  output('Start sector of VTS_PTT_SRPT: %08x', vtsi_mat.vts_ptt_srpt);
  output('Start sector of VTS_PGCIT:    %08x', vtsi_mat.vts_pgcit);
  output('Start sector of VTSM_PGCI_UT: %08x', vtsi_mat.vtsm_pgci_ut);
  output('Start sector of VTS_TMAPT:    %08x', vtsi_mat.vts_tmapt);
  output('Start sector of VTSM_C_ADT:      %08x', vtsi_mat.vtsm_c_adt);
  output('Start sector of VTSM_VOBU_ADMAP: %08x', vtsi_mat.vtsm_vobu_admap);
  output('Start sector of VTS_C_ADT:       %08x', vtsi_mat.vts_c_adt);
  output('Start sector of VTS_VOBU_ADMAP:  %08x', vtsi_mat.vts_vobu_admap);

  output('Video attributes of VTSM_VOBS: %s',
    ifo_print_video_attributes(5, vtsi_mat.vtsm_video_attr));

  output('VTSM Number of Audio attributes: %i',
    vtsi_mat.nr_of_vtsm_audio_streams);
  if (vtsi_mat.nr_of_vtsm_audio_streams > 0) {
    output('\tstream %i status: %s',
      1, ifo_print_audio_attributes(5, vtsi_mat.vtsm_audio_attr));
  }

  output('VTSM Number of Sub-picture attributes: %i',
    vtsi_mat.nr_of_vtsm_subp_streams);
  if (vtsi_mat.nr_of_vtsm_subp_streams > 0) {
    output('\tstream %2i status: ', 1);
    ifo_print_subp_attributes(5, vtsi_mat.vtsm_subp_attr);
  }

  output('Video attributes of VTS_VOBS: %s',
    ifo_print_video_attributes(5, vtsi_mat.vts_video_attr));

  output('VTS Number of Audio attributes: %i',
    vtsi_mat.nr_of_vts_audio_streams);
  for (i = 0; i < vtsi_mat.nr_of_vts_audio_streams; i++) {
    output('\tstream %i status: %s',
      i, ifo_print_audio_attributes(5, vtsi_mat.vts_audio_attr[i]));
  }

  output('VTS Number of Subpicture attributes: %i',
    vtsi_mat.nr_of_vts_subp_streams);
  for (i = 0; i < vtsi_mat.nr_of_vts_subp_streams; i++) {
    output('\tstream %2i status: ', i);
    ifo_print_subp_attributes(5, vtsi_mat.vts_subp_attr[i]);
  }
}


/**
 * @param {pgc_command_tbl_t} cmd_tbl (passed as reference).
 */
function ifoPrint_PGC_COMMAND_TBL(cmd_tbl) {
  /** @type {number} */ var i;

  if (cmd_tbl == null) {
    output('No Command table present');
    return;
  }

  output('Number of Pre commands: %i', cmd_tbl.nr_of_pre);
  for (i = 0; i < cmd_tbl.nr_of_pre; i++) {
    output(_vm.print_cmd(i, cmd_tbl.pre_cmds[i]));
  }

  output('Number of Post commands: %i', cmd_tbl.nr_of_post);
  for (i = 0; i < cmd_tbl.nr_of_post; i++) {
    output(_vm.print_cmd(i, cmd_tbl.post_cmds[i]));
  }

  output('Number of Cell commands: %i', cmd_tbl.nr_of_cell);
  for (i = 0; i < cmd_tbl.nr_of_cell; i++) {
    output(_vm.print_cmd(i, cmd_tbl.cell_cmds[i]));
  }
}


/**
 * @param {pgc_program_map_t} program_map (passed as reference).
 * @param {number} nr
 */
function ifoPrint_PGC_PROGRAM_MAP(program_map, nr) {
  /** @type {number} */ var i;

  if (program_map == null) {
    output('No Program map present');
    return;
  }

  for (i = 0; i < nr; i++) {
    output('Program %3i Entry Cell: %3i', i + 1, program_map[i]);
  }
}


/**
 * @param {cell_playback_t} cell_playback (passed as reference).
 * @param {number} nr
 */
function ifoPrint_CELL_PLAYBACK(cell_playback, nr) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var i;
  /** @type {string} */ var s;

  if (cell_playback == null) {
    output('No Cell Playback info present');
    return;
  }

  for (i = 0; i < nr; i++) {
    str = sprintf('Cell: %3i %s',
      i + 1, dvdread_print_time(cell_playback[i].playback_time));

    str += '\t';

    if (cell_playback[i].block_mode || cell_playback[i].block_type) {
      switch (cell_playback[i].block_mode) {
        case 0:
          s = 'not a';
          break;
        case 1:
          s = 'the first';
          break;
        case 2:
        default:
          s = '';
          break;
        case 3:
          s = 'last';
          break;
      }
      str += sprintf('%s cell in the block ', s);

      switch (cell_playback[i].block_type) {
        case 0:
          str += 'not part of the block ';
          break;
        case 1:
          str += 'angle block ';
          break;
        case 2:
        case 3:
          str += '(send bug report) ';
          break;
      }
    }
    if (cell_playback[i].seamless_play)
      str += 'presented seamlessly ';
    if (cell_playback[i].interleaved)
      str += 'cell is interleaved ';
    if (cell_playback[i].stc_discontinuity)
      str += 'STC_discontinuty ';
    if (cell_playback[i].seamless_angle)
      str += 'only seamless angle ';
    if (cell_playback[i].playback_mode)
      str += 'only still VOBUs ';
    if (cell_playback[i].restricted)
      str += 'restricted cell ';
    if (cell_playback[i].unknown2)
      str += sprintf('Unknown 0x%x ', cell_playback[i].unknown2);
    if (cell_playback[i].still_time)
      str += sprintf('still time %d ', cell_playback[i].still_time);
    if (cell_playback[i].cell_cmd_nr)
      str += sprintf('cell command %d', cell_playback[i].cell_cmd_nr);
    output(str);

    output('\tStart sector: %08x\tFirst ILVU end  sector: %08x',
      cell_playback[i].first_sector,
      cell_playback[i].first_ilvu_end_sector);
    output('\tEnd   sector: %08x\tLast VOBU start sector: %08x',
      cell_playback[i].last_sector,
      cell_playback[i].last_vobu_start_sector);
  }
}


/**
 * @param {cell_position_t} cell_position (passed as reference).
 * @param {number} nr
 */
function ifoPrint_CELL_POSITION(cell_position, nr) {
  /** @type {number} */ var i;

  if (cell_position == null) {
    output('No Cell Position info present');
    return;
  }

  for (i = 0; i < nr; i++) {
    output('Cell: %3i has VOB ID: %3i, Cell ID: %3i', i + 1,
      cell_position[i].vob_id_nr, cell_position[i].cell_nr);
  }
}


/**
 * @param {pgc_t} pgc (passed as reference).
 */
function ifoPrint_PGC(pgc) {
  /** @type {number} */ var i;

  if (!pgc) {
    output('None');
    return;
  }
  output('Number of Programs: %i', pgc.nr_of_programs);
  output('Number of Cells: %i', pgc.nr_of_cells);
  // Check that time is 0:0:0:0 also if nr_of_programs == 0
  output('Playback time: %s', dvdread_print_time(pgc.playback_time));

  // If no programs/no time then does this mean anything?
  output('Prohibited user operations: %s',
    ifoPrint_USER_OPS(pgc.prohibited_ops));

  for (i = 0; i < 8; i++) {
    if (pgc.audio_control[i] & 0x8000) { // The 'is present' bit
      output('Audio stream %i control: %04x', i, pgc.audio_control[i]);
    }
  }

  for (i = 0; i < 32; i++) {
    if (pgc.subp_control[i] & 0x80000000) { // The 'is present' bit
      output('Subpicture stream %2i control: %08x: 4:3=%d, Wide=%d, Letterbox=%d, Pan-Scan=%d',
        i, pgc.subp_control[i],
        (pgc.subp_control[i] >> 24) & 0x1F,
        (pgc.subp_control[i] >> 16) & 0x1F,
        (pgc.subp_control[i] >> 8) & 0x1F,
        (pgc.subp_control[i]) & 0x1F);
    }
  }

  output('Next PGC number: %i', pgc.next_pgc_nr);
  output('Prev PGC number: %i', pgc.prev_pgc_nr);
  output('GoUp PGC number: %i', pgc.goup_pgc_nr);
  if (pgc.nr_of_programs != 0) {
    output('Still time: %i seconds (255=inf)', pgc.still_time);
    output('PG Playback mode %02x', pgc.pg_playback_mode);
  }

  if (pgc.nr_of_programs != 0) {
    for (i = 0; i < 16; i++) {
      output('Color %2i: <span class="color" style="background-color:#%06x"></span> %08x', i, pgc.palette[i], pgc.palette[i]);
    }
  }

  // Memory offsets to div. tables.
  ifoPrint_PGC_COMMAND_TBL(pgc.command_tbl);
  ifoPrint_PGC_PROGRAM_MAP(pgc.program_map, pgc.nr_of_programs);
  ifoPrint_CELL_PLAYBACK(pgc.cell_playback, pgc.nr_of_cells);
  ifoPrint_CELL_POSITION(pgc.cell_position, pgc.nr_of_cells);
}


/**
 * @param {tt_srpt_t} tt_srpt (passed as reference).
 */
function ifoPrint_TT_SRPT(tt_srpt) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var i;

  output('Number of TitleTrack search pointers: %i', tt_srpt.nr_of_srpts);
  for (i = 0; i < tt_srpt.nr_of_srpts; i++) {
    output('Title Track index %i', i + 1);
    str = sprintf('\tTitle set number (VTS): %i',
      tt_srpt.title[i].title_set_nr);
    str += sprintf('\tVTS_TTN: %i', tt_srpt.title[i].vts_ttn);
    output(str);
    output('\tNumber of PTTs: %i', tt_srpt.title[i].nr_of_ptts);
    output('\tNumber of angles: %i', tt_srpt.title[i].nr_of_angles);

    output('\tTitle playback type: (%02x)',
      (tt_srpt.title[i].pb_ty.multi_or_random_pgc_title << 6) +
        (tt_srpt.title[i].pb_ty.jlc_exists_in_cell_cmd << 5) +
        (tt_srpt.title[i].pb_ty.jlc_exists_in_prepost_cmd << 4) +
        (tt_srpt.title[i].pb_ty.jlc_exists_in_button_cmd << 3) +
        (tt_srpt.title[i].pb_ty.jlc_exists_in_tt_dom << 2) +
        (tt_srpt.title[i].pb_ty.chapter_search_or_play << 1) +
        tt_srpt.title[i].pb_ty.title_or_time_play
    );
    output('\t\t%s',
      tt_srpt.title[i].pb_ty.multi_or_random_pgc_title ? 'Random or Shuffle' : 'Sequential');
    if (tt_srpt.title[i].pb_ty.jlc_exists_in_cell_cmd)
      output('\t\tJump/Link/Call exists in cell cmd');
    if (tt_srpt.title[i].pb_ty.jlc_exists_in_prepost_cmd)
      output('\t\tJump/Link/Call exists in pre/post cmd');
    if (tt_srpt.title[i].pb_ty.jlc_exists_in_button_cmd)
      output('\t\tJump/Link/Call exists in button cmd');
    if (tt_srpt.title[i].pb_ty.jlc_exists_in_tt_dom)
      output('\t\tJump/Link/Call exists in tt_dom cmd');
    output('\t\tTitle or time play: %d',
      tt_srpt.title[i].pb_ty.title_or_time_play);
    output('\t\tChapter search or play: %d',
      tt_srpt.title[i].pb_ty.chapter_search_or_play);

    output('\tParental ID field: %04x',
      tt_srpt.title[i].parental_id);
    output('\tTitle set starting sector %08x',
      tt_srpt.title[i].title_set_sector);
  }
}


/**
 * @param {vts_ptt_srpt_t} vts_ptt_srpt (passed as reference).
 */
function ifoPrint_VTS_PTT_SRPT(vts_ptt_srpt) {
  /** @type {number} */ var i;
  /** @type {number} */ var j;

  output('nr_of_srpts %i last byte %i', vts_ptt_srpt.nr_of_srpts, vts_ptt_srpt.last_byte);

  for (i = 0; i < vts_ptt_srpt.nr_of_srpts; i++) {
    for (j = 0; j < vts_ptt_srpt.title[i].nr_of_ptts; j++) {
      output('VTS_PTT_SRPT - Title %3i part %3i: PGC: %3i PG: %3i',
        i + 1, j + 1,
        vts_ptt_srpt.title[i].ptt[j].pgcn,
        vts_ptt_srpt.title[i].ptt[j].pgn);
    }
  }
}


/**
 * @param {ptl_mait_t} ptl_mait (passed as reference).
 */
function ifoPrint_PTL_MAIT(ptl_mait) {
  /** @type {number} */ var i;
  /** @type {number} */ var j;

  output('Number of Countries: %i', ptl_mait.nr_of_countries);
  output('Number of VTSs: %i', ptl_mait.nr_of_vtss);
  //output("Last byte: %i", ptl_mait.last_byte);

  for (i = 0; i < ptl_mait.nr_of_countries; i++) {
    output('Country code: %s', utils.bit2str(ptl_mait.countries[i].country_code));
    /*
     output("Start byte: %04x %i",
     ptl_mait.countries[i].pf_ptl_mai_start_byte,
     ptl_mait.countries[i].pf_ptl_mai_start_byte);
     */
    /* This seems to be pointing at a array with 8 2byte fields per VTS
     ? and one extra for the menu? always an odd number of VTSs on
     all the dics I tested so it might be padding to even also.
     If it is for the menu it probably the first entry.  */
    for (j = 0; j < 8; j++) {
      output(utils.hexdump(ptl_mait.countries - ifoTypes.PTL_MAIT_COUNTRY_SIZE
        + ptl_mait.countries[i].pf_ptl_mai_start_byte
        + j * (ptl_mait.nr_of_vtss + 1) * 2,
        (ptl_mait.nr_of_vtss + 1) * 2));
      output('');
    }
  }
}


/**
 * @param {vts_tmapt_t} vts_tmapt (passed as reference).
 */
function ifoPrint_VTS_TMAPT(vts_tmapt) {
  /** @type {number} */ var timeunit;
  /** @type {number} */ var i;
  /** @type {number} */ var j;
  /** @type {number} */ var ac_time;

  output('Number of VTS_TMAPS: %i', vts_tmapt.nr_of_tmaps);
  output('Last byte: %i', vts_tmapt.last_byte);

  for (i = 0; i < vts_tmapt.nr_of_tmaps; i++) {
    output('TMAP %i (number matches title PGC number.)', i + 1);
    output('  offset %d relative to VTS_TMAPTI', vts_tmapt.tmap_offset[i]);
    output('  Time unit (seconds): %i', vts_tmapt.tmap[i].tmu);
    output('  Number of entries: %i', vts_tmapt.tmap[i].nr_of_entries);
    timeunit = vts_tmapt.tmap[i].tmu;
    for (j = 0; j < vts_tmapt.tmap[i].nr_of_entries; j++) {
      ac_time = timeunit * (j + 1);
      output('Time: %2i:%02i:%02i  VOBU Sector: 0x%08x %s',
        ac_time / (60 * 60), (ac_time / 60) % 60, ac_time % 60,
        vts_tmapt.tmap[i].map_ent[j] & 0x7FFFFFFF,
        (vts_tmapt.tmap[i].map_ent[j] >> 31) ? 'discontinuity' : '');
    }
  }
}


/**
 * @param {c_adt_t} c_adt (passed as reference).
 */
function ifoPrint_C_ADT(c_adt) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var i;
  /** @type {number} */ var entries;

  output('Number of VOBs in this VOBS: %i', c_adt.nr_of_vobs);
  //entries = c_adt.nr_of_vobs;
  entries = (c_adt.last_byte + 1 - ifoTypes.C_ADT_SIZE) / ifoTypes.CELL_ADR_SIZE;

  for (i = 0; i < entries; i++) {
    str = sprintf('VOB ID: %3i, Cell ID: %3i   ',
      c_adt.cell_adr_table[i].vob_id, c_adt.cell_adr_table[i].cell_id);
    str += sprintf('Sector (first): 0x%08x   (last): 0x%08x',
      c_adt.cell_adr_table[i].start_sector,
      c_adt.cell_adr_table[i].last_sector);
    output(str);
  }
}


/**
 * @param {vobu_admap_t} vobu_admap (passed as reference).
 */
function ifoPrint_VOBU_ADMAP(vobu_admap) {
  /** @type {number} */ var i;
  /** @type {number} */ var entries;

  entries = (vobu_admap.last_byte + 1 - ifoTypes.VOBU_ADMAP_SIZE) / 4;
  for (i = 0; i < entries; i++) {
    output('VOBU %5i  First sector: 0x%08x', i + 1, vobu_admap.vobu_start_sectors[i]);
  }
}


/**
 * Function passed as reference.
 * @param {number} type
 * @return {string}
 */
function ifo_print_menu_name(type) {
  switch (type) {
    case 2:
      return 'Title';
      break;
    case 3:
      return 'Root';
      break;
    case 4:
      return 'Sub-Picture';
      break;
    case 5:
      return 'Audio';
      break;
    case 6:
      return 'Angle';
      break;
    case 7:
      return 'PTT (Chapter)';
      break;
    default:
      return 'Unknown';
      break;
  }
}


// pgc_type=1 for menu, 0 for title.
/**
 * @param {pgcit_t} pgcit (passed as reference).
 * @param {number} pgc_type
 */
function ifoPrint_PGCIT(pgcit, pgc_type) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var i;

  output('Number of Program Chains: %3i', pgcit.nr_of_pgci_srp);
  for (i = 0; i < pgcit.nr_of_pgci_srp; i++) {
    output('');
    output('Program (PGC): %3i', i + 1);
    if (pgc_type) {
      str = sprintf('PGC Category: Entry PGC %d, Menu Type=0x%02x:%s (Entry id 0x%02x), ',
        pgcit.pgci_srp[i].entry_id >> 7,
        pgcit.pgci_srp[i].entry_id & 0x0F,
        ifo_print_menu_name(pgcit.pgci_srp[i].entry_id & 0x0F),
        pgcit.pgci_srp[i].entry_id);
    } else {
      str = sprintf('PGC Category: %s VTS_TTN:0x%02x (Entry id 0x%02x), ',
        pgcit.pgci_srp[i].entry_id >> 7 ? 'At Start of' : 'During',
        pgcit.pgci_srp[i].entry_id & 0x0F,
        pgcit.pgci_srp[i].entry_id);
    }
    str += sprintf('Parental ID mask 0x%04x', pgcit.pgci_srp[i].ptl_id_mask);
    output(str);
    ifoPrint_PGC(pgcit.pgci_srp[i].pgc);
  }
}


/**
 * @param {pgci_ut_t} pgci_ut (passed as reference).
 */
function ifoPrint_PGCI_UT(pgci_ut) {
  /** @type {string} */ var str = '';
  /** @type {number} */ var i;
  /** @type {number} */ var menu;

  output('Number of Menu Language Units (PGCI_LU): %3i', pgci_ut.nr_of_lus);
  output('');
  for (i = 0; i < pgci_ut.nr_of_lus; i++) {
    output('Menu Language Unit %d', i + 1);
    output('Menu Language Code: %s', utils.bit2str(pgci_ut.lu[i].lang_code));

    menu = pgci_ut.lu[i].exists;
    str += sprintf('Menu Existence: %02x: ', menu);
    if (menu == 0) {
      str += 'No menus ';
    }
    if (menu & 0x80) {
      str += 'Root ';
      menu ^= 0x80;
    }
    if (menu & 0x40) {
      str += 'Sub-Picture ';
      menu ^= 0x40;
    }
    if (menu & 0x20) {
      str += 'Audio ';
      menu ^= 0x20;
    }
    if (menu & 0x10) {
      str += 'Angle ';
      menu ^= 0x10;
    }
    if (menu & 0x08) {
      str += 'PTT ';
      menu ^= 0x08;
    }
    if (menu > 0) {
      //str += 'Unknown extra menus ';
      str += '(please send a bug report) ';
      console.error('Unknown extra menu %s', menu);
      menu ^= 0x08;
    }
    output(str);
    output('');
    ifoPrint_PGCIT(pgci_ut.lu[i].pgcit, 1);
  }
}


/**
 * @param {vts_attributes_t} vts_attributes (passed as reference).
 */
function ifoPrint_VTS_ATTRIBUTES(vts_attributes) {
  /** @type {number} */ var i;

  output('VTS_CAT Application type: %08x', vts_attributes.vts_cat);

  output('Video attributes of VTSM_VOBS: %s',
    ifo_print_video_attributes(5, vts_attributes.vtsm_vobs_attr));
  output('');

  output('Number of Audio streams: %i',
    vts_attributes.nr_of_vtsm_audio_streams);
  if (vts_attributes.nr_of_vtsm_audio_streams > 0) {
    output('\tstream %i attributes: %s',
      1, ifo_print_audio_attributes(5, vts_attributes.vtsm_audio_attr));
  }
  output('Number of Subpicture streams: %i',
    vts_attributes.nr_of_vtsm_subp_streams);
  if (vts_attributes.nr_of_vtsm_subp_streams > 0) {
    output('\tstream %2i attributes: ', 1);
    ifo_print_subp_attributes(5, vts_attributes.vtsm_subp_attr);
  }

  output('Video attributes of VTSTT_VOBS: %s',
    ifo_print_video_attributes(5, vts_attributes.vtstt_vobs_video_attr));
  output('Number of Audio streams: %i',
    vts_attributes.nr_of_vtstt_audio_streams);
  for (i = 0; i < vts_attributes.nr_of_vtstt_audio_streams; i++) {
    output('\tstream %i attributes: %s',
      i, ifo_print_audio_attributes(5, vts_attributes.vtstt_audio_attr[i]));
  }

  output('Number of Subpicture streams: %i',
    vts_attributes.nr_of_vtstt_subp_streams);
  for (i = 0; i < vts_attributes.nr_of_vtstt_subp_streams; i++) {
    output('\tstream %2i attributes: ', i);
    ifo_print_subp_attributes(5, vts_attributes.vtstt_subp_attr[i]);
  }
}


/**
 * @param {vts_atrt_t} vts_atrt (passed as reference).
 */
function ifoPrint_VTS_ATRT(vts_atrt) {
  /** @type {number} */ var i;

  output('Number of Video Title Sets: %3i', vts_atrt.nr_of_vtss);

  for (i = 0; i < vts_atrt.nr_of_vtss; i++) {
    output('');
    output('Video Title Set %i', i + 1);
    ifoPrint_VTS_ATTRIBUTES(vts_atrt.vts[i]);
  }
}


/**
 * @param {dvd_reader_t} dvd (passed as reference).
 * @param {number} title
 * @param $element
 */
function ifo_print(dvd, title, $element) {
  console.log('ifo_print', dvd, title);

  outputBuffer = '';
  while ($element.firstChild) {
    $element.removeChild($element.firstChild);
  }

  /** @type {ifo_handle_t} */ var ifohandle = ifoOpen(dvd, title);
  if (!ifohandle) {
    console.error("Can't open info file for title %d", title);
    return;
  }

  if (ifohandle.vmgi_mat) {
    output('<b>VMG top level</b>');
    output('-------------');
    ifoPrint_VMGI_MAT(ifohandle.vmgi_mat);
    output('');

    output('<b>First Play PGC</b>');
    output('--------------');
    if (ifohandle.first_play_pgc)
      ifoPrint_PGC(ifohandle.first_play_pgc);
    else
      output('No First Play PGC present</b>');
    output('');

    output('<b>Title Track search pointer table</b>');
    output('------------------------------------------------');
    ifoPrint_TT_SRPT(ifohandle.tt_srpt);
    output('');

    output('<b>Menu PGCI Unit table</b>');
    output('--------------------');
    console.log(ifohandle.pgci_ut);
    if (ifohandle.pgci_ut) {
      ifoPrint_PGCI_UT(ifohandle.pgci_ut);
    } else {
      output('<i>No PGCI Unit table present</i>');
    }
    output('');

    output('<b>Parental Management Information table</b>');
    output('------------------------------------');
    if (ifohandle.ptl_mait) {
      ifoPrint_PTL_MAIT(ifohandle.ptl_mait);
    } else {
      output('<i>No Parental Management Information present</i>');
    }
    output('');

    output('<b>Video Title Set Attribute Table</b>');
    output('-------------------------------');
    ifoPrint_VTS_ATRT(ifohandle.vts_atrt);
    output('');

    output('<b>Text Data Manager Information</b>');
    output('-----------------------------');
    if (ifohandle.txtdt_mgi) {
      //ifo_print_TXTDT_MGI(vmgi.txtdt_mgi);
    } else {
      output('<i>No Text Data Manager Information present</i>');
    }
    output('');

    output('<b>Menu Cell Address table</b>');
    output('-----------------');
    if (ifohandle.menu_c_adt) {
      ifoPrint_C_ADT(ifohandle.menu_c_adt);
    } else {
      output('<i>No Menu Cell Address table present</i>');
    }
    output('');

    output('<b>Video Manager Menu VOBU address map</b>');
    output('-----------------');
    if (ifohandle.menu_vobu_admap) {
      ifoPrint_VOBU_ADMAP(ifohandle.menu_vobu_admap);
    } else {
      output('<i>No Menu VOBU address map present</i>');
    }
  }

  if (ifohandle.vtsi_mat) {
    output('<b>VTS top level</b>');
    output('-------------');
    ifoPrint_VTSI_MAT(ifohandle.vtsi_mat);
    output('');

    output('<b>Part of Title Track search pointer table</b>');
    output('----------------------------------------------');
    ifoPrint_VTS_PTT_SRPT(ifohandle.vts_ptt_srpt);
    output('');

    output('<b>PGCI Unit table</b>');
    output('--------------------');
    ifoPrint_PGCIT(ifohandle.vts_pgcit, 0);
    output('');

    output('<b>Menu PGCI Unit table</b>');
    output('--------------------');
    if (ifohandle.pgci_ut) {
      ifoPrint_PGCI_UT(ifohandle.pgci_ut);
    } else {
      output('<i>No Menu PGCI Unit table present</i>');
    }
    output('');

    output('<b>VTS Time Map table</b>');
    output('-----------------');
    if (ifohandle.vts_tmapt) {
      ifoPrint_VTS_TMAPT(ifohandle.vts_tmapt);
    } else {
      output('<i>No VTS Time Map table present</i>');
    }
    output('');

    output('<b>Menu Cell Address table</b>');
    output('-----------------');
    if (ifohandle.menu_c_adt) {
      ifoPrint_C_ADT(ifohandle.menu_c_adt);
    } else {
      output('<i>No Cell Address table present</i>');
    }
    output('');

    output('<b>Video Title Set Menu VOBU address map</b>');
    output('-----------------');
    if (ifohandle.menu_vobu_admap) {
      ifoPrint_VOBU_ADMAP(ifohandle.menu_vobu_admap);
    } else {
      output('<i>No Menu VOBU address map present</i>');
    }
    output('');

    output('<b>Cell Address table</b>');
    output('-----------------');
    ifoPrint_C_ADT(ifohandle.vts_c_adt);
    output('');

    output('<b>Video Title Set VOBU address map</b>');
    output('-----------------');
    ifoPrint_VOBU_ADMAP(ifohandle.vts_vobu_admap);
  }

  //console.log(outputBuffer);
  $element.innerHTML = outputBuffer;

  //ifoClose(ifohandle);
  if (DEBUG) {
    console.log(ifohandle);
  }
}

/**
 * @param {string} str
 * @param {*=} arg1
 * @param {*=} arg2
 * @param {*=} arg3
 * @param {*=} arg4
 * @param {*=} arg5
 * @param {*=} arg6
 * @param {*=} arg7
 * @param {*=} arg8
 * @param {*=} arg9
 * @param {*=} arg10
 * @param {*=} arg11
 * @param {*=} arg12
 */
function output(str: string, arg1?: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any, arg7?: any, arg8?: any, arg9?: any, arg10?: any, arg11?: any, arg12?: any) {
  outputBuffer += sprintf.apply(undefined, arguments) + '\n';
}
