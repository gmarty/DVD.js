/// <reference path="../references.ts" />

'use strict';


var jDataView: jDataViewStatic = require('jdataview');

import navTypes = require('../dvdread/nav_types');
import BinaryParser = require('../lib/binaryParser/index');
import config = require('../config');
import utils = require('../utils');

var DEBUG = config.DEBUG;
var CHECK_VALUE = utils.CHECK_VALUE;
var CHECK_ZERO = utils.CHECK_ZERO;
var CHECK_ZERO0 = utils.CHECK_ZERO0;

/**
 * Reads the PCI packet data pointed to into pci struct.
 *
 * @param data Pointer to the buffer of the on disc PCI data.
 */
export function PCI(data) {
  var view = new jDataView(data, undefined, undefined, false);
  return parsePCI(view);
}

export function parsePCI(view) {
  //try {
  var pci = new BinaryParser(view, navTypes.pci_t()).parse('main');
  /*} catch (e) {
   return null;
   }*/

  var i = 0, j = 0;

  // pci pci_gi
  /*var state;
   pci.pci_gi.nv_pck_lbn = parser.readUint32();
   pci.pci_gi.vobu_cat = parser.readUint16();
   pci.pci_gi.zero1 = parser.readUint16();
   pci.pci_gi.vobu_uop_ctl.zero = parser.readBits(7);
   pci.pci_gi.vobu_uop_ctl.video_pres_mode_change = parser.readBits(1);

   pci.pci_gi.vobu_uop_ctl.karaoke_audio_pres_mode_change = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.angle_change = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.subpic_stream_change = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.audio_stream_change = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.pause_on = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.still_off = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.button_select_or_activate = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.resume = parser.readBits(1);

   pci.pci_gi.vobu_uop_ctl.chapter_menu_call = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.angle_menu_call = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.audio_menu_call = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.subpic_menu_call = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.root_menu_call = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.title_menu_call = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.backward_scan = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.forward_scan = parser.readBits(1);

   pci.pci_gi.vobu_uop_ctl.next_pg_search = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.prev_or_top_pg_search = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.time_or_chapter_search = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.go_up = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.stop = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.title_play = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.chapter_search_or_play = parser.readBits(1);
   pci.pci_gi.vobu_uop_ctl.title_or_time_play = parser.readBits(1);
   pci.pci_gi.vobu_s_ptm = parser.readUint32();
   pci.pci_gi.vobu_e_ptm = parser.readUint32();
   pci.pci_gi.vobu_se_e_ptm = parser.readUint32();
   pci.pci_gi.e_eltm.hour = parser.readUint8();
   pci.pci_gi.e_eltm.minute = parser.readUint8();
   pci.pci_gi.e_eltm.second = parser.readUint8();
   pci.pci_gi.e_eltm.frame_u = parser.readUint8();
   for (i = 0; i < 32; i++)
   pci.pci_gi.vobu_isrc[i] = parser.readUint8();

   // pci nsml_agli
   for (i = 0; i < 9; i++)
   pci.nsml_agli.nsml_agl_dsta[i] = parser.readUint32();

   // pci hli hli_gi
   pci.hli.hl_gi.hli_ss = parser.readUint16();
   pci.hli.hl_gi.hli_s_ptm = parser.readUint32();
   pci.hli.hl_gi.hli_e_ptm = parser.readUint32();
   pci.hli.hl_gi.btn_se_e_ptm = parser.readUint32();
   pci.hli.hl_gi.zero1 = parser.readBits(2);
   pci.hli.hl_gi.btngr_ns = parser.readBits(2);
   pci.hli.hl_gi.zero2 = parser.readBits(1);
   pci.hli.hl_gi.btngr1_dsp_ty = parser.readBits(3);
   pci.hli.hl_gi.zero3 = parser.readBits(1);
   pci.hli.hl_gi.btngr2_dsp_ty = parser.readBits(3);
   pci.hli.hl_gi.zero4 = parser.readBits(1);
   pci.hli.hl_gi.btngr3_dsp_ty = parser.readBits(3);
   pci.hli.hl_gi.btn_ofn = parser.readUint8();
   pci.hli.hl_gi.btn_ns = parser.readUint8();
   pci.hli.hl_gi.nsl_btn_ns = parser.readUint8();
   pci.hli.hl_gi.zero5 = parser.readUint8();
   pci.hli.hl_gi.fosl_btnn = parser.readUint8();
   pci.hli.hl_gi.foac_btnn = parser.readUint8();

   // pci hli btn_colit
   for (i = 0; i < 3; i++)
   for (j = 0; j < 2; j++)
   pci.hli.btn_colit.btn_coli[i][j] = parser.readUint32();

   // pci hli btni
   for (i = 0; i < 36; i++) {
   pci.hli.btnit[i].btn_coln = parser.readBits(2);
   pci.hli.btnit[i].x_start = parser.readBits(10);
   pci.hli.btnit[i].zero1 = parser.readBits(2);
   pci.hli.btnit[i].x_end = parser.readBits(10);

   pci.hli.btnit[i].auto_action_mode = parser.readBits(2);
   pci.hli.btnit[i].y_start = parser.readBits(10);
   pci.hli.btnit[i].zero2 = parser.readBits(2);
   pci.hli.btnit[i].y_end = parser.readBits(10);

   pci.hli.btnit[i].zero3 = parser.readBits(2);
   pci.hli.btnit[i].up = parser.readBits(6);
   pci.hli.btnit[i].zero4 = parser.readBits(2);
   pci.hli.btnit[i].down = parser.readBits(6);
   pci.hli.btnit[i].zero5 = parser.readBits(2);
   pci.hli.btnit[i].left = parser.readBits(6);
   pci.hli.btnit[i].zero6 = parser.readBits(2);
   pci.hli.btnit[i].right = parser.readBits(6);
   // pci vm_cmd
   for (j = 0; j < 8; j++)
   pci.hli.btnit[i].cmd.bytes[j] = parser.readUint8();
   }*/

  if (DEBUG) {
    // pci pci gi
    CHECK_ZERO0(pci.pci_gi.zero1);

    // pci hli hli_gi
    CHECK_ZERO0(pci.hli.hl_gi.zero1);
    CHECK_ZERO0(pci.hli.hl_gi.zero2);
    CHECK_ZERO0(pci.hli.hl_gi.zero3);
    CHECK_ZERO0(pci.hli.hl_gi.zero4);
    CHECK_ZERO0(pci.hli.hl_gi.zero5);

    // Are there buttons defined here?
    if ((pci.hli.hl_gi.hli_ss & 0x03) !== 0) {
      CHECK_VALUE(pci.hli.hl_gi.btn_ns !== 0);
      CHECK_VALUE(pci.hli.hl_gi.btngr_ns !== 0);
    } else {
      CHECK_VALUE((pci.hli.hl_gi.btn_ns !== 0 && pci.hli.hl_gi.btngr_ns !== 0)
        || (pci.hli.hl_gi.btn_ns === 0 && pci.hli.hl_gi.btngr_ns === 0));
    }

    // pci hli btnit
    for (i = 0; i < pci.hli.hl_gi.btngr_ns; i++) {
      for (j = 0; j < (36 / pci.hli.hl_gi.btngr_ns); j++) {
        var n = (36 / pci.hli.hl_gi.btngr_ns) * i + j;
        CHECK_ZERO0(pci.hli.btnit[n].zero1);
        CHECK_ZERO0(pci.hli.btnit[n].zero2);
        CHECK_ZERO0(pci.hli.btnit[n].zero3);
        CHECK_ZERO0(pci.hli.btnit[n].zero4);
        CHECK_ZERO0(pci.hli.btnit[n].zero5);
        CHECK_ZERO0(pci.hli.btnit[n].zero6);

        if (j < pci.hli.hl_gi.btn_ns) {
          CHECK_VALUE(pci.hli.btnit[n].x_start <= pci.hli.btnit[n].x_end);
          CHECK_VALUE(pci.hli.btnit[n].y_start <= pci.hli.btnit[n].y_end);
          CHECK_VALUE(pci.hli.btnit[n].up <= pci.hli.hl_gi.btn_ns);
          CHECK_VALUE(pci.hli.btnit[n].down <= pci.hli.hl_gi.btn_ns);
          CHECK_VALUE(pci.hli.btnit[n].left <= pci.hli.hl_gi.btn_ns);
          CHECK_VALUE(pci.hli.btnit[n].right <= pci.hli.hl_gi.btn_ns);
          // vmcmd_verify(pci.hli.btnit[n].cmd);
        } else {
          var k = 0;
          CHECK_VALUE(pci.hli.btnit[n].btn_coln === 0);
          CHECK_VALUE(pci.hli.btnit[n].auto_action_mode === 0);
          CHECK_VALUE(pci.hli.btnit[n].x_start === 0);
          CHECK_VALUE(pci.hli.btnit[n].y_start === 0);
          CHECK_VALUE(pci.hli.btnit[n].x_end === 0);
          CHECK_VALUE(pci.hli.btnit[n].y_end === 0);
          CHECK_VALUE(pci.hli.btnit[n].up === 0);
          CHECK_VALUE(pci.hli.btnit[n].down === 0);
          CHECK_VALUE(pci.hli.btnit[n].left === 0);
          CHECK_VALUE(pci.hli.btnit[n].right === 0);
          for (k = 0; k < 8; k++) {
            CHECK_VALUE(pci.hli.btnit[n].cmd.bytes[k] === 0);
          }
          // CHECK_ZERO?
        }
      }
    }

    CHECK_ZERO(pci.zero1);
  }

  return pci;
}

/**
 * Reads the DSI packet data pointed to into dsi struct.
 *
 * @param data Pointer to the buffer of the on disc DSI data.
 */
export function DSI(data) {
  var view = new jDataView(data, undefined, undefined, false);
  return parseDSI(view);
}

export function parseDSI(view) {
  //try {
  var dsi = new BinaryParser(view, navTypes.dsi_t()).parse('main');
  /* catch (e) {
   return null;
   }*/

  /*var i = 0;
   var state;

   var parser = new Stream(data);
   var dsi = dsi_t().main;

   // dsi dsi gi
   dsi.dsi_gi = navTypes.dsi_gi_t();
   dsi.dsi_gi.nv_pck_scr = parser.readUint32();
   dsi.dsi_gi.nv_pck_lbn = parser.readUint32();
   dsi.dsi_gi.vobu_ea = parser.readUint32();
   dsi.dsi_gi.vobu_1stref_ea = parser.readUint32();
   dsi.dsi_gi.vobu_2ndref_ea = parser.readUint32();
   dsi.dsi_gi.vobu_3rdref_ea = parser.readUint32();
   dsi.dsi_gi.vobu_vob_idn = parser.readUint16();
   dsi.dsi_gi.zero1 = parser.readUint8();
   dsi.dsi_gi.vobu_c_idn = parser.readUint8();
   dsi.dsi_gi.c_eltm.hour = parser.readUint8();
   dsi.dsi_gi.c_eltm.minute = parser.readUint8();
   dsi.dsi_gi.c_eltm.second = parser.readUint8();
   dsi.dsi_gi.c_eltm.frame_u = parser.readUint8();

   // dsi sml pbi
   dsi.sml_pbi = navTypes.sml_pbi_t();
   dsi.sml_pbi.category = parser.readUint16();
   dsi.sml_pbi.ilvu_ea = parser.readUint32();
   dsi.sml_pbi.ilvu_sa = parser.readUint32();
   dsi.sml_pbi.size = parser.readUint16();
   dsi.sml_pbi.vob_v_s_s_ptm = parser.readUint32();
   dsi.sml_pbi.vob_v_e_e_ptm = parser.readUint32();
   dsi.sml_pbi.vob_a = new Array(8);
   for (i = 0; i < 8; i++) {
   dsi.sml_pbi.vob_a[i].stp_ptm1 = parser.readUint32();
   dsi.sml_pbi.vob_a[i].stp_ptm2 = parser.readUint32();
   dsi.sml_pbi.vob_a[i].gap_len1 = parser.readUint32();
   dsi.sml_pbi.vob_a[i].gap_len2 = parser.readUint32();
   }

   // dsi sml agli
   dsi.sml_agli = navTypes.sml_agli_t();
   for (i = 0; i < 9; i++) {
   dsi.sml_agli.data[ i ].address = parser.readUint32();
   dsi.sml_agli.data[ i ].size = parser.readUint16();
   }

   // dsi vobu sri
   dsi.vobu_sri = navTypes.vobu_sri_t();
   dsi.vobu_sri.next_video = parser.readUint32();
   for (i = 0; i < 19; i++)
   dsi.vobu_sri.fwda[i] = parser.readUint32();
   dsi.vobu_sri.next_vobu = parser.readUint32();
   dsi.vobu_sri.prev_vobu = parser.readUint32();
   for (i = 0; i < 19; i++)
   dsi.vobu_sri.bwda[i] = parser.readUint32();
   dsi.vobu_sri.prev_video = parser.readUint32();

   // dsi synci
   dsi.synci = navTypes.synci_t();
   for (i = 0; i < 8; i++)
   dsi.synci.a_synca[i] = parser.readUint16();
   for (i = 0; i < 32; i++)
   dsi.synci.sp_synca[i] = parser.readUint32();*/

  if (DEBUG) {
    // dsi dsi gi
    CHECK_ZERO0(dsi.dsi_gi.zero1);

    CHECK_ZERO(dsi.zero1);
  }

  return dsi;
}
