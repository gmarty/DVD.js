'use strict';


import dvdTypes = require('../dvdnav/dvd_types');
import ifoRead = require('../dvdread/ifo_read');
import config = require('../config');
import utils = require('../utils');

var DVDMenuID = dvdTypes.DVDMenuID_t;
var DVDDomain = dvdTypes.DVDDomain_t;
var VMPosition = dvdTypes.vm_position_t;
var TRACE = config.DEBUG;
var DVD_MENU_LANGUAGE: string = config.DVD_MENU_LANGUAGE;
var DVD_AUDIO_LANGUAGE: string = config.DVD_AUDIO_LANGUAGE;
var DVD_SPU_LANGUAGE: string = config.DVD_SPU_LANGUAGE;
var COUNTRY_CODE: string = config.COUNTRY_CODE;
var deepEqual = utils.deepEqual;
var sprintf = utils.sprintf;
var assert = utils.assert;

export = VM;

// Audio stream number
/** @const */ var AST_REG = 1;
// Subpicture stream number
/** @const */ var SPST_REG = 2;
// Angle number
/** @const */ var AGL_REG = 3;
// Title Track Number
/** @const */ var TTN_REG = 4;
// VTS Title Track Number
/** @const */ var VTS_TTN_REG = 5;
// PGC Number for this Title Track
/** @const */ var TT_PGCN_REG = 6;
// Current Part of Title (PTT) number for (One_Sequential_PGC_Title)
/** @const */ var PTTN_REG = 7;
// Highlighted Button Number (btn nr 1 == value 1024)
/** @const */ var HL_BTNN_REG = 8;
// Parental Level
/** @const */ var PTL_REG = 13;

// link command types
enum link_cmd {
  LinkNoLink,

  LinkTopC,
  LinkNextC,
  LinkPrevC,

  LinkTopPG = 5,
  LinkNextPG,
  LinkPrevPG,

  LinkTopPGC = 9,
  LinkNextPGC,
  LinkPrevPGC,
  LinkGoUpPGC,
  LinkTailPGC,

  LinkRSM = 16,

  LinkPGCN,
  LinkPTTN,
  LinkPGN,
  LinkCN,

  Exit,

  JumpTT, // 22
  JumpVTS_TT,
  JumpVTS_PTT,

  JumpSS_FP,
  JumpSS_VMGM_MENU,
  JumpSS_VTSM,
  JumpSS_VMGM_PGC,

  CallSS_FP, // 29
  CallSS_VMGM_MENU,
  CallSS_VTSM,
  CallSS_VMGM_PGC,

  PlayThis
}

/**
 * State: SPRM, GPRM, Domain, pgc, pgN, cellN, ?
 */
class DvdState {
  public registers = new Registers();

  public domain = 0;
  public vtsN = 0;            // 0 is vmgm?
  public pgc = null;          // either this or 'int pgcN' is enough?
  public pgcN = 0;            // but provide pgcN for quick lookup
  public pgN = 0;             // is this needed? Can always find pgN from cellN?
  public cellN = 0;
  public cell_restart = 0;    // get cell to restart
  public blockN = 0;

  // Resume info
  public rsm_vtsN = 0;
  public rsm_blockN = 0;      // of nav_packet
  public rsm_regs = Array(5); // system registers 4-8
  public rsm_pgcN = 0;
  public rsm_cellN = 0;
}

// a link's data set
class Link {
  public command = 0; // link_cmd
  public data1 = 0;
  public data2 = 0;
  public data3 = 0;
}

// the VM registers
class Registers {
  public SPRM = new Array(24);
  public GPRM = new Array(16);
  public GPRM_mode = new Array(16); // Need to have something to indicate normal/counter mode for every GPRM
  public GPRM_time = new Array(16); // For counter mode
}

// a VM command data set
class Command {
  public instruction: string = '';
  public examined: number = 0;
  public registers: Registers = new Registers();
}

class TitlePart {
  public title: number;
  public part: number;
}

class VM {
  private dvd;
  public vmgi;
  public vtsi;
  private state: DvdState = new DvdState();
  private hop_channel: number;
  private dvd_name;
  private dvd_serial;
  public stopped: boolean;

  /**
   * @param {?Object} dvd
   */
  public constructor(dvd?) {
    this.dvd = dvd;
    this.vmgi = null;
    this.vtsi = null;
    this.state = null;
    this.hop_channel = 0;
    this.dvd_name = Array(50);
    this.dvd_serial = Array(15);
    this.stopped = false;
  }

  // Reader Access
  private get_dvd_reader() {
    return this.dvd;
  }

  // IFO Access
  private get_vmgi() {
    return this.vmgi;
  }

  private get_vtsi() {
    return this.vtsi;
  }


  // Basic Handling
  public start() {
    if (this.stopped) {
      //if (!this.reset())
      //return false;

      this.stopped = false;
    }

    // Set pgc to FP (First Play) pgc
    this.set_FP_PGC();
    this.process_command(this.play_PGC());

    return !this.stopped;
  }

  public stop() {
    this.stopped = true;
  }

  public close() {
    if (this.vmgi) {
      this.vmgi = null;
    }
    if (this.vtsi) {
      this.vtsi = null;
    }
    if (this.dvd) {
      this.dvd = null;
    }
    this.stopped = true;
  }

  public reset(dvdroot, cb) {
    // Setup State
    this.state = new DvdState();
    this.state.registers.SPRM[0] = DVD_MENU_LANGUAGE.charCodeAt(1);   // Player Menu Language code
    this.state.registers.SPRM[1] = DVD_MENU_LANGUAGE.charCodeAt(0);   // Player Menu Language code
    this.state.registers.SPRM[AST_REG] = 15;           // 15 why?
    this.state.registers.SPRM[SPST_REG] = 62;          // 62 why?
    this.state.registers.SPRM[AGL_REG] = 1;
    this.state.registers.SPRM[TTN_REG] = 1;
    this.state.registers.SPRM[VTS_TTN_REG] = 1;
    this.state.registers.SPRM[TT_PGCN_REG] = 0;        // Unused
    this.state.registers.SPRM[PTTN_REG] = 1;
    this.state.registers.SPRM[HL_BTNN_REG] = 1 << 10;
    this.state.registers.SPRM[PTL_REG] = 15;           // Parental Level
    this.state.registers.SPRM[12] = COUNTRY_CODE.charCodeAt(1);       // Parental Management Country Code
    this.state.registers.SPRM[13] = COUNTRY_CODE.charCodeAt(0);       // Parental Management Country Code
    this.state.registers.SPRM[14] = 0x0100;            // Try Pan&Scan
    this.state.registers.SPRM[16] = DVD_AUDIO_LANGUAGE.charCodeAt(1); // Initial Language Code for Audio
    this.state.registers.SPRM[17] = DVD_AUDIO_LANGUAGE.charCodeAt(0); // Initial Language Code for Audio
    this.state.registers.SPRM[18] = DVD_SPU_LANGUAGE.charCodeAt(1);   // Initial Language Code for Spu
    this.state.registers.SPRM[19] = DVD_SPU_LANGUAGE.charCodeAt(0);   // Initial Language Code for Spu
    this.state.registers.SPRM[20] = 0x01;              // Player Regional Code Mask. Region free!

    this.state.pgN = 0;
    this.state.cellN = 0;
    this.state.cell_restart = 0;

    this.state.domain = DVDDomain.DVD_DOMAIN_FirstPlay;
    this.state.rsm_vtsN = 0;
    this.state.rsm_cellN = 0;
    this.state.rsm_blockN = 0;

    this.state.vtsN = -1;

    this.hop_channel = 0;

    /*if (this.dvd && dvdroot) {
     // a new dvd device has been requested
     this.close();
     }*/

    this.dvd.open(dvdroot, function() {
      this.vmgi = ifoRead.ifoOpenVMGI(this.dvd);
      if (!this.vmgi) {
        console.error('jsdvdnav: ifoOpenVMGI failed');
        return;
      }

      if (this.vmgi) {
        var msg = sprintf('jsdvdnav: DVD disc reports itself with Region mask %s. Regions:',
          utils.toHex(this.vmgi.vmgi_mat.vmg_category));
        for (var i = 1, mask = 1; i <= 8; i++, mask <<= 1)
          if (((this.vmgi.vmgi_mat.vmg_category >> 16) & mask) === 0)
            msg += sprintf(' %d', i);
        console.log(msg);
      }

      cb.call();
    }.bind(this));
  }

  private ifoOpenNewVTSI(vtsN) {
    if (this.state.vtsN === vtsN) {
      return true; // We already have it.
    }

    this.vtsi = ifoRead.ifoOpenVTSI(this.dvd, vtsN);
    if (!this.vtsi) {
      console.error('jsdvdnav: ifoOpenVTSI failed');
      return false;
    }

    this.state.vtsN = vtsN;

    return true;
  }


  // Initialisation & Destruction
  private free_vm() {
  }


  // Copying and merging.
  public new_copy() {
    var target = new VM();
    var vtsN;
    var pgcN = this.get_PGCN();
    var pgN = this.state.pgN;

    if (target === null || pgcN === 0) {
      fail();
      return null;
    }

    // @todo Make a deep copy of this.
    //memcpy(target, this, sizeof(vm_t));

    // open a new vtsi handle, because the copy might switch to another VTS
    target.vtsi = null;
    vtsN = (target.state).vtsN;
    if (vtsN > 0) {
      (target.state).vtsN = 0;
      if (!this.ifoOpenNewVTSI(vtsN)) {
        fail();
        return null;
      }

      // restore pgc pointer into the new vtsi
      if (!target.set_PGCN(pgcN)) {
        fail();
        return null;
      }

      (target.state).pgN = pgN;
    }

    return target;

    function fail() {
      if (target !== null)
        target.free_vm();
    }
  }

  public merge(target) {
    if (target.vtsi) {
      target.vtsi = null;
    }
    // @todo Copy properties of this to target.
  }

  public free_copy() {
    if (this.vtsi) {
      this.vtsi = null;
    }
  }


  // Regular playback
  // @todo Rename to get_position.
  public position_get() {
    var position = new VMPosition();

    position.button = this.state.registers.SPRM[HL_BTNN_REG] >> 10;
    position.vts = this.state.vtsN;
    position.domain = this.state.domain;
    position.spu_channel = this.state.registers.SPRM[SPST_REG];
    position.audio_channel = this.state.registers.SPRM[AST_REG];
    position.angle_channel = this.state.registers.SPRM[AGL_REG];
    position.hop_channel = this.hop_channel; // Increases by one on each hop.
    position.cell = this.state.cellN;
    position.cell_restart = this.state.cell_restart;
    position.cell_start = this.state.pgc.cell_playback[this.state.cellN - 1].first_sector;
    position.still = this.state.pgc.cell_playback[this.state.cellN - 1].still_time;
    position.block = this.state.blockN;

    // Handle PGC stills at PGC end.
    if (this.state.cellN === this.state.pgc.nr_of_cells) {
      position.still += this.state.pgc.still_time;
    }
    // Still already determined
    if (position.still) {
      return;
    }

    /* This is a rough fix for some strange still situations on some strange DVDs.
     * There are discs (like the German `Back to the Future` RC2) where the only
     * indication of a still is a cell playback time higher than the time the frames
     * in this cell actually take to play (like 1 frame with 1 minute playback time).
     * On the said BTTF disc, for these cells last_sector and last_vobu_start_sector
     * are equal and the cells are very short, so we abuse these conditions to
     * detect such discs. I consider these discs broken, so the fix is somewhat
     * broken, too. */
    if ((this.state.pgc.cell_playback[this.state.cellN - 1].last_sector ==
      this.state.pgc.cell_playback[this.state.cellN - 1].last_vobu_start_sector) &&
      (this.state.pgc.cell_playback[this.state.cellN - 1].last_sector -
        this.state.pgc.cell_playback[this.state.cellN - 1].first_sector < 1024)) {
      var size = this.state.pgc.cell_playback[this.state.cellN - 1].last_sector -
        this.state.pgc.cell_playback[this.state.cellN - 1].first_sector;
      var time = (this.state.pgc.cell_playback[this.state.cellN - 1].playback_time.hour >> 4) * 36000;
      time += (this.state.pgc.cell_playback[this.state.cellN - 1].playback_time.hour & 0x0F) * 3600;
      time += (this.state.pgc.cell_playback[this.state.cellN - 1].playback_time.minute >> 4) * 600;
      time += (this.state.pgc.cell_playback[this.state.cellN - 1].playback_time.minute & 0x0F) * 60;
      time += (this.state.pgc.cell_playback[this.state.cellN - 1].playback_time.second >> 4) * 10;
      time += (this.state.pgc.cell_playback[this.state.cellN - 1].playback_time.second & 0x0F);
      if (!time || size / time > 30) {
        // datarate is too high, it might be a very short, but regular cell
        return;
      }
      if (time > 0xFF) {
        time = 0xFF;
      }
      position.still = time;
    }

    return position;
  }

  public get_next_cell() {
    this.process_command(this.play_Cell_post());
  }


  // Jumping
  private jump_pg(pg) {
    this.state.pgN = pg;
    this.process_command(this.play_PG());
    return true;
  }

  private jump_cell_block(cell, block) {
    this.state.cellN = cell;
    this.process_command(this.play_Cell());
    // play_Cell can jump to a different cell in case of angles
    if (this.state.cellN === cell) {
      this.state.blockN = block;
    }
    return true;
  }

  private jump_title_program(title, pgcn, pgn) {
    var link;

    if (!this.set_PROG(title, pgcn, pgn)) {
      return false;
    }
    /* Some DVDs do not want us to jump directly into a title and have
     * PGC pre commands taking us back to some menu. Since we do not like that,
     * we do not execute PGC pre commands that would do a jump. */
    // this.process_command(this.play_PGC_PG(this.state.pgN));
    link = this.play_PGC_PG(this.state.pgN);
    if (link.command !== link_cmd.PlayThis) {
      // jump occured. ignore it and play the PG anyway
      this.process_command(this.play_PG());
    } else {
      this.process_command(link);
    }
    return true;
  }

  private jump_title_part(title, part) {
    var link;

    if (!this.set_PTT(title, part)) {
      return false;
    }
    /* Some DVDs do not want us to jump directly into a title and have
     * PGC pre commands taking us back to some menu. Since we do not like that,
     * we do not execute PGC pre commands that would do a jump. */
    // this.process_command(this.play_PGC_PG(this.state.pgN));
    link = this.play_PGC_PG(this.state.pgN);
    if (link.command !== link_cmd.PlayThis) {
      // jump occured. ignore it and play the PG anyway
      this.process_command(this.play_PG());
    } else {
      this.process_command(link);
    }
    return true;
  }

  private jump_top_pg() {
    this.process_command(this.play_PG());
    return true;
  }

  private jump_next_pg() {
    if (this.state.pgN >= this.state.pgc.nr_of_programs) {
      // last program. move to TailPGC
      this.process_command(this.play_PGC_post());
      return true;
    } else {
      this.jump_pg(this.state.pgN + 1);
      return true;
    }
  }

  private jump_prev_pg() {
    if (this.state.pgN <= 1) {
      // first program -> move to last program of previous PGC
      if (this.state.pgc.prev_pgc_nr && this.set_PGCN(this.state.pgc.prev_pgc_nr)) {
        this.process_command(this.play_PGC());
        this.jump_pg(this.state.pgc.nr_of_programs);
        return true;
      }
      return false;
    } else {
      this.jump_pg(this.state.pgN - 1);
      return true;
    }
  }

  private jump_up() {
    if (this.state.pgc.goup_pgc_nr && this.set_PGCN(this.state.pgc.goup_pgc_nr)) {
      this.process_command(this.play_PGC());
      return true;
    }
    return false;
  }

  private jump_menu(menuid) {
    var old_domain = this.state.domain;

    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        this.set_RSMinfo(0, this.state.blockN);
      // FALL THROUGH
      case DVDDomain.DVD_DOMAIN_VTSMenu:
      case DVDDomain.DVD_DOMAIN_VMGM:
        switch (menuid) {
          case DVDMenuID.DVD_MENU_Title:
          case DVDMenuID.DVD_MENU_Escape:
            if (this.vmgi === null || this.vmgi.pgci_ut === null) {
              return false;
            }
            this.state.domain = DVDDomain.DVD_DOMAIN_VMGM;
            break;
          case DVDMenuID.DVD_MENU_Root:
          case DVDMenuID.DVD_MENU_Subpicture:
          case DVDMenuID.DVD_MENU_Audio:
          case DVDMenuID.DVD_MENU_Angle:
          case DVDMenuID.DVD_MENU_Part:
            if (this.vtsi === null || this.vtsi.pgci_ut === null) {
              return false;
            }
            this.state.domain = DVDDomain.DVD_DOMAIN_VTSMenu;
            break;
        }
        if (this.get_PGCIT() && this.set_MENU(menuid)) {
          this.process_command(this.play_PGC());
          return true; // Jump
        } else {
          this.state.domain = old_domain;
        }
        break;
      case DVDDomain.DVD_DOMAIN_FirstPlay: // FIXME XXX $$$ What should we do here?
        break;
    }

    return false;
  }

  private jump_resume() {
    var link_values = new Link();
    link_values.command = link_cmd.LinkRSM;
    link_values.data1 = 0;
    link_values.data2 = 0;
    link_values.data3 = 0;

    if (!this.state.rsm_vtsN) { // Do we have resume info?
      return false;
    }
    if (!this.process_command(link_values)) {
      return false;
    }
    return true;
  }

  private exec_cmd(cmd) {
    var link_values = new Link();

    if (this.evalCMD(cmd, 1, link_values)) {
      return this.process_command(link_values);
    } else {
      return false; // It updated some state that's all...
    }
  }


  // getting information
  private get_current_menu(menuid) {
    var pgcn = this.state.pgcN;

    var pgcit = this.get_PGCIT();
    if (!pgcit) {
      return false;
    }

    menuid = pgcit.pgci_srp[pgcn - 1].entry_id & 0x0F;
    return true;
  }

  /**
   * @returns {Object.<string, number>}
   */
  private get_current_title_part(): TitlePart {
    var vts_ptt_srpt;
    var title, part = 0, vts_ttn;
    var found;
    var pgcN, pgN;

    vts_ptt_srpt = this.vtsi.vts_ptt_srpt;
    pgcN = this.get_PGCN();
    pgN = this.state.pgN;

    found = 0;
    for (vts_ttn = 0; (vts_ttn < vts_ptt_srpt.nr_of_srpts) && !found; vts_ttn++) {
      for (part = 0; (part < vts_ptt_srpt.title[vts_ttn].nr_of_ptts) && !found; part++) {
        if (vts_ptt_srpt.title[vts_ttn].ptt[part].pgcn === pgcN) {
          if (vts_ptt_srpt.title[vts_ttn].ptt[part].pgn === pgN) {
            found = 1;
            break;
          }
          if (part > 0 && vts_ptt_srpt.title[vts_ttn].ptt[part].pgn > pgN &&
            vts_ptt_srpt.title[vts_ttn].ptt[part - 1].pgn < pgN) {
            part--;
            found = 1;
            break;
          }
        }
      }
      if (found) {
        break;
      }
    }
    vts_ttn++;
    part++;

    if (!found) {
      console.error('jsdvdnav: Chapter not found!');
      return null;
    }

    title = this.get_TT(this.state.vtsN, vts_ttn);

    if (TRACE) {
      if (title) {
        console.log('jsdvdnav: This chapter found');
        console.log('jsdvdnav: VTS_PTT_SRPT - Title %3i part %3i: PGC: %3i PG: %3i',
          title, part,
          vts_ptt_srpt.title[vts_ttn - 1].ptt[part - 1].pgcn,
          vts_ptt_srpt.title[vts_ttn - 1].ptt[part - 1].pgn);
      }
    }

    return <TitlePart>{
      title: title,
      part: part
    };
  }

  /**
   * Return the substream id for 'logical' audio stream audioN.
   * 0 <= audioN < 8
   */
  private get_audio_stream(audioN) {
    var streamN = -1;

    if (this.state.domain !== DVDDomain.DVD_DOMAIN_VTSTitle)
      audioN = 0;

    if (audioN < 8) {
      // Is there any control info for this logical stream
      if (this.state.pgc.audio_control[audioN] & (1 << 15)) {
        streamN = (this.state.pgc.audio_control[audioN] >> 8) & 0x07;
      }
    }

    if (this.state.domain !== DVDDomain.DVD_DOMAIN_VTSTitle && streamN === -1)
      streamN = 0;

    // FIXME: Should also check in vtsi/vmgi status what kind of stream it is (ac3/lpcm/dts/sdds...)
    // to find the right (sub)stream id.
    return streamN;
  }

  /**
   * Return the substream id for 'logical' subpicture stream subpN and given mode.
   * 0 <= subpN < 32
   * mode === 0 - widescreen
   * mode === 1 - letterbox
   * mode === 2 - pan&scan
   */
  public get_subp_stream(subpN, mode) {
    var streamN = -1;
    var source_aspect = this.get_video_aspect();

    if (this.state.domain !== DVDDomain.DVD_DOMAIN_VTSTitle)
      subpN = 0;

    if (subpN < 32) { // a valid logical stream
      // Is this logical stream present
      if (this.state.pgc.subp_control[subpN] & (1 << 31)) {
        if (source_aspect === 0) // 4:3
          streamN = (this.state.pgc.subp_control[subpN] >> 24) & 0x1F;
        if (source_aspect === 3) // 16:9
          switch (mode) {
            case 0:
              streamN = (this.state.pgc.subp_control[subpN] >> 16) & 0x1F;
              break;
            case 1:
              streamN = (this.state.pgc.subp_control[subpN] >> 8) & 0x1F;
              break;
            case 2:
              streamN = this.state.pgc.subp_control[subpN] & 0x1F;
          }
      }
    }

    if (this.state.domain !== DVDDomain.DVD_DOMAIN_VTSTitle && streamN === -1)
      streamN = 0;

    // FIXME: Should also check in vtsi/vmgi status what kind of stream it is.
    return streamN;
  }

  public get_audio_active_stream() {
    var audioN = this.state.registers.SPRM[AST_REG];
    var streamN = this.get_audio_stream(audioN);

    // If no such stream, then select the first one that exists.
    if (streamN === -1) {
      for (audioN = 0; audioN < 8; audioN++) {
        if (this.state.pgc.audio_control[audioN] & (1 << 15)) {
          if ((streamN = this.get_audio_stream(audioN)) >= 0)
            break;
        }
      }
    }

    return streamN;
  }

  public get_subp_active_stream(mode) {
    var subpN = this.state.registers.SPRM[SPST_REG] & ~0x40;
    var streamN = this.get_subp_stream(subpN, mode);

    // If no such stream, then select the first one that exists.
    if (streamN === -1) {
      for (subpN = 0; subpN < 32; subpN++) {
        if (this.state.pgc.subp_control[subpN] & (1 << 31)) {
          if ((streamN = this.get_subp_stream(subpN, mode)) >= 0)
            break;
        }
      }
    }

    if (this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle && !(this.state.registers.SPRM[SPST_REG] & 0x40)) {
      // Bit 7 set means hide, and only let Forced display show.
      return (streamN | 0x80);
    } else {
      return streamN;
    }
  }

  public get_angle_info() {
    var current = 1;
    var num_avail = 1;

    if (this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle) {
      // TTN_REG does not always point to the correct title.
      if (this.state.registers.SPRM[TTN_REG] > this.vmgi.tt_srpt.nr_of_srpts) {
        return {current: current, num_avail: num_avail};
      }
      var title = this.vmgi.tt_srpt.title[this.state.registers.SPRM[TTN_REG] - 1];
      if (title.title_set_nr !== this.state.vtsN || title.vts_ttn !== this.state.registers.SPRM[VTS_TTN_REG]) {
        return {current: current, num_avail: num_avail};
      }
      current = this.state.registers.SPRM[AGL_REG];
      num_avail = title.nr_of_angles;
    }

    return {current: current, num_avail: num_avail};
  }

  // Currently unused
  private get_audio_info(current, num_avail) {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        num_avail = this.vtsi.vtsi_mat.nr_of_vts_audio_streams;
        current = this.state.registers.SPRM[AST_REG];
        break;
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        num_avail = this.vtsi.vtsi_mat.nr_of_vtsm_audio_streams; // 1
        current = 1;
        break;
      case DVDDomain.DVD_DOMAIN_VMGM:
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        num_avail = this.vmgi.vmgi_mat.nr_of_vmgm_audio_streams; // 1
        current = 1;
        break;
    }
  }

  // Currently unused
  private get_subp_info(current, num_avail) {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        num_avail = this.vtsi.vtsi_mat.nr_of_vts_subp_streams;
        current = this.state.registers.SPRM[SPST_REG];
        break;
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        num_avail = this.vtsi.vtsi_mat.nr_of_vtsm_subp_streams; // 1
        current = 0x41;
        break;
      case DVDDomain.DVD_DOMAIN_VMGM:
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        num_avail = this.vmgi.vmgi_mat.nr_of_vmgm_subp_streams; // 1
        current = 0x41;
        break;
    }
  }

  private get_video_res(width, height) {
    var attr = this.get_video_attr();

    if (attr.video_format !== 0)
      height = 576;
    else
      height = 480;
    switch (attr.picture_size) {
      case 0:
        width = 720;
        break;
      case 1:
        width = 704;
        break;
      case 2:
        width = 352;
        break;
      case 3:
        width = 352;
        height /= 2;
        break;
    }

    return [width, height];
  }

  private get_video_aspect() {
    var aspect = this.get_video_attr().display_aspect_ratio;

    assert(aspect === 0 || aspect === 3);
    this.state.registers.SPRM[14] &= ~(0x03 << 10);
    this.state.registers.SPRM[14] |= aspect << 10;

    return aspect;
  }

  private get_video_scale_permission() {
    return this.get_video_attr().permitted_df;
  }

  private get_video_attr() {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        return this.vtsi.vtsi_mat.vts_video_attr;
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        return this.vtsi.vtsi_mat.vtsm_video_attr;
      case DVDDomain.DVD_DOMAIN_VMGM:
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        return this.vmgi.vmgi_mat.vmgm_video_attr;
      default:
        this.abort();
        return 0;
    }
  }

  private get_audio_attr(streamN) {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        return this.vtsi.vtsi_mat.vts_audio_attr[streamN];
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        return this.vtsi.vtsi_mat.vtsm_audio_attr;
      case DVDDomain.DVD_DOMAIN_VMGM:
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        return this.vmgi.vmgi_mat.vmgm_audio_attr;
      default:
        this.abort();
        return 0;
    }
  }

  private get_subp_attr(streamN) {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        return this.vtsi.vtsi_mat.vts_subp_attr[streamN];
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        return this.vtsi.vtsi_mat.vtsm_subp_attr;
      case DVDDomain.DVD_DOMAIN_VMGM:
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        return this.vmgi.vmgi_mat.vmgm_subp_attr;
      default:
        this.abort();
        return 0;
    }
  }


  // Playback control
  private play_PGC() {
    var link_values = new Link();

    if (TRACE) {
      var msg = 'jsdvdnav: play_PGC:';
      if (this.state.domain !== DVDDomain.DVD_DOMAIN_FirstPlay) {
        //console.log(msg + ' this.state.pgcN (%i)', this.get_PGCN());
        console.log(msg + ' this.state.pgcN (%i)', this.state.pgcN); // Use a cached version.
      } else {
        console.log(msg + ' first_play_pgc');
      }
    }

    // This must be set before the pre-commands are executed because they might contain a CallSS
    // that will save resume state

    // FIXME: This may be only a temporary fix for something...
    this.state.pgN = 1;
    this.state.cellN = 0;
    this.state.blockN = 0;

    /* eval -> updates the state and returns either
     - some kind of jump (Jump(TT/SS/VTS_TTN/CallSS/link C/PG/PGC/PTTN)
     - just play video i.e first PG
     (This is what happens if you fall of the end of the pre_cmds)
     - or an error (are there more cases?) */
    if (this.state.pgc.command_tbl && this.state.pgc.command_tbl.nr_of_pre) {
      if (this.evalCMD(this.state.pgc.command_tbl.pre_cmds, this.state.pgc.command_tbl.nr_of_pre, link_values)) {
        // link_values contains the jump return value
        return link_values;
      } else if (TRACE) {
        console.log('jsdvdnav: PGC pre commands didn\'t do a Jump, Link or Call');
      }
    }
    return this.play_PG();
  }

  private play_PGC_PG(pgN) {
    var link_values = new Link();

    if (TRACE) {
      var msg = 'jsdvdnav: play_PGC_PG:';
      if (this.state.domain !== DVDDomain.DVD_DOMAIN_FirstPlay) {
        console.log(msg + ' this.state.pgcN (%i)', this.get_PGCN());
      } else {
        console.log(msg + ' first_play_pgc');
      }
    }

    // This must be set before the pre-commands are executed because they might contain a CallSS
    // that will save resume state

    // FIXME: This may be only a temporary fix for something...
    this.state.pgN = pgN;
    this.state.cellN = 0;
    this.state.blockN = 0;

    /* eval -> updates the state and returns either
     - some kind of jump (Jump(TT/SS/VTS_TTN/CallSS/link C/PG/PGC/PTTN)
     - just play video i.e first PG
     (This is what happens if you fall of the end of the pre_cmds)
     - or an error (are there more cases?) */
    if (this.state.pgc.command_tbl && this.state.pgc.command_tbl.nr_of_pre) {
      if (this.evalCMD(this.state.pgc.command_tbl.pre_cmds, this.state.pgc.command_tbl.nr_of_pre, link_values)) {
        // link_values contains the jump return value
        return link_values;
      } else if (TRACE) {
        console.log('jsdvdnav: PGC pre commands didn\'t do a Jump, Link or Call');
      }
    }
    return this.play_PG();
  }

  private play_PGC_post() {
    var link_values = new Link();
    link_values.command = link_cmd.LinkNoLink;
    link_values.data1 = 0;
    link_values.data2 = 0;
    link_values.data3 = 0;

    if (TRACE) {
      console.log('jsdvdnav: play_PGC_post:');
    }

    /* eval -> updates the state and returns either
     - some kind of jump (Jump(TT/SS/VTS_TTN/CallSS/link C/PG/PGC/PTTN)
     - just go to next PGC
     (This is what happens if you fall of the end of the post_cmds)
     - or an error (are there more cases?) */
    if (this.state.pgc.command_tbl && this.state.pgc.command_tbl.nr_of_post &&
      this.evalCMD(this.state.pgc.command_tbl.post_cmds, this.state.pgc.command_tbl.nr_of_post, link_values)) {
      return link_values;
    } else if (TRACE) {
      console.error('jsdvdnav: Fell of the end of the pgc, continuing in NextPGC');
    }
    // Should end up in the STOP_DOMAIN if next_pgc is 0.
    if (!this.set_PGCN(this.state.pgc.next_pgc_nr)) {
      link_values.command = link_cmd.Exit;
      return link_values;
    }
    return this.play_PGC();
  }

  private play_PG() {
    if (TRACE) {
      console.log('jsdvdnav: play_PG: this.state.pgN (%i)', this.state.pgN);
    }

    assert(this.state.pgN > 0);
    if (this.state.pgN > this.state.pgc.nr_of_programs) {
      if (TRACE) {
        console.log('jsdvdnav: play_PG: this.state.pgN (%i) > pgc.nr_of_programs (%i)', this.state.pgN, this.state.pgc.nr_of_programs);
      }
      assert(this.state.pgN === this.state.pgc.nr_of_programs + 1);
      return this.play_PGC_post();
    }

    this.state.cellN = this.state.pgc.program_map[this.state.pgN - 1];

    return this.play_Cell();
  }

  private play_Cell() {
    var play_this = new Link();
    play_this.command = link_cmd.PlayThis;

    if (TRACE) {
      console.log('jsdvdnav: play_Cell: this.state.cellN (%i)', this.state.cellN);
    }

    assert(this.state.cellN > 0);
    if (this.state.cellN > this.state.pgc.nr_of_cells) {
      if (TRACE) {
        console.log('jsdvdnav: this.state.cellN (%i) > pgc.nr_of_cells (%i)',
          this.state.cellN, this.state.pgc.nr_of_cells);
      }
      assert(this.state.cellN === this.state.pgc.nr_of_cells + 1);
      return this.play_PGC_post();
    }

    // Multi angle/Interleaved
    switch (this.state.pgc.cell_playback[this.state.cellN - 1].block_mode) {
      case 0: // Normal
        assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_type === 0);
        break;
      case 1: // The first cell in the block
        switch (this.state.pgc.cell_playback[this.state.cellN - 1].block_type) {
          case 0: // Not part of a block
            assert(0);
            break;
          case 1: // Angle block
            // Loop and check each cell instead? So we don't get outside the block?
            this.state.cellN += this.state.registers.SPRM[AGL_REG] - 1;
            if (false) {
              assert(this.state.cellN <= this.state.pgc.nr_of_cells);
              assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_mode !== 0);
              assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_type === 1);
            } else {
              if (!(this.state.cellN <= this.state.pgc.nr_of_cells) || !(this.state.pgc.cell_playback[this.state.cellN - 1].block_mode !== 0) || !(this.state.pgc.cell_playback[this.state.cellN - 1].block_type === 1)) {
                console.error('jsdvdnav: Invalid angle block');
                this.state.cellN -= this.state.registers.SPRM[AGL_REG] - 1;
              }
            }
            break;
          case 2: // ??
          case 3: // ??
          default:
            console.error('jsdvdnav: Invalid? Cell block_mode (%d), block_type (%d)',
              this.state.pgc.cell_playback[this.state.cellN - 1].block_mode,
              this.state.pgc.cell_playback[this.state.cellN - 1].block_type);
            assert(0);
        }
        break;
      case 2: // Cell in the block
      case 3: // Last cell in the block
      // These might perhaps happen for RSM or LinkC commands?
      default:
        console.error('jsdvdnav: Cell is in block but did not enter at first cell!');
        break;
    }

    // Updates this.state.pgN and PTTN_REG
    if (!this.set_PGN()) {
      // Should not happen
      assert(0);
      return this.play_PGC_post();
    }
    this.state.cell_restart++;
    this.state.blockN = 0;
    if (TRACE) {
      console.log('jsdvdnav: Cell should restart here');
    }
    return play_this;
  }

  private play_Cell_post() {
    var cell;

    if (TRACE) {
      console.log('jsdvdnav: play_Cell_post: this.state.cellN (%i)', this.state.cellN);
    }

    cell = this.state.pgc.cell_playback[this.state.cellN - 1];

    // Still time is already taken care of before we get called.

    // Deal with a Cell command, if any
    if (cell.cell_cmd_nr !== 0) {
      var link_values = new Link();

      if (this.state.pgc.command_tbl !== null && this.state.pgc.command_tbl.nr_of_cell >= cell.cell_cmd_nr) {
        if (TRACE) {
          console.log('jsdvdnav: Cell command present, executing');
        }
        if (this.evalCMD(this.state.pgc.command_tbl.cell_cmds[cell.cell_cmd_nr - 1], 1, link_values)) {
          return link_values;
        } else if (TRACE) {
          console.log('jsdvdnav: Cell command didn\'t do a Jump, Link or Call');
        }
      } else if (TRACE) {
        console.error('jsdvdnav: Invalid cell command');
      }
    }

    // Where to continue after playing the cell...
    // Multi angle/Interleaved
    switch (this.state.pgc.cell_playback[this.state.cellN - 1].block_mode) {
      case 0: // Normal
        assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_type === 0);
        this.state.cellN++;
        break;
      case 1: // The first cell in the block
      case 2: // A cell in the block
      case 3: // The last cell in the block
      default:
        switch (this.state.pgc.cell_playback[this.state.cellN - 1].block_type) {
          case 0: // Not part of a block
            assert(0);
            break;
          case 1: // Angle block
            // Skip the other angles
            this.state.cellN++;
            while (this.state.cellN <= this.state.pgc.nr_of_cells &&
              this.state.pgc.cell_playback[this.state.cellN - 1].block_mode >= 2) {
              this.state.cellN++;
            }
            break;
          case 2: // ??
          case 3: // ??
          default:
            console.error('jsdvdnav: Invalid? Cell block_mode (%d), block_type (%d)',
              this.state.pgc.cell_playback[this.state.cellN - 1].block_mode,
              this.state.pgc.cell_playback[this.state.cellN - 1].block_type);
            assert(0);
            break;
        }
        break;
    }

    // Figure out the correct pgN for the new cell
    if (!this.set_PGN()) {
      if (TRACE) {
        console.log('jsdvdnav: last cell in this PGC');
      }
      return this.play_PGC_post();
    }
    return this.play_Cell();
  }


  // link processing
  private process_command(link_values) {
    while (link_values.command !== link_cmd.PlayThis) {
      if (TRACE) {
        console.group('Process command');
        this.print_link(link_values);
        console.log('jsdvdnav: Link values', link_values.command, link_values.data1, link_values.data2, link_values.data3);
        this.print_current_domain_state();
        console.groupEnd();
      }

      switch (link_values.command) {
        case link_cmd.LinkNoLink:
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          return false;  // no actual jump
        case link_cmd.LinkTopC:
          // Restart playing from the beginning of the current Cell.
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          link_values = this.play_Cell();
          break;
        case link_cmd.LinkNextC:
          // Link to Next Cell
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          this.state.cellN += 1;
          link_values = this.play_Cell();
          break;
        case link_cmd.LinkPrevC:
          // Link to Previous Cell
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          assert(this.state.cellN > 1);
          this.state.cellN -= 1;
          link_values = this.play_Cell();
          break;
        case link_cmd.LinkTopPG:
          // Link to Top of current Program
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          link_values = this.play_PG();
          break;
        case link_cmd.LinkNextPG:
          // Link to Next Program
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          this.state.pgN += 1;
          link_values = this.play_PG();
          break;
        case link_cmd.LinkPrevPG:
          // Link to Previous Program
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          assert(this.state.pgN > 1);
          this.state.pgN -= 1;
          link_values = this.play_PG();
          break;
        case link_cmd.LinkTopPGC:
          // Restart playing from beginning of current Program Chain
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          link_values = this.play_PGC();
          break;
        case link_cmd.LinkNextPGC:
          // Link to Next Program Chain
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          assert(this.state.pgc.next_pgc_nr !== 0);
          if (this.set_PGCN(this.state.pgc.next_pgc_nr))
            link_values = this.play_PGC();
          else
            link_values.command = link_cmd.Exit;
          break;
        case link_cmd.LinkPrevPGC:
          // Link to Previous Program Chain
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          assert(this.state.pgc.prev_pgc_nr !== 0);
          if (this.set_PGCN(this.state.pgc.prev_pgc_nr))
            link_values = this.play_PGC();
          else
            link_values.command = link_cmd.Exit;
          break;
        case link_cmd.LinkGoUpPGC:
          // Link to GoUp Program Chain
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          assert(this.state.pgc.goup_pgc_nr !== 0);
          if (this.set_PGCN(this.state.pgc.goup_pgc_nr))
            link_values = this.play_PGC();
          else
            link_values.command = link_cmd.Exit;
          break;
        case link_cmd.LinkTailPGC:
          // Link to Tail of Program Chain
          // BUTTON number:data1
          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;
          link_values = this.play_PGC_post();
          break;
        case link_cmd.LinkRSM:
          // Link to Resume point
          var i;

          // Check and see if there is any rsm info!!
          if (!this.state.rsm_vtsN) {
            console.error('jsdvdnav: Trying to resume without any resume info set');
            link_values.command = link_cmd.Exit;
            break;
          }

          this.state.domain = DVDDomain.DVD_DOMAIN_VTSTitle;
          if (!this.ifoOpenNewVTSI(this.state.rsm_vtsN))
            assert(0);
          this.set_PGCN(this.state.rsm_pgcN);

          // These should never be set in SystemSpace and/or MenuSpace
          // this.state.registers.SPRM[TTN_REG] = rsm_tt; ??
          // this.state.registers.SPRM[TT_PGCN_REG] = this.state.rsm_pgcN; ??
          for (i = 0; i < 5; i++) {
            this.state.registers.SPRM[4 + i] = this.state.rsm_regs[i];
          }

          if (link_values.data1 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data1 << 10;

          if (this.state.rsm_cellN === 0) {
            assert(this.state.cellN); // Checking if this ever happens
            this.state.pgN = 1;
            link_values = this.play_PG();
          } else {
            // this.state.pgN = ?? this gets the right value in set_PGN() below
            this.state.cellN = this.state.rsm_cellN;
            link_values.command = link_cmd.PlayThis;
            link_values.data1 = this.state.rsm_blockN & 0xFFFF;
            link_values.data2 = this.state.rsm_blockN >> 16;
            if (!this.set_PGN()) {
              // Were at the end of the PGC, should not happen for a RSM
              assert(0);
              link_values.command = link_cmd.LinkTailPGC;
              link_values.data1 = 0;  // No button
            }
          }
          break;
        case link_cmd.LinkPGCN:
          // Link to Program Chain Number:data1
          if (!this.set_PGCN(link_values.data1))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.LinkPTTN:
          // Link to Part of current Title Number:data1
          // BUTTON number:data2
          // PGC Pre-Commands are not executed
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle);
          if (link_values.data2 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data2 << 10;
          if (!this.set_VTS_PTT(this.state.vtsN, this.state.registers.SPRM[VTS_TTN_REG], link_values.data1))
            link_values.command = link_cmd.Exit;
          else
            link_values = this.play_PG();
          break;
        case link_cmd.LinkPGN:
          // Link to Program Number:data1
          // BUTTON number:data2
          if (link_values.data2 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data2 << 10;
          // Update any other state, PTTN perhaps?
          this.state.pgN = link_values.data1;
          link_values = this.play_PG();
          break;
        case link_cmd.LinkCN:
          // Link to Cell Number:data1
          // BUTTON number:data2
          if (link_values.data2 !== 0)
            this.state.registers.SPRM[HL_BTNN_REG] = link_values.data2 << 10;
          // Update any other state, pgN, PTTN perhaps?
          this.state.cellN = link_values.data1;
          link_values = this.play_Cell();
          break;
        case link_cmd.Exit:
          this.stopped = true;
          return false;
        case link_cmd.JumpTT:
          // Jump to VTS Title Domain
          // Only allowed from the First Play domain(PGC)
          // or the Video Manager domain (VMG)
          // Stop SPRM9 Timer
          // Set SPRM1 and SPRM2
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VMGM || this.state.domain === DVDDomain.DVD_DOMAIN_FirstPlay); // ??
          if (this.set_TT(link_values.data1))
            link_values = this.play_PGC();
          else
            link_values.command = link_cmd.Exit;
          break;
        case link_cmd.JumpVTS_TT:
          // Jump to Title:data1 in same VTS Title Domain
          // Only allowed from the VTS Menu Domain(VTSM)
          // or the Video Title Set Domain(VTS)
          // Stop SPRM9 Timer
          // Set SPRM1 and SPRM2
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSMenu || this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          if (!this.set_VTS_TT(this.state.vtsN, link_values.data1))
            link_values.command = link_cmd.Exit;
          else
            link_values = this.play_PGC();
          break;
        case link_cmd.JumpVTS_PTT:
          // Jump to Part:data2 of Title:data1 in same VTS Title Domain
          // Only allowed from the VTS Menu Domain(VTSM)
          // or the Video Title Set Domain(VTS)
          // Stop SPRM9 Timer
          // Set SPRM1 and SPRM2
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSMenu || this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          if (!this.set_VTS_PTT(this.state.vtsN, link_values.data1, link_values.data2))
            link_values.command = link_cmd.Exit;
          else
            link_values = this.play_PGC_PG(this.state.pgN);
          break;
        case link_cmd.JumpSS_FP:
          // Jump to First Play Domain
          // Only allowed from the VTS Menu Domain(VTSM)
          // or the Video Manager domain (VMG)
          // Stop SPRM9 Timer and any GPRM counters
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VMGM || this.state.domain === DVDDomain.DVD_DOMAIN_VTSMenu); // ??
          if (!this.set_FP_PGC())
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.JumpSS_VMGM_MENU:
          // Jump to Video Manager domain - Title Menu:data1 or any PGC in VMG
          // Allowed from anywhere except the VTS Title domain
          // Stop SPRM9 Timer and any GPRM counters
          assert(this.state.domain !== DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          if (this.vmgi === null || this.vmgi.pgci_ut === null) {
            link_values.command = link_cmd.Exit;
            break;
          }
          this.state.domain = DVDDomain.DVD_DOMAIN_VMGM;
          if (!this.set_MENU(link_values.data1))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.JumpSS_VTSM:
          // Jump to a menu in Video Title domain,
          // or to a Menu is the current VTS
          // Stop SPRM9 Timer and any GPRM counters
          // ifoOpenNewVTSI:data1
          // VTS_TTN_REG:data2
          // get_MENU:data3
          if (link_values.data1 !== 0) {
            if (link_values.data1 !== this.state.vtsN) {
              // the normal case
              assert(this.state.domain === DVDDomain.DVD_DOMAIN_VMGM || this.state.domain === DVDDomain.DVD_DOMAIN_FirstPlay); // ??
              if (!this.ifoOpenNewVTSI(link_values.data1))  // Also sets this.state.vtsN
                assert(0);
              if (this.vtsi === null || this.vtsi.pgci_ut === null) {
                link_values.command = link_cmd.Exit;
                break;
              }
              this.state.domain = DVDDomain.DVD_DOMAIN_VTSMenu;
            } else {
              // This happens on some discs like `Captain Scarlet & the Mysterons` or the German RC2
              // of `Anatomie` in VTSM.
              assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSMenu ||
                this.state.domain === DVDDomain.DVD_DOMAIN_VMGM || this.state.domain === DVDDomain.DVD_DOMAIN_FirstPlay); // ??
              if (this.vtsi === null || this.vtsi.pgci_ut === null) {
                link_values.command = link_cmd.Exit;
                break;
              }
              this.state.domain = DVDDomain.DVD_DOMAIN_VTSMenu;
            }
          } else {
            // This happens on `The Fifth Element` region 2.
            assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSMenu);
          }
          // I don't know what title is supposed to be used for.
          // `Alien` or `Aliens` has this !== 1, I think.
          // assert(link_values.data2 === 1);
          this.state.registers.SPRM[VTS_TTN_REG] = link_values.data2;
          // TTN_REG (SPRM4), VTS_TTN_REG (SPRM5), TT_PGCN_REG (SPRM6) are linked,
          // so if one changes, the others must change to match it.
          this.state.registers.SPRM[TTN_REG] = this.get_TT(this.state.vtsN, this.state.registers.SPRM[VTS_TTN_REG]);
          if (!this.set_MENU(link_values.data3))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.JumpSS_VMGM_PGC:
          // set_PGCN:data1
          // Stop SPRM9 Timer and any GPRM counters
          assert(this.state.domain !== DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          if (this.vmgi === null || this.vmgi.pgci_ut === null) {
            link_values.command = link_cmd.Exit;
            break;
          }
          this.state.domain = DVDDomain.DVD_DOMAIN_VMGM;
          if (!this.set_PGCN(link_values.data1))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.CallSS_FP:
          // set_RSMinfo:data1
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          // Must be called before domain is changed
          this.set_RSMinfo(link_values.data1, /* We don't have block info */ 0);
          this.set_FP_PGC();
          link_values = this.play_PGC();
          break;
        case link_cmd.CallSS_VMGM_MENU:
          // set_MENU:data1
          // set_RSMinfo:data2
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          // Must be called before domain is changed
          if (this.vmgi === null || this.vmgi.pgci_ut === null) {
            link_values.command = link_cmd.Exit;
            break;
          }
          this.set_RSMinfo(link_values.data2, /* We don't have block info */ 0);
          this.state.domain = DVDDomain.DVD_DOMAIN_VMGM;
          if (!this.set_MENU(link_values.data1))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.CallSS_VTSM:
          // set_MENU:data1
          // set_RSMinfo:data2
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          // Must be called before domain is changed
          if (this.vtsi === null || this.vtsi.pgci_ut === null) {
            link_values.command = link_cmd.Exit;
            break;
          }
          this.set_RSMinfo(link_values.data2, /* We don't have block info */ 0);
          this.state.domain = DVDDomain.DVD_DOMAIN_VTSMenu;
          if (!this.set_MENU(link_values.data1))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.CallSS_VMGM_PGC:
          // set_PGC:data1
          // set_RSMinfo:data2
          assert(this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle); // ??
          // Must be called before domain is changed
          if (this.vmgi === null || this.vmgi.pgci_ut === null) {
            link_values.command = link_cmd.Exit;
            break;
          }
          this.set_RSMinfo(link_values.data2, /* We don't have block info */ 0);
          this.state.domain = DVDDomain.DVD_DOMAIN_VMGM;
          if (!this.set_PGCN(link_values.data1))
            assert(0);
          link_values = this.play_PGC();
          break;
        case link_cmd.PlayThis:
          // Should never happen.
          assert(0);
          break;
      }

      if (TRACE) {
        console.group('Current domain state');
        this.print_current_domain_state();
        console.groupEnd();
      }
    }

    this.state.blockN = link_values.data1 | (link_values.data2 << 16);
    return true;
  }


  // Set functions
  private set_TT(tt) {
    return this.set_PTT(tt, 1);
  }

  private set_PTT(tt, ptt) {
    assert(tt <= this.vmgi.tt_srpt.nr_of_srpts);
    return this.set_VTS_PTT(this.vmgi.tt_srpt.title[tt - 1].title_set_nr,
      this.vmgi.tt_srpt.title[tt - 1].vts_ttn, ptt);
  }

  private set_VTS_TT(vtsN, vts_ttn) {
    return this.set_VTS_PTT(vtsN, vts_ttn, 1);
  }

  private set_VTS_PTT(vtsN, vts_ttn, part) {
    var pgcN, pgN, res;

    this.state.domain = DVDDomain.DVD_DOMAIN_VTSTitle;

    if (vtsN !== this.state.vtsN)
      if (!this.ifoOpenNewVTSI(vtsN))  // Also sets this.state.vtsN
        return false;

    if ((vts_ttn < 1) || (vts_ttn > this.vtsi.vts_ptt_srpt.nr_of_srpts) ||
      (part < 1) || (part > this.vtsi.vts_ptt_srpt.title[vts_ttn - 1].nr_of_ptts)) {
      return false;
    }

    pgcN = this.vtsi.vts_ptt_srpt.title[vts_ttn - 1].ptt[part - 1].pgcn;
    pgN = this.vtsi.vts_ptt_srpt.title[vts_ttn - 1].ptt[part - 1].pgn;

    this.state.registers.SPRM[TT_PGCN_REG] = pgcN;
    this.state.registers.SPRM[PTTN_REG] = part;
    this.state.registers.SPRM[TTN_REG] = this.get_TT(vtsN, vts_ttn);
    if ((this.state.registers.SPRM[TTN_REG]) === 0)
      return false;

    this.state.registers.SPRM[VTS_TTN_REG] = vts_ttn;
    this.state.vtsN = vtsN;  // Not sure about this one. We can get to it easily from TTN_REG
    // Any other registers?

    res = this.set_PGCN(pgcN); // This clobber's state.pgN (sets it to 1), but we don't want clobbering here.
    this.state.pgN = pgN;
    return res;
  }

  private set_PROG(tt, pgcn, pgn) {
    assert(tt <= this.vmgi.tt_srpt.nr_of_srpts);
    return this.set_VTS_PROG(this.vmgi.tt_srpt.title[tt - 1].title_set_nr,
      this.vmgi.tt_srpt.title[tt - 1].vts_ttn, pgcn, pgn);
  }

  private set_VTS_PROG(vtsN, vts_ttn, pgcn, pgn) {
    var pgcN, pgN, res, title, part = 0;

    this.state.domain = DVDDomain.DVD_DOMAIN_VTSTitle;

    if (vtsN !== this.state.vtsN)
      if (!this.ifoOpenNewVTSI(vtsN))  // Also sets this.state.vtsN
        return false;

    if ((vts_ttn < 1) || (vts_ttn > this.vtsi.vts_ptt_srpt.nr_of_srpts)) {
      return false;
    }

    pgcN = pgcn;
    pgN = pgn;

    this.state.registers.SPRM[TT_PGCN_REG] = pgcN;
    this.state.registers.SPRM[TTN_REG] = this.get_TT(vtsN, vts_ttn);
    assert((this.state.registers.SPRM[TTN_REG]) !== 0);
    this.state.registers.SPRM[VTS_TTN_REG] = vts_ttn;
    this.state.vtsN = vtsN;  // Not sure about this one. We can get to it easily from TTN_REG
    // Any other registers?

    res = this.set_PGCN(pgcN);   // This clobber's state.pgN (sets it to 1), but we don't want clobbering here.
    this.state.pgN = pgN;
    var obj = this.get_current_title_part();
    title = obj.title;
    part = obj.part;
    this.state.registers.SPRM[PTTN_REG] = part;
    return res;
  }

  private set_FP_PGC() {
    this.state.domain = DVDDomain.DVD_DOMAIN_FirstPlay;
    if (!this.vmgi.first_play_pgc) {
      return this.set_PGCN(1);
    }
    this.state.pgc = this.vmgi.first_play_pgc;
    this.state.pgcN = this.vmgi.vmgi_mat.first_play_pgc;
    return true;
  }

  private set_MENU(menu) {
    assert(this.state.domain === DVDDomain.DVD_DOMAIN_VMGM || this.state.domain === DVDDomain.DVD_DOMAIN_VTSMenu);
    return this.set_PGCN(this.get_ID(menu));
  }

  private set_PGCN(pgcN) {
    var pgcit = this.get_PGCIT();
    if (!pgcit)
      return false;

    if (pgcN < 1 || pgcN > pgcit.nr_of_pgci_srp) {
      if (TRACE) {
        console.log('pgcit', pgcit);
        console.error('jsdvdnav: No such pgcN = %d', pgcN);
        debugger;
      }
      return false;
    }

    this.state.pgc = pgcit.pgci_srp[pgcN - 1].pgc;
    this.state.pgcN = pgcN;
    this.state.pgN = 1;

    if (this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle)
      this.state.registers.SPRM[TT_PGCN_REG] = pgcN;

    return true;
  }

  // Figure out the correct pgN from the cell and update this.state.
  private set_PGN() {
    var new_pgN = 0;
    var dummy, part = 0;

    while (new_pgN < this.state.pgc.nr_of_programs
      && this.state.cellN >= this.state.pgc.program_map[new_pgN]) {
      new_pgN++;
    }

    if (new_pgN === this.state.pgc.nr_of_programs) { // We are at the last program
      if (this.state.cellN > this.state.pgc.nr_of_cells) {
        return false; // We are past the last cell
      }
    }

    this.state.pgN = new_pgN;

    if (this.state.domain === DVDDomain.DVD_DOMAIN_VTSTitle) {
      if (this.state.registers.SPRM[TTN_REG] > this.vmgi.tt_srpt.nr_of_srpts) {
        return false; // ??
      }

      var obj = this.get_current_title_part();
      dummy = obj.title;
      part = obj.part;
      this.state.registers.SPRM[PTTN_REG] = part;
    }
    return true;
  }

  // Must be called before domain is changed (set_PGCN())
  private set_RSMinfo(cellN, blockN) {
    var i;

    if (cellN) {
      this.state.rsm_cellN = cellN;
      this.state.rsm_blockN = blockN;
    } else {
      this.state.rsm_cellN = this.state.cellN;
      this.state.rsm_blockN = blockN;
    }
    this.state.rsm_vtsN = this.state.vtsN;
    this.state.rsm_pgcN = this.get_PGCN();

    // assert(this.state.rsm_pgcN === this.state.registers.SPRM[TT_PGCN_REG]);  for DVDDomain.DVD_DOMAIN_VTSTitle

    for (i = 0; i < 5; i++) {
      this.state.rsm_regs[i] = this.state.registers.SPRM[4 + i];
    }
  }


  // Get functions
  /**
   * Searches the TT tables, to find the current TT.
   * returns the current TT.
   * returns 0 if not found.
   */
  private get_TT(vtsN, vts_ttn) {
    var i;
    var tt = 0;

    for (i = 1; i <= this.vmgi.tt_srpt.nr_of_srpts; i++) {
      if (this.vmgi.tt_srpt.title[i - 1].title_set_nr === vtsN &&
        this.vmgi.tt_srpt.title[i - 1].vts_ttn === vts_ttn) {
        tt = i;
        break;
      }
    }
    return tt;
  }

  /**
   * Search for entry_id match of the PGC Category in the current VTS PGCIT table.
   * Return pgcN based on entry_id match.
   *
   * @param {number} id
   * @return {number}
   */
  private get_ID(id): number {
    var pgcN = 0, i = 0;

    // Relies on state to get the correct pgcit.
    var pgcit = this.get_PGCIT();
    assert(pgcit);
    if (TRACE) {
      console.log('jsdvdnav: Searching for menu (%s) entry PGC', utils.toHex(id));
    }

    // Force high bit set.
    id |= 0x80;

    // Get menu/title
    for (i = 0; i < pgcit.nr_of_pgci_srp; i++) {
      if ((pgcit.pgci_srp[i].entry_id) === id) {
        pgcN = i + 1;
        if (TRACE) {
          console.log('jsdvdnav: Found menu.');
        }
        return pgcN;
      }
    }
    if (TRACE) {
      console.error('jsdvdnav: No such id/menu (%s) entry PGC', utils.toHex(id & 0x7F));
      for (i = 0; i < pgcit.nr_of_pgci_srp; i++) {
        if ((pgcit.pgci_srp[i].entry_id & 0x80) === 0x80) {
          console.log('jsdvdnav: Available menus: %s',
            utils.toHex(pgcit.pgci_srp[i].entry_id & 0x7F));
        }
      }
    }
    return 0; // error
  }

  /**
   * FIXME: we have a pgcN member in the VM's state now, so this should be obsolete
   * @return {number}
   */
  private get_PGCN(): number {
    var pgcN = 1;

    var pgcit = this.get_PGCIT();
    if (pgcit) {
      while (pgcN <= pgcit.nr_of_pgci_srp) {
        if (deepEqual(pgcit.pgci_srp[pgcN - 1].pgc, this.state.pgc)) {
          return pgcN;
        }
        pgcN++;
      }
    }

    console.error('jsdvdnav: get_PGCN failed. Was trying to find pgcN in domain %d', this.state.domain);
    return 0; // error
  }

  private get_MENU_PGCIT(h, lang) {
    var i;

    if (h === null || h.pgci_ut === null) {
      console.error('jsdvdnav: pgci_ut handle is null');
      return null; // error?
    }

    i = 0;
    while (i < h.pgci_ut.nr_of_lus && h.pgci_ut.lu[i].lang_code !== lang) {
      i++;
    }
    if (i === h.pgci_ut.nr_of_lus) {
      console.log('jsdvdnav: Language `%s` not found, using `%s` instead', utils.bit2str(lang), utils.bit2str(h.pgci_ut.lu[0].lang_code));
      var msg = 'jsdvdnav: Menu Languages available: ';
      for (i = 0; i < h.pgci_ut.nr_of_lus; i++) {
        msg += sprintf('%s ', utils.bit2str(h.pgci_ut.lu[i].lang_code));
      }
      console.log(msg);
      i = 0; // error?
    }

    return h.pgci_ut.lu[i].pgcit;
  }

  // Uses state to decide what to return
  private get_PGCIT() {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        if (!this.vtsi) return null;
        return this.vtsi.vts_pgcit;
        break;
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        if (!this.vtsi) return null;
        return this.get_MENU_PGCIT(this.vtsi, this.state.registers.SPRM[0] | this.state.registers.SPRM[1] << 8);
        break;
      case DVDDomain.DVD_DOMAIN_VMGM:
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        return this.get_MENU_PGCIT(this.vmgi, this.state.registers.SPRM[0] | this.state.registers.SPRM[1] << 8);
        break;
      default:
        this.abort();
        return null;
    }
  }

  //return the ifo_handle_t describing required title, used to
  //identify chapters
  private get_title_ifo(title) {
    var titleset_nr;
    if ((title < 1) || (title > this.vmgi.tt_srpt.nr_of_srpts)) {
      return null;
    }
    titleset_nr = this.vmgi.tt_srpt.title[title - 1].title_set_nr;
    return ifoRead.ifoOpen(this.dvd, titleset_nr);
  }


  /**
   * The big VM function, executing the given commands and writing
   * the link where to continue, the return value indicates if a jump
   * has been performed.
   * Evaluate a set of commands in the given register set (which is modified).
   *
   * @param {vm_cmd_t} commands
   * @param {number} num_commands
   * @param {Link} return_values
   * @return {boolean} Whether a Jump, Link or Call just happened.
   */
  private evalCMD(commands, num_commands: number, return_values: Link): boolean {
    var i = 0;
    var total = 0;

    if (TRACE) {
      console.group('Registers before transaction');
      this.print_registers();
      console.log('jsdvdnav: Full list of commands to execute');
      for (i = 0; i < num_commands; i++) {
        console.log(this.print_cmd(i, commands[i]));
      }
      console.groupEnd();
      console.log('jsdvdnav: --------------------------------------------');
      console.group('Single stepping commands');
    }

    i = 0;
    while (i < num_commands && total < 100000) {
      var line;

      if (TRACE) {
        console.log(this.print_cmd(i, commands[i]));
      }

      line = this.eval_command(commands[i].bytes, return_values);

      if (line < 0) { // Link command
        if (TRACE) {
          console.groupEnd(); // Closing Single stepping commands.
          console.group('Registers after transaction');
          this.print_registers();
          console.groupEnd();
          console.log('jsdvdnav: eval: Doing Link/Jump/Call');
        }
        return true;
      }

      if (line > 0) { // Goto command
        i = line - 1;
      } else { // Just continue on the next line
        i++;
      }

      total++;
    }

    //memset(return_values, 0, sizeof(Link));
    return_values.command = link_cmd.LinkNoLink;
    return_values.data1 = 0;
    return_values.data2 = 0;
    return_values.data3 = 0;

    if (TRACE) {
      console.groupEnd(); // Closing Single stepping commands.
      console.group('jsdvdnav: Registers after transaction');
      this.print_registers();
      console.groupEnd();
    }
    return false;
  }

  /**
   * Extracts some bits from the command.
   *
   * @param {Command} command (passed as reference).
   * @param {number} start
   * @param {number} count
   * @return {number}
   */
  private getbits(command: Command, start: number, count: number): number {
    var result = 0;
    var bit_mask = 0;
    var examining = 0;
    var bits = 0;

    if (count === 0) return 0;

    if (((start - count) < -1) ||
      (count < 0) ||
      (start < 0) ||
      (count > 32) ||
      (start > 63)) {
      console.log('jsdvdnav: Bad call to VM#getbits(). Parameter out of range.');
      this.abort();
      return 0;
    }
    // all ones, please
    /*bit_mask = ~bit_mask;
     bit_mask >>= 63 - start;
     bits = start + 1 - count;
     examining = ((bit_mask >> bits) << bits );
     command.examined |= examining;
     result = (command.instruction & bit_mask) >> bits;*/

    result = Number(parseInt(command.instruction.substr(63 - start, count), 2).toString(10));

    return result;
  }

  private get_GPRM(registers, reg) {
    if (registers.GPRM_mode[reg] & 0x01) {
      // Counter mode
      // console.log('jsdvdnav: Getting counter %d',reg);
      var time_offset = performance.now() - registers.GPRM_time[reg];
      var result = time_offset & 0xFFFF;
      registers.GPRM[reg] = result;
      return result;
    } else {
      // Register mode
      return registers.GPRM[reg];
    }
  }

  private set_GPRM(registers, reg, value) {
    if (registers.GPRM_mode[reg] & 0x01) {
      // Counter mode
      // console.log('jsdvdnav: Setting counter %d',reg);
      var current_time = performance.now();
      registers.GPRM_time[reg] = current_time;
      registers.GPRM_time[reg] -= value;
    }
    registers.GPRM[reg] = value;
  }

  /**
   * Eval register code, can either be system or general register.
   * SXXX_XXXX, where S is 1 if it is system register.
   *
   * @param {Command} command
   * @param {number} reg
   * @return {number}
   */
  private eval_reg(command: Command, reg: number): number {
    if (reg & 0x80) {
      if ((reg & 0x1F) === 20) {
        console.log('jsdvdnav: Suspected RCE Region Protection!!!');
      }
      return command.registers.SPRM[reg & 0x1F];
      // FIXME max 24 not 32
    } else {
      return this.get_GPRM(command.registers, reg & 0x0F);
    }
  }

  /**
   * Eval register or immediate data.
   * AAAA_AAAA BBBB_BBBB, if immediate use all 16 bits for data else use
   * lower eight bits for the system or general purpose register.
   *
   * @param {Command} command
   * @param {number} imm
   * @param {number} start
   * @return {number}
   */
  private eval_reg_or_data(command: Command, imm: number, start: number): number {
    if (imm) { // immediate
      return this.getbits(command, start, 16);
    } else {
      return this.eval_reg(command, this.getbits(command, (start - 8), 8));
    }
  }

  /**
   * Eval register or immediate data.
   * xBBB_BBBB, if immediate use all 7 bits for data else use
   * lower four bits for the general purpose register number.
   *
   * @param {Command} command
   * @param {number} imm
   * @param {number} start
   * @return {number}
   */
    // Evaluates gprm or data depending on bit, data is in byte n
  private eval_reg_or_data_2(command: Command, imm: number, start: number): number {
    if (imm) { // immediate
      return this.getbits(command, (start - 1), 7);
    } else {
      return this.get_GPRM(command.registers, (this.getbits(command, (start - 4), 4)));
    }
  }

  /**
   * Compare data using operation, return result from comparison.
   * Helper function for the different if functions.
   *
   * @param {number} operation
   * @param {number} data1
   * @param {number} data2
   * @return {boolean}
   */
  private eval_compare(operation: number, data1: number, data2: number): boolean {
    switch (operation) {
      case 1:
        return !!(data1 & data2);
      case 2:
        return data1 === data2;
      case 3:
        return data1 !== data2;
      case 4:
        return data1 >= data2;
      case 5:
        return data1 > data2;
      case 6:
        return data1 <= data2;
      case 7:
        return data1 < data2;
    }
    console.error('jsdvdnav: Invalid comparison code');
    return false;
  }

  /**
   * Evaluate if version 1.
   * Has comparison data in byte 3 and 4-5 (immediate or register)
   *
   * @param {Command} command
   * @return {boolean}
   */
  private eval_if_version_1(command: Command): boolean {
    var op = this.getbits(command, 54, 3);
    if (op) {
      return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 39, 8)),
        this.eval_reg_or_data(command, this.getbits(command, 55, 1), 31));
    }
    return true;
  }

  /**
   * Evaluate if version 2.
   * This version only compares register which are in byte 6 and 7
   *
   * @param {Command} command
   * @return {boolean}
   */
  private eval_if_version_2(command: Command): boolean {
    var op = this.getbits(command, 54, 3);
    if (op) {
      return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 15, 8)),
        this.eval_reg(command, this.getbits(command, 7, 8)));
    }
    return true;
  }

  /**
   * Evaluate if version 3.
   * Has comparison data in byte 2 and 6-7 (immediate or register)
   *
   * @param {Command} command
   * @return {boolean}
   */
  private eval_if_version_3(command: Command): boolean {
    var op = this.getbits(command, 54, 3);
    if (op) {
      return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 47, 8)),
        this.eval_reg_or_data(command, this.getbits(command, 55, 1), 15));
    }
    return true;
  }

  /**
   * Evaluate if version 4.
   * Has comparison data in byte 1 and 4-5 (immediate or register)
   * The register in byte 1 is only the lowe nibble (4 bits)
   *
   * @param {Command} command
   * @return {boolean}
   */
  private eval_if_version_4(command: Command): boolean {
    var op = this.getbits(command, 54, 3);
    if (op) {
      return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 51, 4)),
        this.eval_reg_or_data(command, this.getbits(command, 55, 1), 31));
    }
    return true;
  }

  /**
   * Evaluate special instruction.... returns the new row/line number,
   * 0 if no new row and 256 if Break.
   *
   * @param {Command} command
   * @param {boolean} cond
   * @return {number}
   */
  private eval_special_instruction(command: Command, cond: boolean): number {
    var line = 0, level = 0;

    switch (this.getbits(command, 51, 4)) {
      case 0: // NOP
        line = 0;
        return cond ? line : 0;
      case 1: // Goto line
        line = this.getbits(command, 7, 8);
        return cond ? line : 0;
      case 2: // Break
        // max number of rows < 256, so we will end this set
        line = 256;
        return cond ? 256 : 0;
      case 3: // Set temporary parental level and goto
        line = this.getbits(command, 7, 8);
        level = this.getbits(command, 11, 4);
        if (cond) {
          // This always succeeds now, if we want real parental protection
          // we need to ask the user and have passwords and stuff.
          command.registers.SPRM[13] = level;
        }
        return cond ? line : 0;
    }
    return 0;
  }

  /**
   * Evaluate link by subinstruction.
   * Return 1 if link, or 0 if no link
   * Actual link instruction is in return_values parameter
   *
   * @param {Command} command
   * @param {boolean} cond
   * @param {Link} return_values
   * @return {number}
   */
  private eval_link_subins(command: Command, cond: boolean, return_values: Link): number {
    var button = this.getbits(command, 15, 6);
    var linkop = this.getbits(command, 4, 5);

    if (linkop > 0x10) {
      return 0;
    }
    // Unknown Link by Sub-Instruction command

    // Assumes that the link_cmd enum has the same values as the LinkSIns codes
    return_values.command = linkop;
    return_values.data1 = button;
    return cond ? 1 : 0;
  }

  /**
   * Evaluate link instruction.
   * Return 1 if link, or 0 if no link
   * Actual link instruction is in return_values parameter
   *
   * @param {Command} command
   * @param {boolean} cond
   * @param {Link} return_values
   * @return {number}
   */
  private eval_link_instruction(command: Command, cond: boolean, return_values: Link): number {
    var op = this.getbits(command, 51, 4);

    switch (op) {
      case 1:
        return this.eval_link_subins(command, cond, return_values);
      case 4:
        return_values.command = link_cmd.LinkPGCN;
        return_values.data1 = this.getbits(command, 14, 15);
        return cond ? 1 : 0;
      case 5:
        return_values.command = link_cmd.LinkPTTN;
        return_values.data1 = this.getbits(command, 9, 10);
        return_values.data2 = this.getbits(command, 15, 6);
        return cond ? 1 : 0;
      case 6:
        return_values.command = link_cmd.LinkPGN;
        return_values.data1 = this.getbits(command, 6, 7);
        return_values.data2 = this.getbits(command, 15, 6);
        return cond ? 1 : 0;
      case 7:
        return_values.command = link_cmd.LinkCN;
        return_values.data1 = this.getbits(command, 7, 8);
        return_values.data2 = this.getbits(command, 15, 6);
        return cond ? 1 : 0;
    }
    return 0;
  }

  /**
   * Evaluate a jump instruction.
   * returns 1 if jump or 0 if no jump
   * actual jump instruction is in return_values parameter
   *
   * @param {Command} command
   * @param {boolean} cond
   * @param {Link} return_values
   * @return {number}
   */
  private eval_jump_instruction(command: Command, cond: boolean, return_values: Link): number {
    switch (this.getbits(command, 51, 4)) {
      case 1:
        return_values.command = link_cmd.Exit;
        return cond ? 1 : 0;
      case 2:
        return_values.command = link_cmd.JumpTT;
        return_values.data1 = this.getbits(command, 22, 7);
        return cond ? 1 : 0;
      case 3:
        return_values.command = link_cmd.JumpVTS_TT;
        return_values.data1 = this.getbits(command, 22, 7);
        return cond ? 1 : 0;
      case 5:
        return_values.command = link_cmd.JumpVTS_PTT;
        return_values.data1 = this.getbits(command, 22, 7);
        return_values.data2 = this.getbits(command, 41, 10);
        return cond ? 1 : 0;
      case 6:
        switch (this.getbits(command, 23, 2)) {
          case 0:
            return_values.command = link_cmd.JumpSS_FP;
            return cond ? 1 : 0;
          case 1:
            return_values.command = link_cmd.JumpSS_VMGM_MENU;
            return_values.data1 = this.getbits(command, 19, 4);
            return cond ? 1 : 0;
          case 2:
            return_values.command = link_cmd.JumpSS_VTSM;
            return_values.data1 = this.getbits(command, 31, 8);
            return_values.data2 = this.getbits(command, 39, 8);
            return_values.data3 = this.getbits(command, 19, 4);
            return cond ? 1 : 0;
          case 3:
            return_values.command = link_cmd.JumpSS_VMGM_PGC;
            return_values.data1 = this.getbits(command, 46, 15);
            return cond ? 1 : 0;
        }
        break;
      case 8:
        switch (this.getbits(command, 23, 2)) {
          case 0:
            return_values.command = link_cmd.CallSS_FP;
            return_values.data1 = this.getbits(command, 31, 8);
            return cond ? 1 : 0;
          case 1:
            return_values.command = link_cmd.CallSS_VMGM_MENU;
            return_values.data1 = this.getbits(command, 19, 4);
            return_values.data2 = this.getbits(command, 31, 8);
            return cond ? 1 : 0;
          case 2:
            return_values.command = link_cmd.CallSS_VTSM;
            return_values.data1 = this.getbits(command, 19, 4);
            return_values.data2 = this.getbits(command, 31, 8);
            return cond ? 1 : 0;
          case 3:
            return_values.command = link_cmd.CallSS_VMGM_PGC;
            return_values.data1 = this.getbits(command, 46, 15);
            return_values.data2 = this.getbits(command, 31, 8);
            return cond ? 1 : 0;
        }
        break;
    }
    return 0;
  }

  /**
   * Evaluate a set sytem register instruction
   * May contain a link so return the same as eval_link
   *
   * @param {Command} command
   * @param {boolean} cond
   * @param {Link} return_values
   * @return {number}
   */
  private eval_system_set(command: Command, cond: boolean, return_values: Link): number {
    var i;
    var data, data2;

    switch (this.getbits(command, 59, 4)) {
      case 1: // Set system reg 1 &| 2 &| 3 (Audio, Subp. Angle)
        for (i = 1; i <= 3; i++) {
          if (this.getbits(command, 63 - ((2 + i) * 8), 1)) {
            data = this.eval_reg_or_data_2(command, this.getbits(command, 60, 1), (47 - (i * 8)));
            if (cond) {
              command.registers.SPRM[i] = data;
            }
          }
        }
        break;
      case 2: // Set system reg 9 & 10 (Navigation timer, Title PGC number)
        data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 47);
        data2 = this.getbits(command, 23, 8);
        // ?? size
        if (cond) {
          command.registers.SPRM[9] = data;
          // time
          command.registers.SPRM[10] = data2;
          // pgcN
        }
        break;
      case 3: // Mode: Counter / Register + Set
        data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 47);
        data2 = this.getbits(command, 19, 4);
        if (this.getbits(command, 23, 1)) {
          command.registers.GPRM_mode[data2] |= 1;
          // Set bit 0
        } else {
          command.registers.GPRM_mode[data2] &= ~0x01;
          // Reset bit 0
        }
        if (cond) {
          this.set_GPRM(command.registers, data2, data);
        }
        break;
      case 6: // Set system reg 8 (Highlighted button)
        data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 31);
        // Not system reg!!
        if (cond) {
          command.registers.SPRM[8] = data;
        }
        break;
    }
    if (this.getbits(command, 51, 4)) {
      return this.eval_link_instruction(command, cond, return_values);
    }
    return 0;
  }

  /**
   * Evaluate set operation
   * Sets the register given to the value indicated by op and data.
   * For the swap case the contents of reg is stored in reg2.
   *
   * @param {Command} command
   * @param {number} op
   * @param {number} reg
   * @param {number} reg2
   * @param {number} data
   */
  private eval_set_op(command: Command, op: number, reg: number, reg2: number, data: number) {
    /** @const */ var shortmax = 0xFFFF;
    var tmp = 0;
    switch (op) {
      case 1:
        this.set_GPRM(command.registers, reg, data);
        break;
      case 2: // SPECIAL CASE - SWAP!
        this.set_GPRM(command.registers, reg2, this.get_GPRM(command.registers, reg));
        this.set_GPRM(command.registers, reg, data);
        break;
      case 3:
        tmp = this.get_GPRM(command.registers, reg) + data;
        if (tmp > shortmax) tmp = shortmax;
        this.set_GPRM(command.registers, reg, tmp);
        break;
      case 4:
        tmp = this.get_GPRM(command.registers, reg) - data;
        if (tmp < 0) tmp = 0;
        this.set_GPRM(command.registers, reg, tmp);
        break;
      case 5:
        tmp = this.get_GPRM(command.registers, reg) * data;
        if (tmp > shortmax) tmp = shortmax;
        this.set_GPRM(command.registers, reg, tmp);
        break;
      case 6:
        if (data !== 0) {
          this.set_GPRM(command.registers, reg, this.get_GPRM(command.registers, reg) / data);
        } else {
          this.set_GPRM(command.registers, reg, 0xFFFF);
          // Avoid that divide by zero!
        }
        break;
      case 7:
        if (data !== 0) {
          this.set_GPRM(command.registers, reg, this.get_GPRM(command.registers, reg) % data);
        } else {
          this.set_GPRM(command.registers, reg, 0xFFFF);
          // Avoid that divide by zero!
        }
        break;
      case 8: // SPECIAL CASE - RND! Return numbers between 1 and data.
        this.set_GPRM(command.registers, reg, 1 + Math.round((data - 1) * Math.random()));
        break;
      case 9:
        this.set_GPRM(command.registers, reg, this.get_GPRM(command.registers, reg) & data);
        break;
      case 10:
        this.set_GPRM(command.registers, reg, this.get_GPRM(command.registers, reg) | data);
        break;
      case 11:
        this.set_GPRM(command.registers, reg, this.get_GPRM(command.registers, reg) ^ data);
        break;
    }
  }

  /**
   * Evaluate set instruction, combined with either Link or Compare.
   *
   * @param {Command} command
   * @param {boolean} cond
   */
  private eval_set_version_1(command: Command, cond: boolean) {
    var op = this.getbits(command, 59, 4);
    var reg = this.getbits(command, 35, 4);
    // FIXME: This is different from vmcmd.c!!!
    var reg2 = this.getbits(command, 19, 4);
    var data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 31);

    if (cond) {
      this.eval_set_op(command, op, reg, reg2, data);
    }
  }

  /**
   * Evaluate set instruction, combined with both Link and Compare.
   *
   * @param {Command} command
   * @param {boolean} cond
   */
  private eval_set_version_2(command: Command, cond: boolean) {
    var op = this.getbits(command, 59, 4);
    var reg = this.getbits(command, 51, 4);
    var reg2 = this.getbits(command, 35, 4);
    // FIXME: This is different from vmcmd.c!!!
    var data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 47);

    if (cond) {
      this.eval_set_op(command, op, reg, reg2, data);
    }
  }

  /**
   * Evaluate a command
   * returns row number of goto, 0 if no goto, -1 if link.
   * Link command in return_values
   *
   * @param {Array.<number>} bytes
   * @param {Link} return_values
   * @return {number}
   */
  private eval_command(bytes: Array<number>, return_values: Link): number {
    var registers = this.state.registers;
    var cond: boolean = false, res = 0;
    var command = new Command();
    // Working with strings avoid messing around with rounded values.
    // Alternatively, we could use a typed array here.
    command.instruction = bytes.map(function(byte: number) {
      return sprintf('%08i', (byte).toString(2));
    }).join('');
    command.examined = 0;
    command.registers = registers;

    //memset(return_values, 0, sizeof(Link));
    return_values.command = link_cmd.LinkNoLink;
    return_values.data1 = 0;
    return_values.data2 = 0;
    return_values.data3 = 0;

    switch (this.getbits(command, 63, 3)) { // three first old_bits
      case 0: // Special instructions
        cond = this.eval_if_version_1(command);
        res = this.eval_special_instruction(command, cond);
        if (res === -1) {
          console.log('jsdvdnav: Unknown Instruction!');
          this.abort();
          return 0;
        }
        break;
      case 1: // Link/jump instructions
        if (this.getbits(command, 60, 1)) {
          cond = this.eval_if_version_2(command);
          res = this.eval_jump_instruction(command, cond, return_values);
        } else {
          cond = this.eval_if_version_1(command);
          res = this.eval_link_instruction(command, cond, return_values);
        }
        if (res) {
          res = -1;
        }
        break;
      case 2: // System set instructions
        cond = this.eval_if_version_2(command);
        res = this.eval_system_set(command, cond, return_values);
        if (res) {
          res = -1;
        }
        break;
      case 3: // Set instructions, either Compare or Link may be used
        cond = this.eval_if_version_3(command);
        this.eval_set_version_1(command, cond);
        if (this.getbits(command, 51, 4)) {
          res = this.eval_link_instruction(command, cond, return_values);
        }
        if (res) {
          res = -1;
        }
        break;
      case 4: // Set, Compare -> Link Sub-Instruction
        this.eval_set_version_2(command, true);
        cond = this.eval_if_version_4(command);
        res = this.eval_link_subins(command, cond, return_values);
        if (res) {
          res = -1;
        }
        break;
      case 5: // Compare -> (Set and Link Sub-Instruction)
        // FIXME: These are wrong. Need to be updated from vmcmd.c
        cond = this.eval_if_version_4(command);
        this.eval_set_version_2(command, cond);
        res = this.eval_link_subins(command, cond, return_values);
        if (res) {
          res = -1;
        }
        break;
      case 6: // Compare -> Set, allways Link Sub-Instruction
        // FIXME: These are wrong. Need to be updated from vmcmd.c
        cond = this.eval_if_version_4(command);
        this.eval_set_version_2(command, cond);
        res = this.eval_link_subins(command, true, return_values);
        if (res) {
          res = -1;
        }
        break;
      default: // Unknown command
        console.error('jsdvdnav: Unknown Command=%s', utils.toHex(this.getbits(command, 63, 3)));
        this.abort();
        return 0;
    }
    // Check if there are bits not yet examined

    if (Number(command.instruction) & ~command.examined) {
      console.error('jsdvdnav: Unknown bits: %08', (Number(command.instruction) & ~command.examined));
    }

    return res;
  }


  // Debug functions
  private linkcmd2str(cmd) {
    switch (cmd) {
      case link_cmd.LinkNoLink:
        return 'LinkNoLink';
      case link_cmd.LinkTopC:
        return 'LinkTopC';
      case link_cmd.LinkNextC:
        return 'LinkNextC';
      case link_cmd.LinkPrevC:
        return 'LinkPrevC';
      case link_cmd.LinkTopPG:
        return 'LinkTopPG';
      case link_cmd.LinkNextPG:
        return 'LinkNextPG';
      case link_cmd.LinkPrevPG:
        return 'LinkPrevPG';
      case link_cmd.LinkTopPGC:
        return 'LinkTopPGC';
      case link_cmd.LinkNextPGC:
        return 'LinkNextPGC';
      case link_cmd.LinkPrevPGC:
        return 'LinkPrevPGC';
      case link_cmd.LinkGoUpPGC:
        return 'LinkGoUpPGC';
      case link_cmd.LinkTailPGC:
        return 'LinkTailPGC';
      case link_cmd.LinkRSM:
        return 'LinkRSM';
      case link_cmd.LinkPGCN:
        return 'LinkPGCN';
      case link_cmd.LinkPTTN:
        return 'LinkPTTN';
      case link_cmd.LinkPGN:
        return 'LinkPGN';
      case link_cmd.LinkCN:
        return 'LinkCN';
      case link_cmd.Exit:
        return 'Exit';
      case link_cmd.JumpTT:
        return 'JumpTT';
      case link_cmd.JumpVTS_TT:
        return 'JumpVTS_TT';
      case link_cmd.JumpVTS_PTT:
        return 'JumpVTS_PTT';
      case link_cmd.JumpSS_FP:
        return 'JumpSS_FP';
      case link_cmd.JumpSS_VMGM_MENU:
        return 'JumpSS_VMGM_MENU';
      case link_cmd.JumpSS_VTSM:
        return 'JumpSS_VTSM';
      case link_cmd.JumpSS_VMGM_PGC:
        return 'JumpSS_VMGM_PGC';
      case link_cmd.CallSS_FP:
        return 'CallSS_FP';
      case link_cmd.CallSS_VMGM_MENU:
        return 'CallSS_VMGM_MENU';
      case link_cmd.CallSS_VTSM:
        return 'CallSS_VTSM';
      case link_cmd.CallSS_VMGM_PGC:
        return 'CallSS_VMGM_PGC';
      case link_cmd.PlayThis:
        return 'PlayThis';
    }
    return '(bug)';
  }

  /**
   * For debugging: prints a link in readable form.
   */
  private print_link(value) {
    var cmd = this.linkcmd2str(value.command);

    switch (value.command) {
      case link_cmd.LinkNoLink:
      case link_cmd.LinkTopC:
      case link_cmd.LinkNextC:
      case link_cmd.LinkPrevC:
      case link_cmd.LinkTopPG:
      case link_cmd.LinkNextPG:
      case link_cmd.LinkPrevPG:
      case link_cmd.LinkTopPGC:
      case link_cmd.LinkNextPGC:
      case link_cmd.LinkPrevPGC:
      case link_cmd.LinkGoUpPGC:
      case link_cmd.LinkTailPGC:
      case link_cmd.LinkRSM:
        console.log('jsdvdnav: %s (button %d)', cmd, value.data1);
        break;
      case link_cmd.LinkPGCN:
      case link_cmd.JumpTT:
      case link_cmd.JumpVTS_TT:
      case link_cmd.JumpSS_VMGM_MENU: // === 2 -> Title Menu
      case link_cmd.JumpSS_VMGM_PGC:
        console.log('jsdvdnav: %s %d', cmd, value.data1);
        break;
      case link_cmd.LinkPTTN:
      case link_cmd.LinkPGN:
      case link_cmd.LinkCN:
        console.log('jsdvdnav: %s %d (button %d)', cmd, value.data1, value.data2);
        break;
      case link_cmd.Exit:
      case link_cmd.JumpSS_FP:
      case link_cmd.PlayThis: // Humm.. should we have this at all..
        console.log('jsdvdnav: %s', cmd);
        break;
      case link_cmd.JumpVTS_PTT:
        console.log('jsdvdnav: %s %d:%d', cmd, value.data1, value.data2);
        break;
      case link_cmd.JumpSS_VTSM:
        console.log('jsdvdnav: %s vts %d title %d menu %d',
          cmd, value.data1, value.data2, value.data3);
        break;
      case link_cmd.CallSS_FP:
        console.log('jsdvdnav: %s resume cell %d', cmd, value.data1);
        break;
      case link_cmd.CallSS_VMGM_MENU: // === 2 -> Title Menu
      case link_cmd.CallSS_VTSM:
        console.log('jsdvdnav: %s %d resume cell %d', cmd, value.data1, value.data2);
        break;
      case link_cmd.CallSS_VMGM_PGC:
        console.log('jsdvdnav: %s %d resume cell %d', cmd, value.data1, value.data2);
        break;
    }
  }

  private print_current_domain_state() {
    switch (this.state.domain) {
      case DVDDomain.DVD_DOMAIN_VTSTitle:
        console.log('jsdvdnav: Video Title Domain: -');
        break;
      case DVDDomain.DVD_DOMAIN_VTSMenu:
        console.log('jsdvdnav: Video Title Menu Domain: -');
        break;
      case DVDDomain.DVD_DOMAIN_VMGM:
        console.log('jsdvdnav: Video Manager Menu Domain: -');
        break;
      case DVDDomain.DVD_DOMAIN_FirstPlay:
        console.log('jsdvdnav: First Play Domain: -');
        break;
      default:
        console.log('jsdvdnav: Unknown Domain: -');
        break;
    }

    console.log(sprintf('jsdvdnav: VTS:%d PGC:%d PG:%u CELL:%u BLOCK:%u VTS_TTN:%u TTN:%u TT_PGCN:%u',
      this.state.vtsN,
      this.state.pgcN,
      this.state.pgN,
      this.state.cellN,
      this.state.blockN,
      this.state.registers.SPRM[VTS_TTN_REG],
      this.state.registers.SPRM[TTN_REG],
      this.state.registers.SPRM[TT_PGCN_REG]));
  }

  /**
   * Used in dvdnav.
   * @param position
   * @return {string}
   */
  public print_position(position) {
    if (!position) {
      return '';
    }

    return sprintf('But=%s Spu=%s Aud=%s Ang=%s Hop=%s vts=%s dom=%s cell=%s cell_restart=%s cell_start=%s still=%s block=%s',
      utils.toHex(position.button),
      utils.toHex(position.spu_channel),
      utils.toHex(position.audio_channel),
      utils.toHex(position.angle_channel),
      utils.toHex(position.hop_channel),
      utils.toHex(position.vts),
      utils.toHex(position.domain),
      utils.toHex(position.cell),
      utils.toHex(position.cell_restart),
      utils.toHex(position.cell_start),
      utils.toHex(position.still),
      utils.toHex(position.block));
  }

  /**
   * for debugging: dumps VM registers.
   */
  private print_registers() {
    var registers = this.state.registers;
    var i = 0;

    var msg = 'jsdvdnav:    #   ';
    for (; i < 24; i++)
      msg += sprintf(' %2d |', i);
    console.log(msg);
    msg = 'jsdvdnav: SRPMS: ';
    for (i = 0; i < 24; i++)
      msg += sprintf('%04x|', registers.SPRM[i]);
    console.log(msg);
    msg = 'jsdvdnav: GRPMS: ';
    for (i = 0; i < 16; i++)
      msg += sprintf('%04x|', this.get_GPRM(registers, i));
    console.log(msg);
    msg = 'jsdvdnav: Gmode: ';
    for (i = 0; i < 16; i++)
      msg += sprintf('%04x|', registers.GPRM_mode[i]);
    console.log(msg);
    msg = 'jsdvdnav: Gtime: ';
    for (i = 0; i < 16; i++)
      msg += sprintf('%04x|', (registers.GPRM_time[i] / 1000) & 0xFFFF);
    console.log(msg);
  }

  private abort() {
    throw new Error('Unknown error');
  }

  // Ported from VM/vmcmd.c
  private static cmp_op_table = [
    '', '&', '==', '!=', '>=', '>', '<=', '<'
  ];

  private static set_op_table = [
    '', '=', '<->', '+=', '-=', '*=', '/=', '%=', 'rnd', '&=', '|=', '^='
  ];

  private static link_table = [
    'LinkNoLink',
    'LinkTopC',
    'LinkNextC',
    'LinkPrevC',
    '',
    'LinkTopPG',
    'LinkNextPG',
    'LinkPrevPG',
    '',
    'LinkTopPGC',
    'LinkNextPGC',
    'LinkPrevPGC',
    'LinkGoUpPGC',
    'LinkTailPGC',
    '',
    '',
    'RSM'
  ];

  private static system_reg_table = [
    'Menu Description Language Code',
    'Audio Stream Number',
    'Sub-picture Stream Number',
    'Angle Number',
    'Title Track Number',
    'VTS Title Track Number',
    'VTS PGC Number',
    'PTT Number for One_Sequential_PGC_Title',
    'Highlighted Button Number',
    'Navigation Timer',
    'Title PGC Number for Navigation Timer',
    'Audio Mixing Mode for Karaoke',
    'Country Code for Parental Management',
    'Parental Level',
    'Player Configurations for Video',
    'Player Configurations for Audio',
    'Initial Language Code for Audio',
    'Initial Language Code Extension for Audio',
    'Initial Language Code for Sub-picture',
    'Initial Language Code Extension for Sub-picture',
    'Player Regional Code',
    'Reserved 21',
    'Reserved 22',
    'Reserved 23'
  ];

  private static system_reg_abbr_table = [
    '',
    'ASTN',
    'SPSTN',
    'AGLN',
    'TTN',
    'VTS_TTN',
    'TT_PGCN',
    'PTTN',
    'HL_BTNN',
    'NVTMR',
    'NV_PGCN',
    '',
    'CC_PLT',
    'PLT',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ];

  private print_system_reg(reg) {
    var msg = '';
    if (reg < VM.system_reg_abbr_table.length && VM.system_reg_table[reg].length) {
      msg += sprintf('%s (SRPM:%d)', VM.system_reg_table[reg], reg);
    } else {
      console.error('jsdvdnav: Unknown system register (reg=%d)', reg);
    }

    return msg;
  }

  private print_g_reg(reg) {
    var msg = '';
    if (reg < 0x10) {
      //msg += sprintf("g[%" PRIu8 "]", reg);
      msg += sprintf('g[%s]', utils.toHex(reg));
    } else {
      console.error('jsdvdnav: Unknown general register');
    }

    return msg;
  }

  private print_reg(reg) {
    var msg = '';
    if (reg & 0x80) {
      msg += this.print_system_reg(reg & 0x7F);
    } else {
      msg += this.print_g_reg(reg & 0x7F);
    }

    return msg;
  }

  private print_cmp_op(op) {
    var msg = '';
    if (op < VM.cmp_op_table.length && VM.cmp_op_table[op].length) {
      msg += sprintf(' %s ', VM.cmp_op_table[op]);
    } else {
      console.error('jsdvdnav: Unknown compare op');
    }

    return msg;
  }

  private print_set_op(op) {
    var msg = '';
    if (op < VM.set_op_table.length && VM.set_op_table[op].length) {
      msg += sprintf(' %s ', VM.set_op_table[op]);
    } else {
      console.error('jsdvdnav: Unknown set op');
    }

    return msg;
  }

  private print_reg_or_data(command, immediate, start) {
    var msg = '';
    if (immediate) {
      var i = this.getbits(command, start, 16);

      msg += sprintf('%s', utils.toHex(i));
      if (utils.isprint(i & 0xFF) && utils.isprint((i >> 8) & 0xFF)) {
        msg += sprintf(' ("%s")', utils.bit2str(i));
      }
    } else {
      msg += this.print_reg(this.getbits(command, start - 8, 8));
    }

    return msg;
  }

  private print_reg_or_data_2(command, immediate, start) {
    var msg = '';
    if (immediate) {
      msg += sprintf('%s', utils.toHex(this.getbits(command, start - 1, 7)));
    } else {
      //msg += sprintf("g[%" PRIu8 "]", this.getbits(command, start - 4, 4));
      msg += sprintf('g[%s]', utils.toHex(this.getbits(command, start - 4, 4)));
    }

    return msg;
  }

  private print_reg_or_data_3(command, immediate, start) {
    var msg = '';
    if (immediate) {
      var i = this.getbits(command, start, 16);

      msg += sprintf('%s', utils.toHex(i));
      if (utils.isprint(i & 0xFF) && utils.isprint((i >> 8) & 0xFF)) {
        msg += sprintf(' ("%s")', utils.bit2str(i));
      }
    } else {
      msg += this.print_reg(this.getbits(command, start, 8));
    }

    return msg;
  }

  private print_if_version_1(command) {
    var msg = '';
    var op = this.getbits(command, 54, 3);

    if (op) {
      msg += 'if (';
      msg += this.print_g_reg(this.getbits(command, 39, 8));
      msg += this.print_cmp_op(op);
      msg += this.print_reg_or_data(command, this.getbits(command, 55, 1), 31);
      msg += ') ';
    }

    return msg;
  }

  private print_if_version_2(command) {
    var msg = '';
    var op = this.getbits(command, 54, 3);

    if (op) {
      msg += 'if (';
      msg += this.print_reg(this.getbits(command, 15, 8));
      msg += this.print_cmp_op(op);
      msg += this.print_reg(this.getbits(command, 7, 8));
      msg += ') ';
    }

    return msg;
  }

  private print_if_version_3(command) {
    var msg = '';
    var op = this.getbits(command, 54, 3);

    if (op) {
      msg += 'if (';
      msg += this.print_g_reg(this.getbits(command, 43, 4));
      msg += this.print_cmp_op(op);
      msg += this.print_reg_or_data(command, this.getbits(command, 55, 1), 15);
      msg += ') ';
    }

    return msg;
  }

  private print_if_version_4(command) {
    var msg = '';
    var op = this.getbits(command, 54, 3);

    if (op) {
      msg += 'if (';
      msg += this.print_g_reg(this.getbits(command, 51, 4));
      msg += this.print_cmp_op(op);
      msg += this.print_reg_or_data(command, this.getbits(command, 55, 1), 31);
      msg += ') ';
    }

    return msg;
  }

  private print_if_version_5(command) {
    var msg = '';
    var op = this.getbits(command, 54, 3);
    var set_immediate = this.getbits(command, 60, 1);

    if (op) {
      if (set_immediate) {
        msg += 'if (';
        msg += this.print_g_reg(this.getbits(command, 31, 8));
        msg += this.print_cmp_op(op);
        msg += this.print_reg(this.getbits(command, 23, 8));
        msg += ') ';
      } else {
        msg += 'if (';
        msg += this.print_g_reg(this.getbits(command, 39, 8));
        msg += this.print_cmp_op(op);
        msg += this.print_reg_or_data(command, this.getbits(command, 55, 1), 31);
        msg += ') ';
      }
    }

    return msg;
  }

  private print_special_instruction(command) {
    var msg = '';
    var op = this.getbits(command, 51, 4);

    switch (op) {
      case 0: // NOP
        msg += 'NOP';
        break;
      case 1: // Goto line
        //msg += sprintf("Goto %" PRIu8, this.getbits(command, 7, 8));
        msg += sprintf('Goto %s', this.getbits(command, 7, 8));
        break;
      case 2: // Break
        msg += 'Break';
        break;
      case 3: // Parental level
        //msg += sprintf("SetTmpPML %" PRIu8 ", Goto %" PRIu8, this.getbits(command, 11, 4), this.getbits(command, 7, 8));
        msg += sprintf('SetTmpPML %s, Goto %s', this.getbits(command, 11, 4), this.getbits(command, 7, 8));
        break;
      default:
        console.error('jsdvdnav: Unknown special instruction (%i)', this.getbits(command, 51, 4));
    }

    return msg;
  }

  private print_linksub_instruction(command) {
    var msg = '';
    var linkop = this.getbits(command, 7, 8);
    var button = this.getbits(command, 15, 6);

    if (linkop < VM.link_table.length && VM.link_table[linkop].length) {
      //msg += sprintf("%s (button %" PRIu8 ")", VM.link_table[linkop], button);
      msg += sprintf('%s (button %s)', VM.link_table[linkop], button);
    } else {
      console.error('jsdvdnav: Unknown linksub instruction (%i)', linkop);
    }

    return msg;
  }

  private print_link_instruction(command, optional: boolean) {
    var msg = '';
    var op = this.getbits(command, 51, 4);

    if (optional && op)
      msg += ', ';

    switch (op) {
      case 0:
        if (!optional)
          console.error('jsdvdnav: NOP (link)!');
        break;
      case 1:
        msg += this.print_linksub_instruction(command);
        break;
      case 4:
        //msg += sprintf("LinkPGCN %" PRIu16, this.getbits(command, 14, 15));
        msg += sprintf('LinkPGCN %s', this.getbits(command, 14, 15));
        break;
      case 5:
        //msg += sprintf("LinkPTT %" PRIu16 " (button %" PRIu8 ")", this.getbits(command, 9, 10), this.getbits(command, 15, 6));
        msg += sprintf('LinkPTT %s (button %s)', this.getbits(command, 9, 10), this.getbits(command, 15, 6));
        break;
      case 6:
        //msg += sprintf("LinkPGN %" PRIu8 " (button %" PRIu8 ")", this.getbits(command, 6, 7), this.getbits(command, 15, 6));
        msg += sprintf('LinkPGN %s (button %s)', this.getbits(command, 6, 7), this.getbits(command, 15, 6));
        break;
      case 7:
        //msg += sprintf("LinkCN %" PRIu8 " (button %" PRIu8 ")", this.getbits(command, 7, 8), this.getbits(command, 15, 6));
        msg += sprintf('LinkCN %s (button %s)', this.getbits(command, 7, 8), this.getbits(command, 15, 6));
        break;
      default:
        console.error('jsdvdnav: Unknown link instruction');
    }

    return msg;
  }

  private print_jump_instruction(command) {
    var msg = '';
    switch (this.getbits(command, 51, 4)) {
      case 1:
        msg += 'Exit';
        break;
      case 2:
        //msg += sprintf("JumpTT %" PRIu8, this.getbits(command, 22, 7));
        msg += sprintf('JumpTT %s', this.getbits(command, 22, 7));
        break;
      case 3:
        //msg += sprintf("JumpVTS_TT %" PRIu8, this.getbits(command, 22, 7));
        msg += sprintf('JumpVTS_TT %s', this.getbits(command, 22, 7));
        break;
      case 5:
        //msg += sprintf("JumpVTS_PTT %" PRIu8 ":%" PRIu16, this.getbits(command, 22, 7), this.getbits(command, 41, 10));
        msg += sprintf('JumpVTS_PTT %s:%s', this.getbits(command, 22, 7), this.getbits(command, 41, 10));
        break;
      case 6:
        switch (this.getbits(command, 23, 2)) {
          case 0:
            msg += 'JumpSS FP';
            break;
          case 1:
            //msg += sprintf("JumpSS VMGM (menu %" PRIu8 ")", this.getbits(command, 19, 4));
            msg += sprintf('JumpSS VMGM (menu %s)', this.getbits(command, 19, 4));
            break;
          case 2:
            //msg += sprintf("JumpSS VTSM (vts %" PRIu8 ", title %" PRIu8 ", menu %" PRIu8 ")", this.getbits(command, 30, 7), this.getbits(command, 38, 7), this.getbits(command, 19, 4));
            msg += sprintf('JumpSS VTSM (vts %s, title %s, menu %s)', this.getbits(command, 30, 7), this.getbits(command, 38, 7), this.getbits(command, 19, 4));
            break;
          case 3:
            //msg += sprintf("JumpSS VMGM (pgc %" PRIu8 ")", this.getbits(command, 46, 15));
            msg += sprintf('JumpSS VMGM (pgc %s)', this.getbits(command, 46, 15));
            break;
        }
        break;
      case 8:
        switch (this.getbits(command, 23, 2)) {
          case 0:
            //msg += sprintf("CallSS FP (rsm_cell %" PRIu8 ")", this.getbits(command, 31, 8));
            msg += sprintf('CallSS FP (rsm_cell %s)', this.getbits(command, 31, 8));
            break;
          case 1:
            //msg += sprintf("CallSS VMGM (menu %" PRIu8 ", rsm_cell %" PRIu8 ")", this.getbits(command, 19, 4), this.getbits(command, 31, 8));
            msg += sprintf('CallSS VMGM (menu %s, rsm_cell %s)', this.getbits(command, 19, 4), this.getbits(command, 31, 8));
            break;
          case 2:
            //msg += sprintf("CallSS VTSM (menu %" PRIu8 ", rsm_cell %" PRIu8 ")", this.getbits(command, 19, 4), this.getbits(command, 31, 8));
            msg += sprintf('CallSS VTSM (menu %s, rsm_cell %s)', this.getbits(command, 19, 4), this.getbits(command, 31, 8));
            break;
          case 3:
            //msg += sprintf("CallSS VMGM (pgc %" PRIu8 ", rsm_cell %" PRIu8 ")", this.getbits(command, 46, 15), this.getbits(command, 31, 8));
            msg += sprintf('CallSS VMGM (pgc %s, rsm_cell %s)', this.getbits(command, 46, 15), this.getbits(command, 31, 8));
            break;
        }
        break;
      default:
        console.error('jsdvdnav: Unknown Jump/Call instruction');
    }

    return msg;
  }

  private print_system_set(command) {
    var msg = '';
    var i = 0;
    // FIXME: What about SPRM11 ? Karaoke
    // Surely there must be some system set command for that?

    switch (this.getbits(command, 59, 4)) {
      case 1: // Set system reg 1 &| 2 &| 3 (Audio, Subp. Angle)
        for (i = 1; i <= 3; i++) {
          if (this.getbits(command, 47 - (i * 8), 1)) {
            msg += this.print_system_reg(i);
            msg += ' = ';
            msg += this.print_reg_or_data_2(command, this.getbits(command, 60, 1), 47 - (i * 8));
            msg += ' ';
          }
        }
        break;
      case 2: // Set system reg 9 & 10 (Navigation timer, Title PGC number)
        msg += this.print_system_reg(9);
        msg += ' = ';
        msg += this.print_reg_or_data(command, this.getbits(command, 60, 1), 47);
        msg += ' ';
        msg += this.print_system_reg(10);
        //msg += sprintf(" = %" PRIu16, this.getbits(command, 30, 15)); // ??
        msg += sprintf(' = %s', this.getbits(command, 30, 15));
        // ??
        break;
      case 3: // Mode: Counter / Register + Set
        msg += 'SetMode ';
        if (this.getbits(command, 23, 1)) {
          msg += 'Counter ';
        } else {
          msg += 'Register ';
        }
        msg += this.print_g_reg(this.getbits(command, 19, 4));
        msg += this.print_set_op(0x01);
        // '='
        msg += this.print_reg_or_data(command, this.getbits(command, 60, 1), 47);
        break;
      case 6: // Set system reg 8 (Highlighted button)
        msg += this.print_system_reg(8);
        if (this.getbits(command, 60, 1)) { // immediate
          msg += sprintf(' = %s (button no %d)', utils.toHex(this.getbits(command, 31, 16)), this.getbits(command, 31, 6));
        } else {
          //msg += sprintf(" = g[%" PRIu8 "]", this.getbits(command, 19, 4));
          msg += sprintf(' = g[%s]', utils.toHex(this.getbits(command, 19, 4)));
        }
        break;
      default:
        console.error('jsdvdnav: Unknown system set instruction (%i)', this.getbits(command, 59, 4));
    }

    return msg;
  }

  private print_set_version_1(command) {
    var msg = '';
    var set_op = this.getbits(command, 59, 4);

    if (set_op) {
      msg += this.print_g_reg(this.getbits(command, 35, 4));
      msg += this.print_set_op(set_op);
      msg += this.print_reg_or_data(command, this.getbits(command, 60, 1), 31);
    } else {
      msg += 'NOP';
    }

    return msg;
  }

  private print_set_version_2(command) {
    var msg = '';
    var set_op = this.getbits(command, 59, 4);

    if (set_op) {
      msg += this.print_g_reg(this.getbits(command, 51, 4));
      msg += this.print_set_op(set_op);
      msg += this.print_reg_or_data(command, this.getbits(command, 60, 1), 47);
    } else {
      msg += 'NOP';
    }

    return msg;
  }

  private print_set_version_3(command) {
    var msg = '';
    var set_op = this.getbits(command, 59, 4);

    if (set_op) {
      msg += this.print_g_reg(this.getbits(command, 51, 4));
      msg += this.print_set_op(set_op);
      msg += this.print_reg_or_data_3(command, this.getbits(command, 60, 1), 47);
    } else {
      msg += 'NOP';
    }

    return msg;
  }

  private print_mnemonic(vm_command) {
    var msg = '';
    var command = new Command();
    command.instruction = vm_command.bytes.map(function(byte: number) {
      return sprintf('%08i', (byte).toString(2));
    }).join('');
    command.examined = 0;

    switch (this.getbits(command, 63, 3)) { // three first bits
      case 0: // Special instructions
        msg += this.print_if_version_1(command);
        msg += this.print_special_instruction(command);
        break;
      case 1: // Jump/Call or Link instructions
        if (this.getbits(command, 60, 1)) {
          msg += this.print_if_version_2(command);
          msg += this.print_jump_instruction(command);
        } else {
          msg += this.print_if_version_1(command);
          msg += this.print_link_instruction(command, false);
          // must be present
        }
        break;
      case 2: // Set System Parameters instructions
        msg += this.print_if_version_2(command);
        msg += this.print_system_set(command);
        msg += this.print_link_instruction(command, true);
        // either if or link
        break;
      case 3: // Set General Parameters instructions
        msg += this.print_if_version_3(command);
        msg += this.print_set_version_1(command);
        msg += this.print_link_instruction(command, true);
        // either if or link
        break;
      case 4: // Set, Compare -> LinkSub instructions
        msg += this.print_set_version_2(command);
        msg += ', ';
        msg += this.print_if_version_4(command);
        msg += this.print_linksub_instruction(command);
        break;
      case 5: // Compare -> (Set and LinkSub) instructions
        msg += this.print_if_version_5(command);
        msg += '{ ';
        msg += this.print_set_version_3(command);
        msg += ', ';
        msg += this.print_linksub_instruction(command);
        msg += ' }';
        break;
      case 6: // Compare -> Set, always LinkSub instructions
        msg += this.print_if_version_5(command);
        msg += '{ ';
        msg += this.print_set_version_3(command);
        msg += ' } ';
        msg += this.print_linksub_instruction(command);
        break;
      default:
        console.error('jsdvdnav: Unknown instruction type (%i)', this.getbits(command, 63, 3));
    }
    // Check if there still are bits set that were not examined.

    if (Number(command.instruction) & ~command.examined) {
      console.error('jsdvdnav: Unknown bits: %s', (Number(command.instruction) & ~command.examined));
      //console.error(" %08"PRIx64, (command.instruction & ~ command.examined) );
    }

    return msg;
  }

  public print_cmd(row, vm_command) {
    var msg = sprintf('(%03d) ', row + 1);

    for (var i = 0; i < 8; i++)
      msg += sprintf('%s ', utils.toHex(vm_command.bytes[i]));
    msg += '| ';

    msg += this.print_mnemonic(vm_command);

    return msg;
  }
}
