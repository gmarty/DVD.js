///<reference path='../declarations/BinaryParser.d.ts'/>

'use strict';


import dvdReader = require('./index');
import ifoTypes = require('./ifo_types');
import BinaryParser = require('../lib/binaryParser/index');
import utils = require('../utils');

var sprintf = utils.sprintf;
var CHECK_ZERO = utils.CHECK_ZERO;
var CHECK_ZERO0 = utils.CHECK_ZERO0;
var CHECK_VALUE = utils.CHECK_VALUE;

var ifo_handle_t = ifoTypes.ifo_handle_t;

var dvd_read_domain_t = dvdReader.dvd_read_domain_t;

/** @const */ var DVD_BLOCK_LEN = 2048;

/**
 * Opens an IFO and reads in all the data for the IFO file corresponding to the
 * given title. If title 0 is given, the video manager IFO file is read.
 * Returns a handle to a completely parsed structure.
 *
 * @param {dvd_reader_t} dvd
 * @param {number} title
 * @return {?ifo_handle_t}
 */
export function ifoOpen(dvd, title) {
  var bup_file_opened = false;
  var ifo_filename = '';

  var ifofile = new ifo_handle_t();

  console.log(dvd);

  ifofile.file = dvd.openFile(title, dvd_read_domain_t.DVD_READ_INFO_FILE);
  if (!ifofile.file) { // Failed to open IFO, try to open BUP
    ifofile.file = dvd.openFile(title, dvd_read_domain_t.DVD_READ_INFO_BACKUP_FILE);
    bup_file_opened = true;
  }

  if (title) {
    ifo_filename = sprintf('VTS_%02d_0.%s', title, bup_file_opened ? 'BUP' : 'IFO');
  } else {
    ifo_filename = sprintf('VIDEO_TS.%s', bup_file_opened ? 'BUP' : 'IFO');
  }

  //ifo_filename[12] = '\0';

  if (!ifofile.file) {
    console.error('jsdvdnav: Can\'t open file %s.', ifo_filename);
    return null;
  }

  ifofile = parseIFO(ifofile, title, ifo_filename);

  // First check if this is a VMGI file.
  if (ifofile.vmgi_mat) {
    if (!ifofile || !ifofile.first_play_pgc || !ifofile.tt_srpt || !ifofile || !ifofile.vts_atrt) {
      return null;
    }
    return ifofile;
  }

  if (ifofile.vtsi_mat) {
    if (!ifofile.vts_ptt_srpt || !ifofile.vts_pgcit || !ifofile.vts_c_adt || !ifofile.vts_vobu_admap) {
      return null;
    }
    return ifofile;
  }

  return null;
}

export function parseIFO(ifofile, title, ifo_filename) {
  // First check if this is a VMGI file.
  ifofile = ifoRead_VMG(ifofile);
  if (ifofile.vmgi_mat) {
    // These are both mandatory.
    ifofile = ifoRead_FP_PGC(ifofile);
    ifofile = ifoRead_TT_SRPT(ifofile);
    if (!ifofile || !ifofile.first_play_pgc || !ifofile.tt_srpt)
      return ifoOpen_fail(title, ifo_filename);

    ifofile = ifoRead_PGCI_UT(ifofile);
    ifofile = ifoRead_PTL_MAIT(ifofile);

    // This is also mandatory.
    ifofile = ifoRead_VTS_ATRT(ifofile);
    if (!ifofile || !ifofile.vts_atrt)
      return ifoOpen_fail(title, ifo_filename);

    ifofile = ifoRead_TXTDT_MGI(ifofile);
    ifofile = ifoRead_C_ADT(ifofile);
    ifofile = ifoRead_VOBU_ADMAP(ifofile);

    return ifofile;
  }

  ifofile = ifoRead_VTS(ifofile);
  if (ifofile.vtsi_mat) {
    // These are both mandatory.
    ifofile = ifoRead_VTS_PTT_SRPT(ifofile);
    ifofile = ifoRead_PGCIT(ifofile);
    if (!ifofile.vts_ptt_srpt || !ifofile.vts_pgcit) {
      return ifoOpen_fail(title, ifo_filename);
    }

    ifofile = ifoRead_PGCI_UT(ifofile);
    ifofile = ifoRead_VTS_TMAPT(ifofile);
    ifofile = ifoRead_C_ADT(ifofile);
    ifofile = ifoRead_VOBU_ADMAP(ifofile);

    // These are also mandatory.
    ifofile = ifoRead_TITLE_C_ADT(ifofile);
    ifofile = ifoRead_TITLE_VOBU_ADMAP(ifofile);
    if (!ifofile.vts_c_adt || !ifofile.vts_vobu_admap) {
      return ifoOpen_fail(title, ifo_filename);
    }

    return ifofile;
  }
}

function ifoOpen_fail(title, ifo_filename) {
  console.error('jsdvdnav: Invalid IFO for title %d (%s)', title, ifo_filename);
  return null;
}

/**
 * Opens an IFO and reads in _only_ the vmgi_mat data. This call can be used
 * together with the calls below to read in each segment of the IFO file on
 * demand.
 *
 * @param {dvd_reader_t} dvd
 * @return {?ifo_handle_t}
 */
export function ifoOpenVMGI(dvd) {
  /** @type {ifo_handle_t} */ var ifofile = new ifo_handle_t();

  ifofile.file = dvd.openFile(0, dvd_read_domain_t.DVD_READ_INFO_FILE);
  if (!ifofile.file) // Should really catch any error and try to fallback
    ifofile.file = dvd.openFile(0, dvd_read_domain_t.DVD_READ_INFO_BACKUP_FILE);
  if (!ifofile.file) {
    console.error('Can\'t open file VIDEO_TS.IFO.');
    return null;
  }

  if (ifoRead_VMG(ifofile))
    return ifofile;

  console.error('Invalid main menu IFO (VIDEO_TS.IFO).');
  ifofile = null;
  return null;
}


/**
 * Opens an IFO and reads in _only_ the vtsi_mat data. This call can be used
 * together with the calls below to read in each segment of the IFO file on
 * demand.
 *
 * @param {dvd_reader_t} dvd
 * @param {number} title
 * @return {?ifo_handle_t}
 */
export function ifoOpenVTSI(dvd, title) {
  /** @type {ifo_handle_t} */ var ifofile = new ifo_handle_t();

  if (title <= 0 || title > 99) {
    console.error('jsdvdnav: ifoOpenVTSI invalid title (%d)).', title);
    return null;
  }

  ifofile.file = dvd.openFile(title, dvd_read_domain_t.DVD_READ_INFO_FILE);
  if (!ifofile.file) // Should really catch any error and try to fallback
    ifofile.file = dvd.openFile(title, dvd_read_domain_t.DVD_READ_INFO_BACKUP_FILE);
  if (!ifofile.file) {
    console.error('jsdvdnav: Can\'t open file VTS_%02d_0.IFO.', title);
    return null;
  }

  ifoRead_VTS(ifofile);
  if (ifofile.vtsi_mat)
    return ifofile;

  console.error('jsdvdnav: Invalid IFO for title %d (VTS_%02d_0.IFO)).', title, title);
  ifofile = null;
  return null;
}


/**
 * The following functions are for reading only part of the VMGI/VTSI files.
 * Returns 1 if the data was successfully read and 0 on error.
 */


/**
 * @param {ifo_handle_t} ifofile
 * @return {ifo_handle_t}
 */
function ifoRead_VMG(ifofile) {
  ifofile.file.view.seek(0);

  //try {
  var vmgi_mat = new BinaryParser(ifofile.file.view, ifoTypes.vmgi_mat_t()).parse('main');
  /*} catch (e) {
   ifofile.vmgi_mat = null;
   return ifofile;
   }*/

  // Do we need this test before actual parsing?
  if (vmgi_mat.vmg_identifier != 'DVDVIDEO-VMG') {
    ifofile.vmgi_mat = null;
    return ifofile;
  }

  CHECK_ZERO(vmgi_mat.zero_1);
  CHECK_ZERO(vmgi_mat.zero_2);
  CHECK_ZERO(vmgi_mat.zero_3);
  CHECK_ZERO(vmgi_mat.zero_4);
  CHECK_ZERO(vmgi_mat.zero_5);
  CHECK_ZERO(vmgi_mat.zero_6);
  CHECK_ZERO(vmgi_mat.zero_7);
  CHECK_ZERO(vmgi_mat.zero_8);
  CHECK_ZERO(vmgi_mat.zero_9);
  CHECK_ZERO(vmgi_mat.zero_10);
  CHECK_VALUE(vmgi_mat.vmg_last_sector != 0);
  CHECK_VALUE(vmgi_mat.vmgi_last_sector != 0);
  CHECK_VALUE(vmgi_mat.vmgi_last_sector * 2 <= vmgi_mat.vmg_last_sector);
  CHECK_VALUE(vmgi_mat.vmgi_last_sector * 2 <= vmgi_mat.vmg_last_sector);
  CHECK_VALUE(vmgi_mat.vmg_nr_of_volumes != 0);
  CHECK_VALUE(vmgi_mat.vmg_this_volume_nr != 0);
  CHECK_VALUE(vmgi_mat.vmg_this_volume_nr <= vmgi_mat.vmg_nr_of_volumes);
  CHECK_VALUE(vmgi_mat.disc_side == 1 || vmgi_mat.disc_side == 2);
  CHECK_VALUE(vmgi_mat.vmg_nr_of_title_sets != 0);
  CHECK_VALUE(vmgi_mat.vmgi_last_byte >= 341);
  CHECK_VALUE(vmgi_mat.vmgi_last_byte / DVD_BLOCK_LEN <=
    vmgi_mat.vmgi_last_sector);
  // It seems that first_play_pgc is optional.
  CHECK_VALUE(vmgi_mat.first_play_pgc < vmgi_mat.vmgi_last_byte);
  CHECK_VALUE(vmgi_mat.vmgm_vobs == 0 ||
    (vmgi_mat.vmgm_vobs > vmgi_mat.vmgi_last_sector &&
      vmgi_mat.vmgm_vobs < vmgi_mat.vmg_last_sector));
  CHECK_VALUE(vmgi_mat.tt_srpt <= vmgi_mat.vmgi_last_sector);
  CHECK_VALUE(vmgi_mat.vmgm_pgci_ut <= vmgi_mat.vmgi_last_sector);
  CHECK_VALUE(vmgi_mat.ptl_mait <= vmgi_mat.vmgi_last_sector);
  CHECK_VALUE(vmgi_mat.vts_atrt <= vmgi_mat.vmgi_last_sector);
  CHECK_VALUE(vmgi_mat.txtdt_mgi <= vmgi_mat.vmgi_last_sector);
  CHECK_VALUE(vmgi_mat.vmgm_c_adt <= vmgi_mat.vmgi_last_sector);
  CHECK_VALUE(vmgi_mat.vmgm_vobu_admap <= vmgi_mat.vmgi_last_sector);

  CHECK_VALUE(vmgi_mat.nr_of_vmgm_audio_streams <= 1);
  CHECK_VALUE(vmgi_mat.nr_of_vmgm_subp_streams <= 1);

  ifofile.vmgi_mat = vmgi_mat;

  return ifofile;
}


/**
 * @param {ifo_handle_t} ifofile
 * @return {?ifo_handle_t}
 */
function ifoRead_VTS(ifofile) {
  ifofile.file.view.seek(0);

  //try {
  var i;
  var vtsi_mat = new BinaryParser(ifofile.file.view, ifoTypes.vtsi_mat_t()).parse('main');
  /*} catch (e) {
   ifofile.vtsi_mat = null;
   return ifofile;
   }*/

  // Do we need this test before actual parsing?
  if (vtsi_mat.vts_identifier != 'DVDVIDEO-VTS') {
    return null;
  }

  CHECK_ZERO(vtsi_mat.zero_1);
  CHECK_ZERO(vtsi_mat.zero_2);
  CHECK_ZERO(vtsi_mat.zero_3);
  CHECK_ZERO(vtsi_mat.zero_4);
  CHECK_ZERO(vtsi_mat.zero_5);
  CHECK_ZERO(vtsi_mat.zero_6);
  CHECK_ZERO(vtsi_mat.zero_7);
  CHECK_ZERO(vtsi_mat.zero_8);
  CHECK_ZERO(vtsi_mat.zero_9);
  CHECK_ZERO(vtsi_mat.zero_10);
  CHECK_ZERO(vtsi_mat.zero_11);
  CHECK_ZERO(vtsi_mat.zero_12);
  CHECK_ZERO(vtsi_mat.zero_13);
  CHECK_ZERO(vtsi_mat.zero_14);
  CHECK_ZERO(vtsi_mat.zero_15);
  CHECK_ZERO(vtsi_mat.zero_16);
  CHECK_ZERO(vtsi_mat.zero_17);
  CHECK_ZERO(vtsi_mat.zero_18);
  CHECK_ZERO(vtsi_mat.zero_19);
  CHECK_ZERO(vtsi_mat.zero_20);
  CHECK_ZERO(vtsi_mat.zero_21);
  CHECK_VALUE(vtsi_mat.vtsi_last_sector * 2 <= vtsi_mat.vts_last_sector);
  CHECK_VALUE(vtsi_mat.vtsi_last_byte / DVD_BLOCK_LEN <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vtsm_vobs == 0 ||
    (vtsi_mat.vtsm_vobs > vtsi_mat.vtsi_last_sector &&
      vtsi_mat.vtsm_vobs < vtsi_mat.vts_last_sector));
  CHECK_VALUE(vtsi_mat.vtstt_vobs == 0 ||
    (vtsi_mat.vtstt_vobs > vtsi_mat.vtsi_last_sector &&
      vtsi_mat.vtstt_vobs < vtsi_mat.vts_last_sector));
  CHECK_VALUE(vtsi_mat.vts_ptt_srpt <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vts_pgcit <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vtsm_pgci_ut <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vts_tmapt <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vtsm_c_adt <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vtsm_vobu_admap <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vts_c_adt <= vtsi_mat.vtsi_last_sector);
  CHECK_VALUE(vtsi_mat.vts_vobu_admap <= vtsi_mat.vtsi_last_sector);

  CHECK_VALUE(vtsi_mat.nr_of_vtsm_audio_streams <= 1);
  CHECK_VALUE(vtsi_mat.nr_of_vtsm_subp_streams <= 1);

  CHECK_VALUE(vtsi_mat.nr_of_vts_audio_streams <= 8);
  for (i = vtsi_mat.nr_of_vts_audio_streams; i < 8; i++)
    CHECK_ZERO(vtsi_mat.vts_audio_attr[i]);

  CHECK_VALUE(vtsi_mat.nr_of_vts_subp_streams <= 32);
  for (i = vtsi_mat.nr_of_vts_subp_streams; i < 32; i++)
    CHECK_ZERO(vtsi_mat.vts_subp_attr[i]);

  for (i = 0; i < 8; i++) {
    CHECK_ZERO0(vtsi_mat.vts_mu_audio_attr[i].zero1);
    CHECK_ZERO0(vtsi_mat.vts_mu_audio_attr[i].zero2);
    CHECK_ZERO0(vtsi_mat.vts_mu_audio_attr[i].zero3);
    CHECK_ZERO0(vtsi_mat.vts_mu_audio_attr[i].zero4);
    CHECK_ZERO0(vtsi_mat.vts_mu_audio_attr[i].zero5);
    CHECK_ZERO(vtsi_mat.vts_mu_audio_attr[i].zero6);
  }

  ifofile.vtsi_mat = vtsi_mat;
  return ifofile;
}


/**
 * @param {ifo_handle_t} ifofile A IFO file handler.
 * @param {number} offset
 * @return {pgc_command_tbl_t}
 */
function ifoRead_PGC_COMMAND_TBL(ifofile, offset) {
  ifofile.file.view.seek(offset);

  //try {
  var cmd_tbl = /** @type {pgc_command_tbl_t} */ (new BinaryParser(ifofile.file.view, ifoTypes.pgc_command_tbl_t()).parse('main'));
  /*} catch (e) {
   return null;
   }*/

  CHECK_VALUE(cmd_tbl.nr_of_pre + cmd_tbl.nr_of_post + cmd_tbl.nr_of_cell <= 255);

  // Make a run over all the commands and see that we can interpret them all?
  return cmd_tbl;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} nr
 * @param {number} offset
 * @return {?Array.<pgc_program_map_t>}
 */
function ifoRead_PGC_PROGRAM_MAP(ifofile, nr, offset) {
  ifofile.file.view.seek(offset);

  var program_map = [];
  var i;

  for (i = 0; i < nr; i++) {
    //try {
    program_map[i] = new BinaryParser(ifofile.file.view, ifoTypes.pgc_program_map_t()).parse('main');
    /*} catch (e) {
     return null;
     }*/
  }

  return program_map;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} nr
 * @param {number} offset
 * @return {?Array.<cell_playback_t>}
 */
function ifoRead_CELL_PLAYBACK_TBL(ifofile, nr, offset) {
  ifofile.file.view.seek(offset);

  var cell_playback = [];
  var i;

  for (i = 0; i < nr; i++) {
    //try {
    cell_playback[i] = new BinaryParser(ifofile.file.view, ifoTypes.cell_playback_t()).parse('main');
    /*} catch (e) {
     return null;
     }*/

    // Changed < to <= because this was false in the movie 'Pi'.
    CHECK_VALUE(cell_playback[i].last_vobu_start_sector <=
      cell_playback[i].last_sector);
    CHECK_VALUE(cell_playback[i].first_sector <=
      cell_playback[i].last_vobu_start_sector);
  }

  return cell_playback;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} nr
 * @param {number} offset
 * @return {?Array.<cell_position_t>}
 */
function ifoRead_CELL_POSITION_TBL(ifofile, nr, offset) {
  ifofile.file.view.seek(offset);

  var cell_position = [];
  var i;

  for (i = 0; i < nr; i++) {
    //try {
    cell_position[i] = new BinaryParser(ifofile.file.view, ifoTypes.cell_position_t()).parse('main');
    /*} catch (e) {
     return null;
     }*/

    CHECK_ZERO(cell_position[i].zero_1);
  }

  return cell_position;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} offset
 * @return {?pgc_t}
 */
function ifoRead_PGC(ifofile, offset) {
  ifofile.file.view.seek(offset);

  //try {
  var i;
  var pgc = new BinaryParser(ifofile.file.view, ifoTypes.pgc_t()).parse('main');
  /*} catch (e) {
   return null;
   }*/

  CHECK_ZERO(pgc.zero_1);
  CHECK_VALUE(pgc.nr_of_programs <= pgc.nr_of_cells);

  // verify time (look at print_time)
  for (i = 0; i < 8; i++) {
    if (!(pgc.audio_control[i] & 0x8000)) // The 'is present' bit
      CHECK_ZERO(pgc.audio_control[i]);
  }
  for (i = 0; i < 32; i++) {
    if (!(pgc.subp_control[i] & 0x80000000)) // The 'is present' bit
      CHECK_ZERO(pgc.subp_control[i]);
  }

  // Check that time is 0:0:0:0 also if nr_of_programs == 0
  if (pgc.nr_of_programs == 0) {
    CHECK_ZERO(pgc.still_time);
    CHECK_ZERO(pgc.pg_playback_mode); // ??
    CHECK_VALUE(pgc.program_map_offset == 0);
    CHECK_VALUE(pgc.cell_playback_offset == 0);
    CHECK_VALUE(pgc.cell_position_offset == 0);
  } else {
    CHECK_VALUE(pgc.program_map_offset != 0);
    CHECK_VALUE(pgc.cell_playback_offset != 0);
    CHECK_VALUE(pgc.cell_position_offset != 0);
  }

  if (pgc.command_tbl_offset != 0) {
    pgc.command_tbl = ifoRead_PGC_COMMAND_TBL(ifofile,
      offset + pgc.command_tbl_offset);
  } else {
    pgc.command_tbl = null;
  }

  // Untested yet.
  if (pgc.program_map_offset != 0 && pgc.nr_of_programs > 0) {
    pgc.program_map = ifoRead_PGC_PROGRAM_MAP(ifofile, pgc.nr_of_programs,
      offset + pgc.program_map_offset);
  } else {
    pgc.program_map = null;
  }

  // Untested yet.
  if (pgc.cell_playback_offset != 0 && pgc.nr_of_cells > 0) {
    pgc.cell_playback = ifoRead_CELL_PLAYBACK_TBL(ifofile, pgc.nr_of_cells,
      offset + pgc.cell_playback_offset);
    if (pgc.cell_playback == null) {
      if (pgc.program_map)
        pgc.program_map = null;
    }
  } else {
    pgc.cell_playback = null;
  }

  // Untested yet.
  if (pgc.cell_position_offset != 0 && pgc.nr_of_cells > 0) {
    pgc.cell_position = ifoRead_CELL_POSITION_TBL(ifofile, pgc.nr_of_cells,
      offset + pgc.cell_position_offset);
  } else {
    pgc.cell_position = null;
  }

  return pgc;
}


/**
 * Reads in the first play program chain data, filling the
 * ifofile.first_play_pgc structure. This data is only located in the video
 * manager information file (VMGI). This structure is optional.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_FP_PGC(ifofile) {
  if (!ifofile || !ifofile.vmgi_mat)
    return null;

  // It seems that first_play_pgc is optional after all.
  ifofile.first_play_pgc = 0;
  if (ifofile.vmgi_mat.first_play_pgc == 0)
    return ifofile;

  ifofile.first_play_pgc = ifoRead_PGC(ifofile, ifofile.vmgi_mat.first_play_pgc);

  if (ifofile.first_play_pgc == null) {
    ifofile.first_play_pgc = null;
    return null;
  }

  return ifofile;
}


/**
 * Reads the title info for the main menu, filling the ifofile.tt_srpt
 * structure and its substructures. This data is only located in the video
 * manager information file. This structure is mandatory in the IFO file.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_TT_SRPT(ifofile) {
  if (!ifofile || !ifofile.vmgi_mat)
    return null;

  if (ifofile.vmgi_mat.tt_srpt == 0) // mandatory
    return null;

  ifofile.file.view.seek(ifofile.vmgi_mat.tt_srpt * DVD_BLOCK_LEN);

  //try {
  var i;
  var tt_srpt = new BinaryParser(ifofile.file.view, ifoTypes.tt_srpt_t()).parse('main');
  /*} catch (e) {
   ifofile.tt_srpt = null;
   return ifofile;
   }*/

  var info_length = tt_srpt.last_byte + 1 - ifoTypes.TT_SRPT_SIZE;

  CHECK_ZERO(tt_srpt.zero_1);
  CHECK_VALUE(tt_srpt.nr_of_srpts != 0);
  CHECK_VALUE(tt_srpt.nr_of_srpts < 100); // ??
  CHECK_VALUE(tt_srpt.nr_of_srpts * ifoTypes.TITLE_INFO_SIZE <= info_length);

  for (i = 0; i < tt_srpt.nr_of_srpts; i++) {
    CHECK_VALUE(tt_srpt.title[i].pb_ty.zero_1 == 0);
    CHECK_VALUE(tt_srpt.title[i].nr_of_angles != 0);
    CHECK_VALUE(tt_srpt.title[i].nr_of_angles < 10);
    // CHECK_VALUE(tt_srpt.title[i].nr_of_ptts != 0);
    // XXX: this assertion breaks Ghostbusters:
    CHECK_VALUE(tt_srpt.title[i].nr_of_ptts < 1000); // ??
    CHECK_VALUE(tt_srpt.title[i].title_set_nr != 0);
    CHECK_VALUE(tt_srpt.title[i].title_set_nr < 100); // ??
    CHECK_VALUE(tt_srpt.title[i].vts_ttn != 0);
    CHECK_VALUE(tt_srpt.title[i].vts_ttn < 100); // ??
    // CHECK_VALUE(tt_srpt.title[i].title_set_sector != 0);
  }

  // Make this a function
  //if (0) {
  /*function if(memcmp(()tt_srpt.title +
   tt_srpt.nr_of_srpts * sizeof(title_info_t),
   my_friendly_zeros,
   info_length - tt_srpt.nr_of_srpts * sizeof(title_info_t))) {
   console.error('VMG_PTT_SRPT slack is != 0, ');*/
  /*function hexdump(()tt_srpt.title +
   tt_srpt.nr_of_srpts * sizeof(title_info_t),
   info_length - tt_srpt.nr_of_srpts * sizeof(title_info_t));
   }
   }*/

  ifofile.tt_srpt = tt_srpt;
  return ifofile;
}


/**
 * Reads in the part of title search pointer table, filling the
 * ifofile.vts_ptt_srpt structure and its substructures. This data is only
 * located in the video title set information file. This structure is
 * mandatory, and must be included in the VTSI file.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_VTS_PTT_SRPT(ifofile) {
  if (!ifofile || !ifofile.vtsi_mat)
    return null;

  if (ifofile.vtsi_mat.vts_ptt_srpt == 0) // mandatory
    return null;

  ifofile.file.view.seek(ifofile.vtsi_mat.vts_ptt_srpt * DVD_BLOCK_LEN);

  //try {
  var i = 0, j = 0, n = 0, info_length = 0;
  var vts_ptt_srpt = new BinaryParser(ifofile.file.view, ifoTypes.vts_ptt_srpt_t()).parse('main');
  /*} catch (e) {
   ifofile.vmgi_mat = null;
   return ifofile;
   }*/

  CHECK_ZERO(vts_ptt_srpt.zero_1);
  CHECK_VALUE(vts_ptt_srpt.nr_of_srpts != 0);
  CHECK_VALUE(vts_ptt_srpt.nr_of_srpts < 100); // ??

  info_length = vts_ptt_srpt.last_byte + 1 - ifoTypes.VTS_PTT_SRPT_SIZE;
  if (vts_ptt_srpt.nr_of_srpts > info_length / 4 * vts_ptt_srpt.nr_of_srpts) {
    console.error('PTT search table too small.');
    return fail();
  }

  for (i = 0; i < vts_ptt_srpt.nr_of_srpts; i++) {
    /* assert(vts_ptt_srpt.ttu_offset[i] + ifoTypes.PTT_INFO_SIZE <= vts_ptt_srpt.last_byte + 1);
     Magic Knight Rayearth Daybreak is mastered very strange and has
     Titles with 0 PTTs. They all have a vts_ptt_srpt.ttu_offset[i] offsets beyond the end of
     of the vts_ptt_srpt structure. */
    CHECK_VALUE(vts_ptt_srpt.ttu_offset[i] + ifoTypes.PTT_INFO_SIZE <= vts_ptt_srpt.last_byte + 1 + 4);

    if (i < vts_ptt_srpt.nr_of_srpts - 1) {
      n = vts_ptt_srpt.ttu_offset[i + 1] - vts_ptt_srpt.ttu_offset[i];
    } else {
      n = vts_ptt_srpt.last_byte + 1 - vts_ptt_srpt.ttu_offset[i];
    }

    /* assert(n > 0 && (n % 4) == 0);
     Magic Knight Rayearth Daybreak is mastered very strange and has
     Titles with 0 PTTs. */
    if (n < 0) {
      n = 0;
    }

    CHECK_VALUE(n % 4 == 0);

    vts_ptt_srpt.title[i] = new BinaryParser(ifofile.file.view, ifoTypes.ttu_t()).parse('main');

    console.log('vts_ptt_srpt.title[i].nr_of_ptts', vts_ptt_srpt.title[i].nr_of_ptts, n / 4);
    vts_ptt_srpt.title[i].nr_of_ptts = n / 4;
    if (!vts_ptt_srpt.title[i].ptt) {
      vts_ptt_srpt.title[i].ptt = Array(vts_ptt_srpt.title[i].nr_of_ptts);
    }
    for (j = 0; j < vts_ptt_srpt.title[i].nr_of_ptts; j++) {
      if (!vts_ptt_srpt.title[i].ptt[j]) {
        // @todo Fixme: This is just a quick fix.
        vts_ptt_srpt.title[i].ptt[j] = ifoTypes.ptt_info_t().main;
        vts_ptt_srpt.title[i].ptt[j].pgcn = 1;
        vts_ptt_srpt.title[i].ptt[j].pgn = 1;
      }
      CHECK_VALUE(vts_ptt_srpt.ttu_offset[i] + ifoTypes.PTT_INFO_SIZE <= vts_ptt_srpt.last_byte + 1);
      //vts_ptt_srpt.title[i].ptt[j] = ifoTypes.ptt_info_t().main;

      // The assert placed here because of Magic Knight Rayearth Daybreak
      CHECK_VALUE(vts_ptt_srpt.ttu_offset[i] + ifoTypes.PTT_INFO_SIZE <= vts_ptt_srpt.last_byte + 1);
      //vts_ptt_srpt.title[i].ptt[j] = ifoTypes.ptt_info_t().main;
      // @todo Fixme: The following lines should be ported properly.
      //vts_ptt_srpt.title[i].ptt[j].pgcn = (vts_ptt_srpt.ttu_offset[i] + 4 * j - ifoTypes.VTS_PTT_SRPT_SIZE);
      //vts_ptt_srpt.title[i].ptt[j].pgn = (vts_ptt_srpt.ttu_offset[i] + 4 * j + 2 - ifoTypes.VTS_PTT_SRPT_SIZE);
    }

    /*console.log(vts_ptt_srpt);
     CHECK_VALUE(vts_ptt_srpt.title[i].nr_of_ptts < 1000); // ??
     for (j = 0; j < vts_ptt_srpt.title[i].nr_of_ptts; j++) {
     CHECK_VALUE(vts_ptt_srpt.title[i].ptt[j].pgcn != 0);
     CHECK_VALUE(vts_ptt_srpt.title[i].ptt[j].pgcn < 1000); // ??
     CHECK_VALUE(vts_ptt_srpt.title[i].ptt[j].pgn != 0);
     CHECK_VALUE(vts_ptt_srpt.title[i].ptt[j].pgn < 100); // ??
     }*/
  }

  ifofile.vts_ptt_srpt = vts_ptt_srpt;
  return ifofile;

  function fail() {
    ifofile.vts_ptt_srpt = null;
    return ifofile;
  }
}


/**
 * Read in the Parental Management Information table, filling the
 * ifofile.ptl_mait structure and its substructures. This data is only
 * located in the video manager information file. This fills the
 * ifofile.ptl_mait structure and all its substructures.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_PTL_MAIT(ifofile) {
  if (!ifofile || !ifofile.vmgi_mat)
    return null;

  if (ifofile.vmgi_mat.ptl_mait == 0) {
    ifofile.ptl_mait = null;
    return ifofile;
  }

  ifofile.file.view.seek(ifofile.vmgi_mat.ptl_mait * DVD_BLOCK_LEN);

  //try {
  var i, j;
  var pf_temp;
  var level, vts;
  var ptl_mait = new BinaryParser(ifofile.file.view, ifoTypes.ptl_mait_t()).parse('main');
  /*} catch (e) {
   ifofile.ptl_mait = null;
   return ifofile;
   }*/

  CHECK_VALUE(ptl_mait.nr_of_countries != 0);
  CHECK_VALUE(ptl_mait.nr_of_countries < 100); // ??
  CHECK_VALUE(ptl_mait.nr_of_vtss != 0);
  CHECK_VALUE(ptl_mait.nr_of_vtss < 100); // ??
  CHECK_VALUE(ptl_mait.nr_of_countries * ifoTypes.PTL_MAIT_COUNTRY_SIZE
    <= ptl_mait.last_byte + 1 - ifoTypes.PTL_MAIT_SIZE);

  for (i = 0; i < ptl_mait.nr_of_countries; i++) {
    CHECK_ZERO(ptl_mait.countries[i].zero_1);
    CHECK_ZERO(ptl_mait.countries[i].zero_2);
    CHECK_VALUE(ptl_mait.countries[i].pf_ptl_mai_start_byte
      + ifoTypes.PF_LEVEL_SIZE * (ptl_mait.nr_of_vtss + 1) <= ptl_mait.last_byte + 1);
  }

  for (i = 0; i < ptl_mait.nr_of_countries; i++) {
    pf_temp = [];

    ifofile.file.view.seek(ifofile.vmgi_mat.ptl_mait * DVD_BLOCK_LEN +
      ptl_mait.countries[i].pf_ptl_mai_start_byte);

    for (j = 0; j < ((ptl_mait.nr_of_vtss + 1) * 8); j++) {
      pf_temp[j] = ifofile.file.view.getUint16();
    }

    // Transpose the array so we can use C indexing.
    for (level = 0; level < 8; level++) {
      for (vts = 0; vts <= ptl_mait.nr_of_vtss; vts++) {
        ptl_mait.countries[i].pf_ptl_mai[vts][level] =
          pf_temp[(7 - level) * (ptl_mait.nr_of_vtss + 1) + vts];
      }
    }

    // \@todo Check if code below is equivalent to the 2 for loops above.
    /*for (j = 0; j < ptl_mait.nr_of_vtss; j++) {
     pf_temp[j] = new BinaryParser(ifofile.file.view, ifoTypes.pf_level_t()).parse('main');
     }
     ptl_mait.countries[i].pf_ptl_mai = pf_temp;*/
  }

  ifofile.ptl_mait = ptl_mait;
  return ifofile;
}


/**
 * Reads in the VTS Time Map Table, this data is only located in the video
 * title set information file. This fills the ifofile.vts_tmapt structure
 * and all its substructures. When pressent enables VOBU level time-based
 * seeking for One_Sequential_PGC_Titles.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
function ifoRead_VTS_TMAPT(ifofile) {
  if (!ifofile || !ifofile.vtsi_mat)
    return null;

  if (ifofile.vtsi_mat.vts_tmapt == 0) { // optional(?)
    console.error('Please send bug report - no VTS_TMAPT ??');
    ifofile.vts_tmapt = null;
    return ifofile;
  }

  ifofile.file.view.seek(ifofile.vtsi_mat.vts_tmapt * DVD_BLOCK_LEN);

  //
  var i, j;
  var vts_tmapt = new BinaryParser(ifofile.file.view, ifoTypes.vts_tmapt_t()).parse('main');
  /*} catch (e) {
   ifofile.vts_tmapt = null;
   return ifofile;
   }*/

  CHECK_ZERO(vts_tmapt.zero_1);

  vts_tmapt.tmap = ifoTypes.vts_tmap_t();
  if (!vts_tmapt.tmap) {
    ifofile.vts_tmapt = null;
    return null;
  }

  for (i = 0; i < vts_tmapt.nr_of_tmaps; i++) {
    ifofile.file.view.seek(ifofile.vtsi_mat.vts_tmapt * DVD_BLOCK_LEN +
      vts_tmapt.tmap_offset[i]);

    //try {
    vts_tmapt.tmap[i] = new BinaryParser(ifofile.file.view, ifoTypes.vts_tmap_t()).parse('main');
    /*} catch (e) {
     continue;
     }*/

    CHECK_ZERO(vts_tmapt.tmap[i].zero_1);

    if (vts_tmapt.tmap[i].nr_of_entries == 0) { // Early out if zero entries
      vts_tmapt.tmap[i].map_ent = null;
    }
  }

  ifofile.vts_tmapt = vts_tmapt;
  return ifofile;
}


/**
 * Reads in the cell address table for the video title set corresponding to
 * this IFO file. This data is only located in the video title set information
 * file. This structure is mandatory, and must be included in the VTSI file.
 * This call fills the ifofile.vts_c_adt structure and its substructures.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
function ifoRead_TITLE_C_ADT(ifofile) {
  if (!ifofile || !ifofile.vtsi_mat)
    return null;

  if (ifofile.vtsi_mat.vts_c_adt == 0) // mandatory
    return null;

  ifofile.vts_c_adt = ifoRead_C_ADT_internal(ifofile,
    ifofile.vtsi_mat.vts_c_adt);

  return ifofile;
}


/**
 * Reads in the cell address table for the menu VOB. For the video manager,
 * this corresponds to the VIDEO_TS.VOB file, and for each title set, this
 * corresponds to the VTS_XX_0.VOB file. This data is located in both the
 * video manager and video title set information files. For VMGI files, this
 * fills the ifofile.vmgm_c_adt structure and all its substructures. For VTSI
 * files, this fills the ifofile.vtsm_c_adt structure.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
function ifoRead_C_ADT(ifofile) {
  var sector;

  if (!ifofile)
    return null;

  if (ifofile.vmgi_mat) {
    if (ifofile.vmgi_mat.vmgm_c_adt == 0)
      return ifofile;
    sector = ifofile.vmgi_mat.vmgm_c_adt;
  } else if (ifofile.vtsi_mat) {
    if (ifofile.vtsi_mat.vtsm_c_adt == 0)
      return ifofile;
    sector = ifofile.vtsi_mat.vtsm_c_adt;
  } else {
    return ifofile;
  }

  ifofile.menu_c_adt = ifoRead_C_ADT_internal(ifofile, sector);

  return ifofile;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} sector
 * @return {?c_adt_t}
 */
function ifoRead_C_ADT_internal(ifofile, sector) {
  ifofile.file.view.seek(sector * DVD_BLOCK_LEN);

  //try {
  var i, info_length;
  var c_adt = new BinaryParser(ifofile.file.view, ifoTypes.c_adt_t()).parse('main');
  /*} catch (e) {
   return null;
   }*/

  info_length = c_adt.last_byte + 1 - ifoTypes.C_ADT_SIZE;

  CHECK_ZERO(c_adt.zero_1);
  /* assert(c_adt.nr_of_vobs > 0);
   Magic Knight Rayearth Daybreak is mastered very strange and has
   Titles with a VOBS that has no cells. */
  CHECK_VALUE(info_length % ifoTypes.CELL_ADR_SIZE == 0);

  /* assert(info_length / ifoTypes.CELL_ADR_SIZE >= c_adt.nr_of_vobs);
   Enemy of the State region 2 (de) has Titles where nr_of_vobs field
   is to high, they high ones are never referenced though. */
  if (info_length / ifoTypes.CELL_ADR_SIZE < c_adt.nr_of_vobs) {
    console.error('C_ADT nr_of_vobs > available info entries');
    c_adt.nr_of_vobs = info_length / ifoTypes.CELL_ADR_SIZE;
  }

  for (i = 0; i < info_length / ifoTypes.CELL_ADR_SIZE; i++) {
    CHECK_ZERO(c_adt.cell_adr_table[i].zero_1);
    CHECK_VALUE(c_adt.cell_adr_table[i].vob_id > 0);
    CHECK_VALUE(c_adt.cell_adr_table[i].vob_id <= c_adt.nr_of_vobs);
    CHECK_VALUE(c_adt.cell_adr_table[i].cell_id > 0);
    CHECK_VALUE(c_adt.cell_adr_table[i].start_sector <
      c_adt.cell_adr_table[i].last_sector);
  }

  return c_adt;
}


/**
 * Reads in the VOBU address map for the associated video title set. This data
 * is only located in the video title set information file. This structure is
 * mandatory, and must be included in the VTSI file. Fills the
 * ifofile.vts_vobu_admap structure and its substructures.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_TITLE_VOBU_ADMAP(ifofile) {
  if (!ifofile || !ifofile.vtsi_mat)
    return null;

  if (ifofile.vtsi_mat.vts_vobu_admap == 0) // mandatory
    return null;

  ifofile.vts_vobu_admap = ifoRead_VOBU_ADMAP_internal(ifofile,
    ifofile.vtsi_mat.vts_vobu_admap);

  return ifofile;
}


/**
 * Reads in the VOBU address map for the menu VOB. For the video manager, this
 * corresponds to the VIDEO_TS.VOB file, and for each title set, this
 * corresponds to the VTS_XX_0.VOB file. This data is located in both the
 * video manager and video title set information files. For VMGI files, this
 * fills the ifofile.vmgm_vobu_admap structure and all its substructures. For
 * VTSI files, this fills the ifofile.vtsm_vobu_admap structure.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_VOBU_ADMAP(ifofile) {
  var sector;

  if (!ifofile)
    return null;

  if (ifofile.vmgi_mat) {
    if (ifofile.vmgi_mat.vmgm_vobu_admap == 0)
      return ifofile;
    sector = ifofile.vmgi_mat.vmgm_vobu_admap;
  } else if (ifofile.vtsi_mat) {
    if (ifofile.vtsi_mat.vtsm_vobu_admap == 0)
      return ifofile;
    sector = ifofile.vtsi_mat.vtsm_vobu_admap;
  } else {
    return null;
  }

  ifofile.menu_vobu_admap = ifoRead_VOBU_ADMAP_internal(ifofile, sector);

  return ifofile;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} sector
 * @return {?vobu_admap_t}
 */
function ifoRead_VOBU_ADMAP_internal(ifofile, sector) {
  ifofile.file.view.seek(sector * DVD_BLOCK_LEN);

  //try {
  var info_length;
  var vobu_admap = new BinaryParser(ifofile.file.view, ifoTypes.vobu_admap_t()).parse('main');
  /*} catch (e) {
   return null;
   }*/

  info_length = vobu_admap.last_byte + 1 - ifoTypes.VOBU_ADMAP_SIZE;
  /* assert(info_length > 0);
   Magic Knight Rayearth Daybreak is mastered very strange and has
   Titles with a VOBS that has no VOBUs. */
  //CHECK_VALUE(info_length % UINT32_SIZE == 0);

  return vobu_admap;
}


/**
 * Reads in the program chain information table for the video title set. Fills
 * in the ifofile.vts_pgcit structure and its substructures, which includes
 * the data for each program chain in the set. This data is only located in
 * the video title set information file. This structure is mandatory, and must
 * be included in the VTSI file.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_PGCIT(ifofile) {
  if (!ifofile || !ifofile.vtsi_mat)
    return null;

  if (ifofile.vtsi_mat.vts_pgcit == null) // mandatory
    return null;

  ifofile.vts_pgcit = ifoRead_PGCIT_internal(ifofile,
    ifofile.vtsi_mat.vts_pgcit * DVD_BLOCK_LEN);

  return ifofile;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} offset
 * @return {?pgcit_t}
 */
function ifoRead_PGCIT_internal(ifofile, offset) {
  ifofile.file.view.seek(offset);

  //try {
  var i;
  var pgcit = new BinaryParser(ifofile.file.view, ifoTypes.pgcit_t()).parse('main');
  /*} catch (e) {
   return null;
   }*/

  CHECK_ZERO(pgcit.zero_1);
  /* assert(pgcit.nr_of_pgci_srp != 0);
   Magic Knight Rayearth Daybreak is mastered very strange and has
   Titles with 0 PTTs. */
  CHECK_VALUE(pgcit.nr_of_pgci_srp < 10000); // ?? seen max of 1338

  for (i = 0; i < pgcit.nr_of_pgci_srp; i++) {
    CHECK_VALUE(pgcit.pgci_srp[i].unknown1 == 0);
  }

  for (i = 0; i < pgcit.nr_of_pgci_srp; i++)
    CHECK_VALUE(pgcit.pgci_srp[i].pgc_start_byte + ifoTypes.PGC_SIZE <= pgcit.last_byte + 1);

  for (i = 0; i < pgcit.nr_of_pgci_srp; i++) {
    pgcit.pgci_srp[i].pgc = ifoRead_PGC(ifofile,
      offset + pgcit.pgci_srp[i].pgc_start_byte);
  }

  return pgcit;
}


/**
 * Reads in the menu PGCI unit table for the menu VOB. For the video manager,
 * this corresponds to the VIDEO_TS.VOB file, and for each title set, this
 * corresponds to the VTS_XX_0.VOB file. This data is located in both the
 * video manager and video title set information files. For VMGI files, this
 * fills the ifofile.vmgi_pgci_ut structure and all its substructures. For
 * VTSI files, this fills the ifofile.vtsm_pgci_ut structure.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_PGCI_UT(ifofile) {
  if (!ifofile)
    return null;

  var sector;

  if (ifofile.vmgi_mat) {
    if (ifofile.vmgi_mat.vmgm_pgci_ut == 0)
      return ifofile;
    sector = ifofile.vmgi_mat.vmgm_pgci_ut;
  } else if (ifofile.vtsi_mat) {
    if (ifofile.vtsi_mat.vtsm_pgci_ut == 0)
      return ifofile;
    sector = ifofile.vtsi_mat.vtsm_pgci_ut;
  } else {
    ifofile.pgci_ut = null;
    return ifofile;
  }

  ifofile.file.view.seek(sector * DVD_BLOCK_LEN);

  //try {
  var i;
  var pgci_ut = new BinaryParser(ifofile.file.view, ifoTypes.pgci_ut_t()).parse('main');
  /*} catch (e) {
   ifofile.pgci_ut = null;
   return ifofile;
   }*/

  CHECK_ZERO(pgci_ut.zero_1);
  CHECK_VALUE(pgci_ut.nr_of_lus != 0);
  CHECK_VALUE(pgci_ut.nr_of_lus < 100); // ?? 3-4 ?
  CHECK_VALUE(pgci_ut.nr_of_lus * ifoTypes.PGCI_LU_SIZE < pgci_ut.last_byte);

  for (i = 0; i < pgci_ut.nr_of_lus; i++) {
    // Maybe this is only defined for v1.1 and later titles?
    /* If the bits in 'lu[i].exists' are enumerated abcd efgh then:
     VTS_x_yy.IFO        VIDEO_TS.IFO
     a == 0x83 "Root"         0x82 "Title"
     b == 0x84 "Subpicture"
     c == 0x85 "Audio"
     d == 0x86 "Angle"
     e == 0x87 "PTT"
     */
    CHECK_VALUE((pgci_ut.lu[i].exists & 0x07) == 0);
  }

  for (i = 0; i < pgci_ut.nr_of_lus; i++) {
    pgci_ut.lu[i].pgcit = ifoRead_PGCIT_internal(ifofile,
      sector * DVD_BLOCK_LEN + pgci_ut.lu[i].lang_start_byte);
    if (pgci_ut.lu[i].pgcit == null) {
      ifofile.pgci_ut = null;
      return ifofile;
    }
    // FIXME: Iterate and verify that all menus that should exist accordingly
    // to pgci_ut.lu[i].exists really do?
  }

  ifofile.pgci_ut = pgci_ut;
  return ifofile;
}


/**
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @param {number} offset
 * @return {?vts_attributes_t}
 */
function ifoRead_VTS_ATTRIBUTES(ifofile, offset) {
  ifofile.file.view.seek(offset);

  //try {
  var i, nr_coded;
  var vts_attributes = new BinaryParser(ifofile.file.view, ifoTypes.vts_attributes_t()).parse('main');
  /*} catch (e) {
   return null;
   }*/

  CHECK_ZERO(vts_attributes.zero_1);
  CHECK_ZERO(vts_attributes.zero_2);
  CHECK_ZERO(vts_attributes.zero_3);
  CHECK_ZERO(vts_attributes.zero_4);
  CHECK_ZERO(vts_attributes.zero_5);
  CHECK_ZERO(vts_attributes.zero_6);
  CHECK_ZERO(vts_attributes.zero_7);
  CHECK_VALUE(vts_attributes.nr_of_vtsm_audio_streams <= 1);
  CHECK_VALUE(vts_attributes.nr_of_vtsm_subp_streams <= 1);
  CHECK_VALUE(vts_attributes.nr_of_vtstt_audio_streams <= 8);
  for (i = vts_attributes.nr_of_vtstt_audio_streams; i < 8; i++)
    CHECK_ZERO(vts_attributes.vtstt_audio_attr[i]);
  CHECK_VALUE(vts_attributes.nr_of_vtstt_subp_streams <= 32);

  CHECK_VALUE(vts_attributes.last_byte + 1 >= ifoTypes.VTS_ATTRIBUTES_MIN_SIZE);
  nr_coded = (vts_attributes.last_byte + 1 - ifoTypes.VTS_ATTRIBUTES_MIN_SIZE) / 6;
  // This is often nr_coded = 70, how do you know how many there really are?
  if (nr_coded > 32) { // We haven't read more from disk/file anyway
    nr_coded = 32;
  }
  CHECK_VALUE(vts_attributes.nr_of_vtstt_subp_streams <= nr_coded);
  for (i = vts_attributes.nr_of_vtstt_subp_streams; i < nr_coded; i++)
    CHECK_ZERO(vts_attributes.vtstt_subp_attr[i]);

  return vts_attributes;
}


/**
 * Read in the attribute table for the main menu vob, filling the
 * ifofile.vts_atrt structure and its substructures. Only located in the
 * video manager information file. This fills in the ifofile.vts_atrt
 * structure and all its substructures.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
export function ifoRead_VTS_ATRT(ifofile) {
  if (!ifofile || !ifofile.vmgi_mat || ifofile.vmgi_mat.vts_atrt == 0) // mandatory
    return null;

  ifofile.file.view.seek(ifofile.vmgi_mat.vts_atrt * DVD_BLOCK_LEN);

  //try {
  var i;
  var vts_atrt = new BinaryParser(ifofile.file.view, ifoTypes.vts_atrt_t()).parse('main');
  var offset;
  /*} catch (e) {
   ifofile.vts_atrt = null;
   return ifofile;
   }*/

  CHECK_ZERO(vts_atrt.zero_1);
  CHECK_VALUE(vts_atrt.nr_of_vtss != 0);
  CHECK_VALUE(vts_atrt.nr_of_vtss < 100); // ??
  CHECK_VALUE(vts_atrt.nr_of_vtss * (4 + ifoTypes.VTS_ATTRIBUTES_MIN_SIZE) +
    ifoTypes.VTS_ATRT_SIZE < vts_atrt.last_byte + 1);

  for (i = 0; i < vts_atrt.nr_of_vtss; i++) {
    CHECK_VALUE(vts_atrt.vts_atrt_offsets[i] + ifoTypes.VTS_ATTRIBUTES_MIN_SIZE <
      vts_atrt.last_byte + 1);
  }

  for (i = 0; i < vts_atrt.nr_of_vtss; i++) {
    offset = vts_atrt.vts_atrt_offsets[i];
    vts_atrt.vts[i] = ifoRead_VTS_ATTRIBUTES(ifofile,
      (ifofile.vmgi_mat.vts_atrt * DVD_BLOCK_LEN) + offset);
    if (!vts_atrt.vts[i]) {
      return null;
    }

    // This assert can't be in ifoRead_VTS_ATTRIBUTES.
    CHECK_VALUE(offset + vts_atrt.vts[i].last_byte <= vts_atrt.last_byte + 1);
    // Is this check correct?
  }

  ifofile.vts_atrt = vts_atrt;
  return ifofile;
}


/**
 * Reads in the text data strings for the DVD. Fills the ifofile.txtdt_mgi
 * structure and all its substructures. This data is only located in the video
 * manager information file. This structure is mandatory, and must be included
 * in the VMGI file.
 *
 * @param {ifo_handle_t} ifofile (passed as reference).
 * @return {?ifo_handle_t}
 */
function ifoRead_TXTDT_MGI(ifofile) {
  if (!ifofile || !ifofile.vmgi_mat)
    return null;

  if (ifofile.vmgi_mat.txtdt_mgi == 0) {
    ifofile.txtdt_mgi = null;
    return ifofile;
  }

  ifofile.file.view.seek(ifofile.vmgi_mat.txtdt_mgi * DVD_BLOCK_LEN);

  //try {
  var i;
  var txtdt_mgi = new BinaryParser(ifofile.file.view, ifoTypes.txtdt_mgi_t()).parse('main');
  /*} catch (e) {
   ifofile.vmgi_mat = null;
   return ifofile;
   }*/

  // printf('-- Not done yet --');

  ifofile.txtdt_mgi = txtdt_mgi;
  return ifofile;
}
