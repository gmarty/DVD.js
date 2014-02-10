'use strict';


import ifoTypes = require('../dvdread/ifo_types');

var dvd_time_t = ifoTypes.dvd_time_t;
var vm_cmd_t = ifoTypes.vm_cmd_t;
var user_ops_t = ifoTypes.user_ops_t;

/**
 * PCI General Information
 */
function pci_gi_t() {
  return {
    nv_pck_lbn: 'uint32', // sector address of this nav pack
    vobu_cat: 'uint16', // category of vobu
    zero1: 'uint16', // reserved
    vobu_uop_ctl: 'user_ops_t', // UOP of vobu
    vobu_s_ptm: 'uint32', // start presentation time of vobu
    vobu_e_ptm: 'uint32', // end presentation time of vobu
    vobu_se_e_ptm: 'uint32', // end ptm of sequence end in vobu
    e_eltm: 'dvd_time_t', // Cell elapsed time
    vobu_isrc: ['array', 'uint8', 32]
  };
}
/**
 * Non Seamless Angle Information
 */
function nsml_agli_t() {
  return {
    nsml_agl_dsta: ['array', 'uint32', 9]  // address of destination vobu in AGL_C#n
  };
}

/**
 * Highlight General Information
 *
 * For btngrX_dsp_ty the bits have the following meaning:
 * 000b: normal 4/3 only buttons
 * XX1b: wide (16/9) buttons
 * X1Xb: letterbox buttons
 * 1XXb: pan&scan buttons
 */
function hl_gi_t() {
  return {
    hli_ss: 'uint16', // status, only low 2 bits 0: no buttons, 1: different 2: equal 3: eual except for button cmds
    hli_s_ptm: 'uint32', // start ptm of hli
    hli_e_ptm: 'uint32', // end ptm of hli
    btn_se_e_ptm: 'uint32', // end ptm of button select
    zero1: ['bits', 2], // reserved
    btngr_ns: ['bits', 2], // number of button groups 1, 2 or 3 with 36/18/12 buttons
    zero2: ['bits', 1], // reserved
    btngr1_dsp_ty: ['bits', 3], // display type of subpic stream for button group 1
    zero3: ['bits', 1], // reserved
    btngr2_dsp_ty: ['bits', 3], // display type of subpic stream for button group 2
    zero4: ['bits', 1], // reserved
    btngr3_dsp_ty: ['bits', 3], // display type of subpic stream for button group 3
    btn_ofn: 'uint8', // button offset number range 0-255
    btn_ns: 'uint8', // number of valid buttons  <= 36/18/12 (low 6 bits)
    nsl_btn_ns: 'uint8', // number of buttons selectable by U_BTNNi (low 6 bits)   nsl_btn_ns <= btn_ns
    zero5: 'uint8', // reserved
    fosl_btnn: 'uint8', // forcedly selected button  (low 6 bits)
    foac_btnn: 'uint8'   // forcedly activated button (low 6 bits)
  };
}


/**
 * Button Color Information Table
 * Each entry beeing a 32bit word that contains the color indexs and alpha
 * values to use.  They are all represented by 4 bit number and stored
 * like this [Ci3, Ci2, Ci1, Ci0, A3, A2, A1, A0].   The actual palette
 * that the indexes reference is in the PGC.
 * @TODO split the uint32 into a struct
 */
function btn_colit_t() {
  return {
    // @todo Fixme and check if equivalent to original.
    btn_coli: ['array', 'uint32', 6]//[3][2];  // [button color number-1][select:0/action:1]
  };
}

/**
 * Button Information
 *
 * NOTE: I've had to change the structure from the disk layout to get
 * the packing to work with Sun's Forte C compiler.
 * The 4 and 7 bytes are 'rotated' was: ABC DEF GHIJ  is: ABCG DEFH IJ
 */
function btni_t() {
  return {
    btn_coln: ['bits', 2], // button color number
    x_start: ['bits', 10], // x start offset within the overlay
    zero1: ['bits', 2],    // reserved
    x_end: ['bits', 10],   // x end offset within the overlay

    auto_action_mode: ['bits', 2],  // 0: no, 1: activated if selected
    y_start: ['bits', 10], // y start offset within the overlay
    zero2: ['bits', 2],    // reserved
    y_end: ['bits', 10],   // y end offset within the overlay

    zero3: ['bits', 2], // reserved
    up: ['bits', 6],    // button index when pressing up
    zero4: ['bits', 2], // reserved
    down: ['bits', 6],  // button index when pressing down
    zero5: ['bits', 2], // reserved
    left: ['bits', 6],  // button index when pressing left
    zero6: ['bits', 2], // reserved
    right: ['bits', 6], // button index when pressing right
    cmd: 'vm_cmd_t'
  };
}

/**
 * Highlight Information
 */
function hli_t() {
  return {
    hl_gi: 'hl_gi_t',
    btn_colit: 'btn_colit_t',
    btnit: ['array', 'btni_t', 36]
  };
}


/**
 * PCI packet
 */
export function pci_t() {
  return {
    'pci_gi_t': pci_gi_t(),
    'nsml_agli_t': nsml_agli_t(),
    'hli_t': hli_t(),

    'hl_gi_t': hl_gi_t(),
    'btn_colit_t': btn_colit_t(),
    'btni_t': btni_t(),

    'dvd_time_t': dvd_time_t(),
    'vm_cmd_t': vm_cmd_t(),
    'user_ops_t': user_ops_t(),
    'main': {
      pci_gi: 'pci_gi_t',
      nsml_agli: 'nsml_agli_t',
      hli: 'hli_t',
      zero1: ['array', 'uint8', 189]
    }
  };
}


/**
 * DSI General Information
 */
function dsi_gi_t() {
  return {
    nv_pck_scr: 'uint32',
    nv_pck_lbn: 'uint32',      // sector address of this nav pack
    vobu_ea: 'uint32',         // end address of this VOBU
    vobu_1stref_ea: 'uint32',  // end address of the 1st reference image
    vobu_2ndref_ea: 'uint32',  // end address of the 2nd reference image
    vobu_3rdref_ea: 'uint32',  // end address of the 3rd reference image
    vobu_vob_idn: 'uint16',    // VOB Id number that this VOBU is part of
    zero1: 'uint8',            // reserved
    vobu_c_idn: 'uint8',       // Cell Id number that this VOBU is part of
    c_eltm: 'dvd_time_t'       // Cell elapsed time
  };
}

function vob_a_t() {
  return {
    stp_ptm1: 'uint32',
    stp_ptm2: 'uint32',
    gap_len1: 'uint32',
    gap_len2: 'uint32'
  }
}

/**
 * Seamless Playback Information
 */
function sml_pbi_t() {
  return {
    category: 'uint16',       // 'category' of seamless VOBU
    ilvu_ea: 'uint32',        // end address of interleaved Unit
    ilvu_sa: 'uint32',        // start address of next interleaved unit
    size: 'uint16',           // size of next interleaved unit
    vob_v_s_s_ptm: 'uint32',  // video start ptm in vob
    vob_v_e_e_ptm: 'uint32',  // video end ptm in vob
    vob_a: ['array', 'vob_a_t', 8]
  };
}

/**
 * Seamless Angle Information for one angle
 */
function sml_agl_data_t() {
  return {
    address: 'uint32', // offset to next ILVU, high bit is before/after
    size: 'uint16'     // byte size of the ILVU pointed to by address
  };
}

/**
 * Seamless Angle Information
 */
function sml_agli_t() {
  return {
    data: ['array', 'sml_agl_data_t', 9]
  };
}

/**
 * VOBU Search Information
 */
function vobu_sri_t() {
  return {
    next_video: 'uint32', // Next vobu that contains video
    fwda: ['array', 'uint32', 19], // Forwards, time
    next_vobu: 'uint32',
    prev_vobu: 'uint32',
    bwda: ['array', 'uint32', 19], // Backwards, time
    prev_video: 'uint32'
  };
}

/** @const */ var SRI_END_OF_CELL = 0x3FFFFFFF;

/**
 * Synchronous Information
 */
function synci_t() {
  return {
    a_synca: ['array', 'uint16', 8],  // offset to first audio packet for this VOBU
    sp_synca: ['array', 'uint32', 32] // offset to first subpicture packet
  };
}

/**
 * DSI packet
 */
export function dsi_t() {
  return {
    'dsi_gi_t': dsi_gi_t(),
    'sml_pbi_t': sml_pbi_t(),
    'vob_a_t': vob_a_t(),
    'sml_agli_t': sml_agli_t(),
    'sml_agl_data_t': sml_agl_data_t(),
    'vobu_sri_t': vobu_sri_t(),
    'synci_t': synci_t(),
    'main': {
      dsi_gi: 'dsi_gi_t',
      sml_pbi: 'sml_pbi_t',
      sml_agli: 'sml_agli_t',
      vobu_sri: 'vobu_sri_t',
      synci: 'synci_t',
      zero1: ['array', 'uint8', 471]
    }
  };
}
