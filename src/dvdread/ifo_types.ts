'use strict';

/** @const */ export var UINT32_SIZE = 4;
/** @const */ export var VOBU_ADMAP_SIZE = 4;

/**
 * Common
 *
 * The following structures are used in both the VMGI and VTSI.
 */


/**
 * DVD Time Information.
 * Exported for dvdread/nav_types.ts.
 */
export function dvd_time_t() {
  return {
    hour: 'uint8',
    minute: 'uint8',
    second: 'uint8',
    frame_u: 'uint8' // The two high bits are the frame rate.
  };
}


/**
 * Type to store per-command data.
 * Exported for dvdread/nav_types.ts.
 */
export function vm_cmd_t() {
  return {
    bytes: ['array', 'uint8', 8]
  };
}


/**
 * Video Attributes.
 */
function video_attr_t() {
  return {
    // Big endian
    mpeg_version: ['bits', 2],
    video_format: ['bits', 2],
    display_aspect_ratio: ['bits', 2],
    permitted_df: ['bits', 2],

    line21_cc_1: ['bits', 1],
    line21_cc_2: ['bits', 1],
    unknown1: ['bits', 1],
    bit_rate: ['bits', 1],

    picture_size: ['bits', 2],
    letterboxed: ['bits', 1],
    film_mode: ['bits', 1]
    /*
     // Little endian
     permitted_df: ['bits', 2],
     display_aspect_ratio: ['bits', 2],
     video_format: ['bits', 2],
     mpeg_version: ['bits', 2],

     film_mode: ['bits', 1],
     letterboxed: ['bits', 1],
     picture_size: ['bits', 2],

     bit_rate: ['bits', 1],
     unknown1: ['bits', 1],
     line21_cc_2: ['bits', 1],
     line21_cc_1: ['bits', 1]
     */
  };
}

/**
 * Audio Attributes.
 */
function audio_attr_t() {
  return {
    // Big endian
    audio_format: ['bits', 3],
    multichannel_extension: ['bits', 1],
    lang_type: ['bits', 2],
    application_mode: ['bits', 2],

    quantization: ['bits', 2],
    sample_frequency: ['bits', 2],
    unknown1: ['bits', 1],
    channels: ['bits', 3],
    /*
     // Little endian
     application_mode       : 2,
     lang_type              : 2,
     multichannel_extension : 1,
     audio_format           : 3,

     channels               : 3,
     unknown1               : 1,
     sample_frequency       : 2,
     quantization           : 2,
     */
    lang_code: 'uint16',
    lang_extension: 'uint8',
    code_extension: 'uint8',
    unknown3: 'uint8',
    app_info: {
      karaoke: {
        // Big endian
        unknown4: ['bits', 1],
        channel_assignment: ['bits', 3],
        version: ['bits', 2],
        mc_intro: ['bits', 1], // probably     0: true, 1: false
        mode: ['bits', 1]      // Karaoke mode 0: solo, 1: duet
        /*
         // Little endian
         mode               : 1,
         mc_intro           : 1,
         version            : 2,
         channel_assignment : 3,
         unknown4           : 1
         */
      },
      surround: {
        // Big endian
        unknown5: ['bits', 4],
        dolby_encoded: ['bits', 1], // suitable for surround decoding
        unknown6: ['bits', 3]
        /*
         // Little endian
         unknown6           : 3,
         dolby_encoded      : 1,
         unknown5           : 4
         */
      }
    }
  };
}


/**
 * MultiChannel Extension
 */
function multichannel_ext_t() {
  return {
    // Big endian
    zero1: ['bits', 7],
    ach0_gme: ['bits', 1],

    zero2: ['bits', 7],
    ach1_gme: ['bits', 1],

    zero3: ['bits', 4],
    ach2_gv1e: ['bits', 1],
    ach2_gv2e: ['bits', 1],
    ach2_gm1e: ['bits', 1],
    ach2_gm2e: ['bits', 1],

    zero4: ['bits', 4],
    ach3_gv1e: ['bits', 1],
    ach3_gv2e: ['bits', 1],
    ach3_gmAe: ['bits', 1],
    ach3_se2e: ['bits', 1],

    zero5: ['bits', 4],
    ach4_gv1e: ['bits', 1],
    ach4_gv2e: ['bits', 1],
    ach4_gmBe: ['bits', 1],
    ach4_seBe: ['bits', 1],
    /*
     // Little endian
     ach0_gme   : 1,
     zero1      : 7,

     ach1_gme   : 1,
     zero2      : 7,

     ach2_gm2e  : 1,
     ach2_gm1e  : 1,
     ach2_gv2e  : 1,
     ach2_gv1e  : 1,
     zero3      : 4,

     ach3_se2e  : 1,
     ach3_gmAe  : 1,
     ach3_gv2e  : 1,
     ach3_gv1e  : 1,
     zero4      : 4,

     ach4_seBe  : 1,
     ach4_gmBe  : 1,
     ach4_gv2e  : 1,
     ach4_gv1e  : 1,
     zero5      : 4,
     */
    zero6: ['array', 'uint8', 19]
  };
}


/**
 * Subpicture Attributes.
 */
function subp_attr_t() {
  return {
    /*
     * type: 0 not specified
     *       1 language
     *       2 other
     * coding mode: 0 run length
     *              1 extended
     *              2 other
     * language: indicates language if type == 1
     * lang extension: if type == 1 contains the lang extension
     */
    // Big endian
    code_mode: ['bits', 3],
    zero1: ['bits', 3], // Renamed from zero1!
    type: ['bits', 2],
    /*
     // Little endian
     type      : 2,
     zero1    : 3, // Renamed from zero1!
     code_mode : 3,
     */
    zero2: 'uint8', // Renamed from zero2!
    lang_code: 'uint16',
    lang_extension: 'uint8',
    code_extension: 'uint8'
  };
}


/**
 * PGC Command Table.
 */
export function pgc_command_tbl_t() {
  return {
    'vm_cmd_t': vm_cmd_t(),
    'main': {
      nr_of_pre: 'uint16',
      nr_of_post: 'uint16',
      nr_of_cell: 'uint16',
      zero_1: 'uint16',
      pre_cmds: ['array', 'vm_cmd_t', function(o) {
        return o.output.nr_of_pre;
      }],
      post_cmds: ['array', 'vm_cmd_t', function(o) {
        return o.output.nr_of_post;
      }],
      cell_cmds: ['array', 'vm_cmd_t', function(o) {
        return o.output.nr_of_cell;
      }]
    }
  };
}

/**
 * PGC Program Map
 */
export function pgc_program_map_t() {
  return {
    'main': 'uint8'
  };
}

/**
 * Cell Playback Information.
 */
export function cell_playback_t() {
  return {
    'dvd_time_t': dvd_time_t(),
    'main': {
      // Big endian
      block_mode: ['bits', 2],
      block_type: ['bits', 2],
      seamless_play: ['bits', 1],
      interleaved: ['bits', 1],
      stc_discontinuity: ['bits', 1],
      seamless_angle: ['bits', 1],

      playback_mode: ['bits', 1], // When set, enter StillMode after each VOBU
      restricted: ['bits', 1], // ?? drop out of fastforward?
      unknown2: ['bits', 6],
      /*
       // Little endian
       seamless_angle   : 1,
       stc_discontinuity: 1,
       interleaved      : 1,
       seamless_play    : 1,
       block_type       : 2,
       block_mode       : 2,

       unknown2         : 6,
       restricted       : 1,
       playback_mode    : 1,
       */
      still_time: 'uint8',
      cell_cmd_nr: 'uint8',
      playback_time: 'dvd_time_t',
      first_sector: 'uint32',
      first_ilvu_end_sector: 'uint32',
      last_vobu_start_sector: 'uint32',
      last_sector: 'uint32'
    }
  };
}

/** @const */ var BLOCK_TYPE_NONE = 0x0;
/** @const */ var BLOCK_TYPE_ANGLE_BLOCK = 0x1;

/** @const */ var BLOCK_MODE_NOT_IN_BLOCK = 0x0;
/** @const */ var BLOCK_MODE_FIRST_CELL = 0x1;
/** @const */ var BLOCK_MODE_IN_BLOCK = 0x2;
/** @const */ var BLOCK_MODE_LAST_CELL = 0x3;


/**
 * Cell Position Information.
 */
export function cell_position_t() {
  return {
    'main': {
      vob_id_nr: 'uint16',
      zero_1: 'uint8',
      cell_nr: 'uint8'
    }
  };
}


/**
 * User Operations.
 * Exported for dvdread/nav_types.ts.
 */
export function user_ops_t() {
  return {
    // Big endian
    zero: ['bits', 7], // 25-31
    video_pres_mode_change: ['bits', 1], // 24

    karaoke_audio_pres_mode_change: ['bits', 1], // 23
    angle_change: ['bits', 1],
    subpic_stream_change: ['bits', 1],
    audio_stream_change: ['bits', 1],
    pause_on: ['bits', 1],
    still_off: ['bits', 1],
    button_select_or_activate: ['bits', 1],
    resume: ['bits', 1], // 16

    chapter_menu_call: ['bits', 1], // 15
    angle_menu_call: ['bits', 1],
    audio_menu_call: ['bits', 1],
    subpic_menu_call: ['bits', 1],
    root_menu_call: ['bits', 1],
    title_menu_call: ['bits', 1],
    backward_scan: ['bits', 1],
    forward_scan: ['bits', 1], // 8

    next_pg_search: ['bits', 1], // 7
    prev_or_top_pg_search: ['bits', 1],
    time_or_chapter_search: ['bits', 1],
    go_up: ['bits', 1],
    stop: ['bits', 1],
    title_play: ['bits', 1],
    chapter_search_or_play: ['bits', 1],
    title_or_time_play: ['bits', 1]              // 0
    /*
     // Little endian
     video_pres_mode_change         : 1, // 24
     zero                           : 7, // 25-31

     resume                         : 1, // 16
     button_select_or_activate      : 1,
     still_off                      : 1,
     pause_on                       : 1,
     audio_stream_change            : 1,
     subpic_stream_change           : 1,
     angle_change                   : 1,
     karaoke_audio_pres_mode_change : 1, // 23

     forward_scan                   : 1, // 8
     backward_scan                  : 1,
     title_menu_call                : 1,
     root_menu_call                 : 1,
     subpic_menu_call               : 1,
     audio_menu_call                : 1,
     angle_menu_call                : 1,
     chapter_menu_call              : 1, // 15

     title_or_time_play             : 1, // 0
     chapter_search_or_play         : 1,
     title_play                     : 1,
     stop                           : 1,
     go_up                          : 1,
     time_or_chapter_search         : 1,
     prev_or_top_pg_search          : 1,
     next_pg_search                 : 1  // 7
     */
  };
}

/**
 * Program Chain Information.
 */
export function pgc_t() {
  return {
    'dvd_time_t': dvd_time_t(),
    'user_ops_t': user_ops_t(),
    //'pgc_command_tbl_t': pgc_command_tbl_t()['main'],
    //'pgc_program_map_t': pgc_program_map_t()['main'],
    //'cell_playback_t': cell_playback_t()['main'],
    //'cell_position_t': cell_position_t()['main'],
    'vm_cmd_t': vm_cmd_t(),
    'offset': function(config, type, offset_name) {
      var offset = config.output[offset_name];
      var pos = config.binaryReader.tell();
      if (offset == 0) {
        return null;
      }
      config.binaryReader.seek(offset);
      var result = config.parse([type]);
      config.binaryReader.seek(pos);
      return result;
    },
    'main': {
      zero_1: 'uint16',
      nr_of_programs: 'uint8',
      nr_of_cells: 'uint8',
      playback_time: 'dvd_time_t',
      prohibited_ops: 'user_ops_t',
      audio_control: ['array', 'uint16', 8], // New type?
      subp_control: ['array', 'uint32', 32], // New type?
      next_pgc_nr: 'uint16',
      prev_pgc_nr: 'uint16',
      goup_pgc_nr: 'uint16',
      still_time: 'uint8',
      pg_playback_mode: 'uint8',
      palette: ['array', 'uint32', 16], // New type struct {zero_1, Y, Cr, Cb} ?
      command_tbl_offset: 'uint16',
      program_map_offset: 'uint16',
      cell_playback_offset: 'uint16',
      cell_position_offset: 'uint16',
      command_tbl: function() {
        return [];
      },
      program_map: function() {
        return [];
      },
      cell_playback: function() {
        return [];
      },
      cell_position: function() {
        return [];
      }
    }
  };
}

/** @const */ export var PGC_SIZE = 236;

/**
 * Program Chain Information Search Pointer.
 */
function pgci_srp_t() {
  return {
    entry_id: 'uint8',
    // Big endian
    block_mode: ['bits', 2],
    block_type: ['bits', 2],
    unknown1: ['bits', 4],
    /*
     // Little endian
     unknown1   : 4,
     block_type : 2,
     block_mode : 2,
     */
    ptl_id_mask: 'uint16',
    pgc_start_byte: 'uint32',
    pgc: function() {
      return null;
    }
  };
}

/** @const */ var PGCI_SRP_SIZE = 8;
/**
 * Program Chain Information Table.
 */
export function pgcit_t() {
  return {
    'pgci_srp_t': pgci_srp_t(),
    'main': {
      nr_of_pgci_srp: 'uint16',
      zero_1: 'uint16',
      last_byte: 'uint32',
      pgci_srp: ['array', 'pgci_srp_t', function(o) {
        return o.output.nr_of_pgci_srp;
      }]
    }
  };
}

/** @const */ var PGCIT_SIZE = 8;
/**
 * Menu PGCI Language Unit.
 */
function pgci_lu_t() {
  return {
    lang_code: 'uint16',
    lang_extension: 'uint8',
    exists: 'uint8',
    lang_start_byte: 'uint32',
    pgcit: function() {
      return null;
    }
  };
}

/** @const */ export var PGCI_LU_SIZE = 8;

/**
 * Menu PGCI Unit Table.
 */
export function pgci_ut_t() {
  return {
    'pgci_lu_t': pgci_lu_t(),
    'main': {
      nr_of_lus: 'uint16',
      zero_1: 'uint16',
      last_byte: 'uint32',
      lu: ['array', 'pgci_lu_t', function(o) {
        return o.output.nr_of_lus;
      }]
    }
  };
}

/** @const */ var PGCI_UT_SIZE = 8;

/**
 * Cell Address Information.
 */
function cell_adr_t() {
  return {
    vob_id: 'uint16',
    cell_id: 'uint8',
    zero_1: 'uint8',
    start_sector: 'uint32',
    last_sector: 'uint32'
  };
}

/** @const */ export var CELL_ADR_SIZE = 2 + 1 + 1 + 4 + 4;

/**
 * Cell Address Table.
 */
export function c_adt_t() {
  return {
    'cell_adr_t': cell_adr_t(),
    'main': {
      nr_of_vobs: 'uint16', // VOBs
      zero_1: 'uint16',
      last_byte: 'uint32',
      cell_adr_table: ['array', 'cell_adr_t', function(o) {
        return (o.output.last_byte + 1 - C_ADT_SIZE) / CELL_ADR_SIZE;
      }]  // No explicit size given.
    }
  };
}

/** @const */ export var C_ADT_SIZE = 8;

/**
 * VOBU Address Map.
 */
export function vobu_admap_t() {
  return {
    'main': {
      last_byte: 'uint32',
      vobu_start_sectors: ['array', 'uint32', function(o) {
        return (o.output.last_byte + 1 - VOBU_ADMAP_SIZE) / UINT32_SIZE;
      }]
    }
  };
}


/**
 * VMGI
 *
 * The following structures relate to the Video Manager.
 */

/**
 * Video Manager Information Management Table.
 */
export function vmgi_mat_t() {
  return {
    'uint64': function(config) {
      return config.binaryReader.getUint64();
    },
    'video_attr_t': video_attr_t(),
    'audio_attr_t': audio_attr_t(),
    'subp_attr_t': subp_attr_t(),
    'main': {
      vmg_identifier: ['string', 12],
      vmg_last_sector: 'uint32',
      zero_1: ['array', 'uint8', 12],
      vmgi_last_sector: 'uint32',
      zero_2: 'uint8',
      specification_version: 'uint8',
      vmg_category: 'uint32',
      vmg_nr_of_volumes: 'uint16',
      vmg_this_volume_nr: 'uint16',
      disc_side: 'uint8',
      zero_3: ['array', 'uint8', 19],
      vmg_nr_of_title_sets: 'uint16', // Number of VTSs.
      provider_identifier: ['string', 32],
      vmg_pos_code: 'uint64', // @todo Test me.
      zero_4: ['array', 'uint8', 24],
      vmgi_last_byte: 'uint32',
      first_play_pgc: 'uint32',
      zero_5: ['array', 'uint8', 56],
      vmgm_vobs: 'uint32', // sector
      tt_srpt: 'uint32', // sector
      vmgm_pgci_ut: 'uint32', // sector
      ptl_mait: 'uint32', // sector
      vts_atrt: 'uint32', // sector
      txtdt_mgi: 'uint32', // sector
      vmgm_c_adt: 'uint32', // sector
      vmgm_vobu_admap: 'uint32', // sector
      zero_6: ['array', 'uint8', 32],

      vmgm_video_attr: 'video_attr_t',
      zero_7: 'uint8',
      nr_of_vmgm_audio_streams: 'uint8', // should be 0 or 1
      vmgm_audio_attr: 'audio_attr_t',
      zero_8: ['array', 'uint8', 7],
      zero_9: ['array', 'uint8', 17],
      nr_of_vmgm_subp_streams: 'uint8', // should be 0 or 1
      vmgm_subp_attr: 'subp_attr_t',
      zero_10: ['array', 'uint8', 27]   // XXX: how much 'padding' here?
    }
  };
}

function playback_type_t() {
  return {
    // Big endian
    zero_1: ['bits', 1],
    multi_or_random_pgc_title: ['bits', 1], // 0: one sequential pgc title
    jlc_exists_in_cell_cmd: ['bits', 1],
    jlc_exists_in_prepost_cmd: ['bits', 1],
    jlc_exists_in_button_cmd: ['bits', 1],
    jlc_exists_in_tt_dom: ['bits', 1],
    chapter_search_or_play: ['bits', 1], // UOP 1
    title_or_time_play: ['bits', 1]      // UOP 0
    /*
     // Little endian
     title_or_time_play        : 1,
     chapter_search_or_play    : 1,
     jlc_exists_in_tt_dom      : 1,
     jlc_exists_in_button_cmd  : 1,
     jlc_exists_in_prepost_cmd : 1,
     jlc_exists_in_cell_cmd    : 1,
     multi_or_random_pgc_title : 1,
     zero_1                    : 1
     */
  };
}

/**
 * Title Information.
 */
function title_info_t() {
  return {
    pb_ty: 'playback_type_t',
    nr_of_angles: 'uint8',
    nr_of_ptts: 'uint16',
    parental_id: 'uint16',
    title_set_nr: 'uint8',
    vts_ttn: 'uint8',
    title_set_sector: 'uint32'
  };
}
/** @const */ export var TITLE_INFO_SIZE = 1 + 2 + 2 + 1 + 1 + 4;

/**
 * PartOfTitle Search Pointer Table.
 */
export function tt_srpt_t() {
  return {
    'title_info_t': title_info_t(),
    'playback_type_t': playback_type_t(),
    'main': {
      nr_of_srpts: 'uint16',
      zero_1: 'uint16',
      last_byte: 'uint32',
      title: ['array', 'title_info_t', function(o) {
        return o.output.nr_of_srpts;
      }]
    }
  };
}

/** @const */ export var TT_SRPT_SIZE = 8;

/**
 * Parental Management Information Unit Table.
 * Level 1 (US: G), ..., 7 (US: NC-17), 8
 */
/** @const */ var PTL_MAIT_NUM_LEVEL = 8;
export function pf_level_t() {
  return ['array', 'uint16', PTL_MAIT_NUM_LEVEL];
}

/** @const */ export var PF_LEVEL_SIZE = 2 * PTL_MAIT_NUM_LEVEL;

/**
 * Parental Management Information Unit Table.
 */
function ptl_mait_country_t() {
  return {
    country_code: 'uint16',
    zero_1: 'uint16',
    pf_ptl_mai_start_byte: 'uint16',
    zero_2: 'uint16',
    pf_ptl_mai: function() {
      return null;
    } // table of (nr_of_vtss + 1), video_ts is first
  };
}

/** @const */ export var PTL_MAIT_COUNTRY_SIZE = 8;

/**
 * Parental Management Information Table.
 */
export function ptl_mait_t() {
  return {
    'ptl_mait_country_t': ptl_mait_country_t(),
    //'pf_level_t': pf_level_t(),
    'main': {
      nr_of_countries: 'uint16',
      nr_of_vtss: 'uint16',
      last_byte: 'uint32',
      countries: ['array', 'ptl_mait_country_t', function(o) {
        return o.output.nr_of_countries;
      }]
    }
  };
}

/** @const */ export var PTL_MAIT_SIZE = 8;

/**
 * Video Title Set Attributes.
 */
export function vts_attributes_t() {
  return {
    'video_attr_t': video_attr_t(),
    'audio_attr_t': audio_attr_t(),
    'subp_attr_t': subp_attr_t(),
    'main': {
      last_byte: 'uint32',
      vts_cat: 'uint32',

      vtsm_vobs_attr: 'video_attr_t',
      zero_1: 'uint8',
      nr_of_vtsm_audio_streams: 'uint8', // should be 0 or 1
      vtsm_audio_attr: 'audio_attr_t',
      zero_2: ['array', 'uint8', 7],
      zero_3: ['array', 'uint8', 16],
      zero_4: 'uint8',
      nr_of_vtsm_subp_streams: 'uint8', // should be 0 or 1
      vtsm_subp_attr: {},
      zero_5: ['array', 'uint8', 27],

      zero_6: ['array', 'uint8', 2],

      vtstt_vobs_video_attr: 'video_attr_t',
      zero_7: 'uint8',
      nr_of_vtstt_audio_streams: 'uint8',
      vtstt_audio_attr: ['array', 'audio_attr_t', 8],
      zero_8: ['array', 'uint8', 16],
      zero_9: 'uint8',
      nr_of_vtstt_subp_streams: 'uint8',
      vtstt_subp_attr: ['array', 'subp_attr_t', 32]
    }
  };
}

/** @const */ var VTS_ATTRIBUTES_SIZE = 542;
/** @const */ export var VTS_ATTRIBUTES_MIN_SIZE = 356;

/**
 * Video Title Set Attribute Table.
 */
export function vts_atrt_t() {
  return {
    'main': {
      nr_of_vtss: 'uint16',
      zero_1: 'uint16',
      last_byte: 'uint32',
      vts_atrt_offsets: ['array', 'uint32', function(o) {
        return o.output.nr_of_vtss;
      }], // offsets table for each vts_attributes
      vts: function() {
        return [];
      }
    }
  };
}

/** @const */ export var VTS_ATRT_SIZE = 8;

/**
 * Text Data. (Incomplete)
 */
function txtdt_t() {
  return {
    last_byte: 'uint32', // offsets are relative here
    offsets: ['array', 'uint16', 100] // == nr_of_srpts + 1 (first is disc title)
    /*
     unknown: null, // 0x48 ?? 0x48 words (16bit) info following
     zero_1: null,

     type_of_info: null, // ?? 01 == disc, 02 == Title, 04 == Title part
     unknown1: null,
     unknown2: null,
     unknown3: null,
     unknown4: null, // ?? allways 0x30 language?, text format?
     unknown5: null,
     offset: null, // from first

     text: new Array(12) // ended by 0x09
     */
  };
}

/**
 * Text Data Language Unit. (Incomplete)
 */
function txtdt_lu_t() {
  return {
    lang_code: 'uint16',
    unknown: 'uint16', // 0x0001, title 1? disc 1? side 1?
    txtdt_start_byte: 'uint32', // prt, rel start of vmg_txtdt_mgi
    txtdt: function() {
      return [];
    }
  };
}

/** @const */ var TXTDT_LU_SIZE = 8;

/**
 * Text Data Manager Information. (Incomplete)
 */
export function txtdt_mgi_t() {
  return {
    'txtdt_lu_t': txtdt_lu_t(),
    'main': {
      disc_name: ['string', 14], // how many bytes??
      nr_of_language_units: 'uint16', // 32bit??
      last_byte: 'uint32',
      lu: ['array', 'txtdt_lu_t', function(o) {
        return o.output.nr_of_language_units;
      }]
    }
  };
}

/** @const */ var TXTDT_MGI_SIZE = 20;

/**
 * VTS
 *
 * Structures relating to the Video Title Set (VTS).
 */

/**
 * Video Title Set Information Management Table.
 */
export function vtsi_mat_t() {
  return {
    uint64: function(config) {
      return config.binaryReader.getUint64();
    },
    'video_attr_t': video_attr_t(),
    'audio_attr_t': audio_attr_t(),
    'multichannel_ext_t': multichannel_ext_t(),
    'subp_attr_t': subp_attr_t(),
    'main': {
      vts_identifier: ['string', 12],
      vts_last_sector: 'uint32',
      zero_1: ['array', 'uint8', 12],
      vtsi_last_sector: 'uint32',
      zero_2: 'uint8',
      specification_version: 'uint8',
      vts_category: 'uint32',
      zero_3: 'uint16',
      zero_4: 'uint16',
      zero_5: 'uint8',
      zero_6: ['array', 'uint8', 19],
      zero_7: 'uint16',
      zero_8: ['array', 'uint8', 32],
      zero_9: 'uint64',
      zero_10: ['array', 'uint8', 24],
      vtsi_last_byte: 'uint32',
      zero_11: 'uint32',
      zero_12: ['array', 'uint8', 56],
      vtsm_vobs: 'uint32', // sector
      vtstt_vobs: 'uint32', // sector
      vts_ptt_srpt: 'uint32', // sector
      vts_pgcit: 'uint32', // sector
      vtsm_pgci_ut: 'uint32', // sector
      vts_tmapt: 'uint32', // sector
      vtsm_c_adt: 'uint32', // sector
      vtsm_vobu_admap: 'uint32', // sector
      vts_c_adt: 'uint32', // sector
      vts_vobu_admap: 'uint32', // sector
      zero_13: ['array', 'uint8', 24],

      vtsm_video_attr: 'video_attr_t',
      zero_14: 'uint8',
      nr_of_vtsm_audio_streams: 'uint8', // should be 0 or 1
      vtsm_audio_attr: 'audio_attr_t',
      zero_15: ['array', 'uint8', 7],
      zero_16: ['array', 'uint8', 17],
      nr_of_vtsm_subp_streams: 'uint8', // should be 0 or 1
      vtsm_subp_attr: 'subp_attr_t',
      zero_17: ['array', 'uint8', 27],
      zero_18: ['array', 'uint8', 2],

      vts_video_attr: 'video_attr_t',
      zero_19: 'uint8',
      nr_of_vts_audio_streams: 'uint8',
      vts_audio_attr: ['array', 'audio_attr_t', 8],
      zero_20: ['array', 'uint8', 17],
      nr_of_vts_subp_streams: 'uint8',
      vts_subp_attr: ['array', 'subp_attr_t', 32],
      zero_21: 'uint16',
      vts_mu_audio_attr: ['array', 'multichannel_ext_t', 8]
      // XXX: how much 'padding' here, if any?
    }
  };
}

/**
 * PartOfTitle Unit Information.
 */
export function ptt_info_t() {
  return {
    'main': {
      pgcn: 'uint16',
      pgn: 'uint16'
    }
  };
}

/** @const */ export var PTT_INFO_SIZE = 4;
/**
 * PartOfTitle Information.
 */
export function ttu_t() {
  return {
    'ptt_info_t': ptt_info_t()['main'],
    'main': {
      nr_of_ptts: 'uint16',
      ptt: ['array', 'ptt_info_t', function(o) {
        return o.output.nr_of_ptts;
      }]
    }
  };
}

/** @const */ var TTU_SIZE = 2;

/**
 * PartOfTitle Search Pointer Table.
 */
export function vts_ptt_srpt_t() {
  return {
    ttu_t: ttu_t()['main'],
    ptt_info_t: ptt_info_t()['main'],
    'main': {
      nr_of_srpts: 'uint16',
      zero_1: 'uint16',
      last_byte: 'uint32',
      ttu_offset: ['array', 'uint32', function(o) {
        return o.output.nr_of_srpts;
      }], // offset table for each ttu
      title: ['array', 'ttu_t', function(o) {
        return [];
      }]
    }
  };
}
/** @const */ export var VTS_PTT_SRPT_SIZE = 8;


/**
 * Time Map Entry.
 */
/* Should this be bit field at all or just the uint32_t? */
function map_ent_t() {
  return 'uint32';
}

/**
 * Time Map.
 */
export function vts_tmap_t() {
  return {
    'map_ent_t': map_ent_t(),
    'main': {
      tmu: 'uint8', // Time unit, in seconds
      zero_1: 'uint8',
      nr_of_entries: 'uint16',
      map_ent: ['array', 'map_ent_t', function(o) {
        return o.output.nr_of_entries;
      }]
    }
  };
}

/** @const */ var VTS_TMAP_SIZE = 4;

/**
 * Time Map Table.
 */
export function vts_tmapt_t() {
  return {
    'vts_tmap_t': vts_tmap_t()['main'],
    'main': {
      nr_of_tmaps: 'uint16',
      zero_1: 'uint16',
      last_byte: 'uint32',
      tmap: function() {
        return [];
      },
      tmap_offset: ['array', 'uint32', function(o) {
        return o.output.nr_of_tmaps;
      }] // offset table for each tmap
    }
  };
}

/** @const */ var VTS_TMAPT_SIZE = 8;


/**
 * The following structure defines an IFO file.  The structure is divided into
 * two parts, the VMGI, or Video Manager Information, which is read from the
 * VIDEO_TS.[IFO,BUP] file, and the VTSI, or Video Title Set Information, which
 * is read in from the VTS_XX_0.[IFO,BUP] files.
 */
export function ifo_handle_t() {
  this.file = null;

  // VMGI
  this.vmgi_mat = null; // vmgi_mat_t
  this.tt_srpt = null; // tt_srpt_t
  this.first_play_pgc = null; // pgc_t
  this.ptl_mait = null; // ptl_mait_t
  this.vts_atrt = null; // vts_atrt_t
  this.txtdt_mgi = null; // txtdt_mgi_t

  // Common
  this.pgci_ut = null; // pgci_ut_t
  this.menu_c_adt = null; // c_adt_t
  this.menu_vobu_admap = null; // vobu_admap_t

  // VTSI
  this.vtsi_mat = null; // vtsi_mat_t
  this.vts_ptt_srpt = null; // vts_ptt_srpt_t
  this.vts_pgcit = null; // pgcit_t
  this.vts_tmapt = null; // vts_tmapt_t
  this.vts_c_adt = null; // c_adt_t
  this.vts_vobu_admap = null; // vobu_admap_t

  // Own implementation
  //this._view = null;
  /*return {
   file: null,

   // VMGI
   vmgi_mat: null, // vmgi_mat_t
   tt_srpt: null, // tt_srpt_t
   first_play_pgc: null, // pgc_t
   ptl_mait: null, // ptl_mait_t
   vts_atrt: null, // vts_atrt_t
   txtdt_mgi: null, // txtdt_mgi_t

   // Common
   pgci_ut: null, // pgci_ut_t
   menu_c_adt: null, // c_adt_t
   menu_vobu_admap: null, // vobu_admap_t

   // VTSI
   vtsi_mat: null, // vtsi_mat_t
   vts_ptt_srpt: null, // vts_ptt_srpt_t
   vts_pgcit: null, // pgcit_t
   vts_tmapt: null, // vts_tmapt_t
   vts_c_adt: null, // c_adt_t
   vts_vobu_admap: null // vobu_admap_t

   // Own implementation
   //_view: null
   };*/
}
