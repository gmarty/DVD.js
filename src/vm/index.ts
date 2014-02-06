'use strict';


import config = require('../config');
import utils = require('../utils');
import dvdTypes = require('../dvdnav/dvd_types');
import ifoRead = require('../dvdread/ifo_read');

var TRACE = config.DEBUG;
var DVD_MENU_LANGUAGE = config.DVD_MENU_LANGUAGE;
var DVD_AUDIO_LANGUAGE = config.DVD_AUDIO_LANGUAGE;
var DVD_SPU_LANGUAGE = config.DVD_SPU_LANGUAGE;
var COUNTRY_CODE = config.COUNTRY_CODE;
var deepEqual = utils.deepEqual;
var sprintf = utils.sprintf;
var assert = utils.assert;
var DVDMenuID_t = dvdTypes.DVDMenuID_t;
var DVDDomain_t = dvdTypes.DVDDomain_t;

export = vm;

/**
 * @param {?Object} dvd
 */
function vm(dvd?) {
  this.dvd = dvd;
  this.vmgi = null;
  this.vtsi = null;
  this.state = null;
  this.hop_channel = 0;
  this.dvd_name = Array(50);
  this.dvd_serial = Array(15);
  this.stopped = false;
}

/**
 * State: SPRM, GPRM, Domain, pgc, pgN, cellN, ?
 */
function dvd_state_t() {
  this.registers = new registers_t();

  this.domain = 0;
  this.vtsN = 0;            // 0 is vmgm?
  this.pgc = null;          // either this or 'int pgcN' is enough?
  this.pgcN = 0;            // but provide pgcN for quick lookup
  this.pgN = 0;             // is this needed? Can always find pgN from cellN?
  this.cellN = 0;
  this.cell_restart = 0;    // get cell to restart
  this.blockN = 0;

  // Resume info
  this.rsm_vtsN = 0;
  this.rsm_blockN = 0;      // of nav_packet
  this.rsm_regs = Array(5); // system registers 4-8
  this.rsm_pgcN = 0;
  this.rsm_cellN = 0;
}

// link command types
enum link_cmd_t {
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

// a link's data set
function link_t() {
  this.command = 0; // link_cmd_t
  this.data1 = 0;
  this.data2 = 0;
  this.data3 = 0;
}

// the VM registers
function registers_t() {
  this.SPRM = new Array(24);
  this.GPRM = new Array(16);
  this.GPRM_mode = new Array(16); // Need to have something to indicate normal/counter mode for every GPRM
  this.GPRM_time = new Array(16); // For counter mode
}

// a VM command data set
function command_t() {
  this.instruction = null;
  this.examined = null;
  this.registers = new registers_t();
}

function vm_position_t() {
  this.button = 0;                // Button highlighted
  this.vts = 0;                   // vts number to use
  this.domain = 0;                // domain to use
  this.spu_channel = 0;           // spu channel to use
  this.angle_channel = 0;         // angle channel to use
  this.audio_channel = 0;         // audio channel to use
  this.hop_channel = 0;           // channel hopping. E.g menu button pressed

  // Currently unused
  //this.title = 0;                 // title number
  //this.chapter = 0;               // chapter number

  this.cell = 0;                  // cell number
  this.cell_restart = 0;          // get cell to restart
  this.cell_start = 0;            // sector number of start of current cell in use
  this.still = 0;                 // is cell still
  this.block = 0;                 // block number within cell in use
}

// @todo Move to another file and import in vm/index.ts and dvdnav/index.ts.
vm.vm_position_t = vm_position_t; // We need to export it for dvdnav/index.ts.

// Initialisation & Destruction
vm.prototype.free_vm = function() {
};


// IFO Access
vm.prototype.get_vmgi = function() {
  return this.vmgi;
};

vm.prototype.get_vtsi = function() {
  return this.vtsi;
};


// Reader Access
vm.prototype.get_dvd_reader = function() {
  return this.dvd;
};


// Basic Handling
vm.prototype.start = function() {
  if (this.stopped) {
    //if (!this.reset())
    //return false;

    this.stopped = false;
  }

  // Set pgc to FP (First Play) pgc
  this.set_FP_PGC();
  this.process_command(this.play_PGC());

  console.log(this);

  return !this.stopped;
};

vm.prototype.stop = function() {
  this.stopped = true;
};

vm.prototype.close = function() {
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
};

vm.prototype.reset = function(dvdroot, cb) {
  // Setup State
  this.state = new dvd_state_t();
  this.state.registers.SPRM[0] = DVD_MENU_LANGUAGE.charCodeAt(1);   // Player Menu Language code
  this.state.registers.SPRM[1] = DVD_MENU_LANGUAGE.charCodeAt(0);   // Player Menu Language code
  this.state.AST_REG = 15;          // 15 why?
  this.state.SPST_REG = 62;         // 62 why?
  this.state.AGL_REG = 1;
  this.state.TTN_REG = 1;
  this.state.VTS_TTN_REG = 1;
  //this.state.TT_PGCN_REG = 0;
  this.state.PTTN_REG = 1;
  this.state.HL_BTNN_REG = 1 << 10;
  this.state.PTL_REG = 15;                          // Parental Level
  this.state.registers.SPRM[12] = COUNTRY_CODE.charCodeAt(1);       // Parental Management Country Code
  this.state.registers.SPRM[13] = COUNTRY_CODE.charCodeAt(0);       // Parental Management Country Code
  this.state.registers.SPRM[16] = DVD_AUDIO_LANGUAGE.charCodeAt(1); // Initial Language Code for Audio
  this.state.registers.SPRM[17] = DVD_AUDIO_LANGUAGE.charCodeAt(0); // Initial Language Code for Audio
  this.state.registers.SPRM[18] = DVD_SPU_LANGUAGE.charCodeAt(1);   // Initial Language Code for Spu
  this.state.registers.SPRM[19] = DVD_SPU_LANGUAGE.charCodeAt(0);   // Initial Language Code for Spu
  this.state.registers.SPRM[20] = 0x01;              // Player Regional Code Mask. Region free!
  this.state.registers.SPRM[14] = 0x0100;            // Try Pan&Scan

  this.state.pgN = 0;
  this.state.cellN = 0;
  this.state.cell_restart = 0;

  this.state.domain = DVDDomain_t.DVD_DOMAIN_FirstPlay;
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
      return false;
    }

    if (this.vmgi) {
      var msg = sprintf('jsdvdnav: DVD disc reports itself with Region mask %s. Regions:',
        utils.toHex(this.vmgi.vmgi_mat.vmg_category));
      for (var i = 1, mask = 1; i <= 8; i++, mask <<= 1)
        if (((this.vmgi.vmgi_mat.vmg_category >> 16) & mask) == 0)
          msg += sprintf(' %d', i);
      console.log(msg);
    }

    cb.call();
  }.bind(this));
};

vm.prototype.ifoOpenNewVTSI = function(vtsN) {
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
};

// Copying and merging.
vm.prototype.new_copy = function() {
  var target = new vm();
  var vtsN;
  var pgcN = this.get_PGCN();
  var pgN = this.state.pgN;

  if (target == null || pgcN == 0) {
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
    if (!this.set_PGCN(target, pgcN)) {
      fail();
      return null;
    }

    (target.state).pgN = pgN;
  }

  return target;

  function fail() {
    if (target != null)
      this.free_vm(target);
  }
};

vm.prototype.merge = function(target) {
  if (target.vtsi) {
    target.vtsi = null;
  }
  // @todo Copy properties of this to target.
};

vm.prototype.free_copy = function() {
  if (this.vtsi) {
    this.vtsi = null;
  }
};


// Regular playback
// @todo Rename to get_position.
vm.prototype.position_get = function() {
  var position = new vm_position_t();

  position.button = this.state.HL_BTNN_REG >> 10;
  position.vts = this.state.vtsN;
  position.domain = this.state.domain;
  position.spu_channel = this.state.SPST_REG;
  position.audio_channel = this.state.AST_REG;
  position.angle_channel = this.state.AGL_REG;
  position.hop_channel = this.hop_channel; // Increases by one on each hop.
  position.cell = this.state.cellN;
  position.cell_restart = this.state.cell_restart;
  position.cell_start = this.state.pgc.cell_playback[this.state.cellN - 1].first_sector;
  position.still = this.state.pgc.cell_playback[this.state.cellN - 1].still_time;
  position.block = this.state.blockN;

  // Handle PGC stills at PGC end.
  if (this.state.cellN == this.state.pgc.nr_of_cells)
    position.still += this.state.pgc.still_time;
  // Still already determined
  if (position.still)
    return;

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
    if (!time || size / time > 30)
    // datarate is too high, it might be a very short, but regular cell
      return;
    if (time > 0xFF) time = 0xFF;
    position.still = time;
  }

  return position;
};

vm.prototype.get_next_cell = function() {
  this.process_command(this.play_Cell_post());
};


// Jumping
vm.prototype.jump_pg = function(pg) {
  this.state.pgN = pg;
  this.process_command(this.play_PG());
  return true;
};

vm.prototype.jump_cell_block = function(cell, block) {
  this.state.cellN = cell;
  this.process_command(this.play_Cell());
  // play_Cell can jump to a different cell in case of angles
  if (this.state.cellN == cell)
    this.state.blockN = block;
  return true;
};

vm.prototype.jump_title_program = function(title, pgcn, pgn) {
  var link;

  if (!this.set_PROG(title, pgcn, pgn))
    return false;
  /* Some DVDs do not want us to jump directly into a title and have
   * PGC pre commands taking us back to some menu. Since we do not like that,
   * we do not execute PGC pre commands that would do a jump. */
  // this.process_command(this.play_PGC_PG(this.state.pgN));
  link = this.play_PGC_PG(this.state.pgN);
  if (link.command != link_cmd_t.PlayThis)
  // jump occured. ignore it and play the PG anyway
    this.process_command(this.play_PG());
  else
    this.process_command(link);
  return true;
};

vm.prototype.jump_title_part = function(title, part) {
  var link;

  if (!this.set_PTT(title, part))
    return false;
  /* Some DVDs do not want us to jump directly into a title and have
   * PGC pre commands taking us back to some menu. Since we do not like that,
   * we do not execute PGC pre commands that would do a jump. */
  // this.process_command(this.play_PGC_PG(this.state.pgN));
  link = this.play_PGC_PG(this.state.pgN);
  if (link.command != link_cmd_t.PlayThis)
  // jump occured. ignore it and play the PG anyway
    this.process_command(this.play_PG());
  else
    this.process_command(link);
  return true;
};

vm.prototype.jump_top_pg = function() {
  this.process_command(this.play_PG());
  return true;
}

vm.prototype.jump_next_pg = function() {
  if (this.state.pgN >= this.state.pgc.nr_of_programs) {
    // last program. move to TailPGC
    this.process_command(this.play_PGC_post());
    return true;
  } else {
    this.jump_pg(this.state.pgN + 1);
    return true;
  }
};

vm.prototype.jump_prev_pg = function() {
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
};

vm.prototype.jump_up = function() {
  if (this.state.pgc.goup_pgc_nr && this.set_PGCN(this.state.pgc.goup_pgc_nr)) {
    this.process_command(this.play_PGC());
    return true;
  }
  return false;
};

vm.prototype.jump_menu = function(menuid) {
  var old_domain = this.state.domain;

  switch (this.state.domain) {
    case DVDDomain_t.DVD_DOMAIN_VTSTitle:
      this.set_RSMinfo(0, this.state.blockN);
    // FALL THROUGH
    case DVDDomain_t.DVD_DOMAIN_VTSMenu:
    case DVDDomain_t.DVD_DOMAIN_VMGM:
      switch (menuid) {
        case DVDMenuID_t.DVD_MENU_Title:
        case DVDMenuID_t.DVD_MENU_Escape:
          if (this.vmgi == null || this.vmgi.pgci_ut == null) {
            return false;
          }
          this.state.domain = DVDDomain_t.DVD_DOMAIN_VMGM;
          break;
        case DVDMenuID_t.DVD_MENU_Root:
        case DVDMenuID_t.DVD_MENU_Subpicture:
        case DVDMenuID_t.DVD_MENU_Audio:
        case DVDMenuID_t.DVD_MENU_Angle:
        case DVDMenuID_t.DVD_MENU_Part:
          if (this.vtsi == null || this.vtsi.pgci_ut == null) {
            return false;
          }
          this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSMenu;
          break;
      }
      if (this.get_PGCIT() && this.set_MENU(menuid)) {
        this.process_command(this.play_PGC());
        return true; // Jump
      } else {
        this.state.domain = old_domain;
      }
      break;
    case DVDDomain_t.DVD_DOMAIN_FirstPlay: // FIXME XXX $$$ What should we do here?
      break;
  }

  return false;
};

vm.prototype.jump_resume = function() {
  var link_values = new link_t();
  link_values.command = link_cmd_t.LinkRSM;
  link_values.data1 = 0;
  link_values.data2 = 0;
  link_values.data3 = 0;

  if (!this.state.rsm_vtsN) // Do we have resume info?
    return false;
  if (!this.process_command(link_values))
    return false;
  return true;
};

vm.prototype.exec_cmd = function(cmd) {
  var link_values = new link_t();

  if (this.evalCMD(cmd, 1, link_values))
    return this.process_command(link_values);
  else
    return false; // It updated some state that's all...
};


// getting information
vm.prototype.get_current_menu = function(menuid) {
  var pgcn = this.state.pgcN;

  var pgcit = this.get_PGCIT();
  if (!pgcit)
    return false;

  menuid = pgcit.pgci_srp[pgcn - 1].entry_id & 0x0F;
  return true;
};

vm.prototype.get_current_title_part = function(title_result, part_result) {
  var vts_ptt_srpt;
  var title, part = 0, vts_ttn;
  var found;
  var pgcN, pgN;

  vts_ptt_srpt = this.vtsi.vts_ptt_srpt;
  pgcN = this.get_PGCN();
  pgN = this.state.pgN;

  console.log(vts_ptt_srpt, pgcN, pgN);

  found = 0;
  for (vts_ttn = 0; (vts_ttn < vts_ptt_srpt.nr_of_srpts) && !found; vts_ttn++) {
    for (part = 0; (part < vts_ptt_srpt.title[vts_ttn].nr_of_ptts) && !found; part++) {
      if (vts_ptt_srpt.title[vts_ttn].ptt[part].pgcn == pgcN) {
        if (vts_ptt_srpt.title[vts_ttn].ptt[part].pgn == pgN) {
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
    return false;
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
  title_result = title;
  part_result = part;
  return true;
};

/* Return the substream id for 'logical' audio stream audioN.
 * 0 <= audioN < 8
 */
vm.prototype.get_audio_stream = function(audioN) {
  var streamN = -1;

  if (this.state.domain != DVDDomain_t.DVD_DOMAIN_VTSTitle)
    audioN = 0;

  if (audioN < 8) {
    // Is there any control info for this logical stream
    if (this.state.pgc.audio_control[audioN] & (1 << 15)) {
      streamN = (this.state.pgc.audio_control[audioN] >> 8) & 0x07;
    }
  }

  if (this.state.domain != DVDDomain_t.DVD_DOMAIN_VTSTitle && streamN == -1)
    streamN = 0;

  // FIXME: Should also check in vtsi/vmgi status what kind of stream it is (ac3/lpcm/dts/sdds...)
  // to find the right (sub)stream id.
  return streamN;
};

/* Return the substream id for 'logical' subpicture stream subpN and given mode.
 * 0 <= subpN < 32
 * mode == 0 - widescreen
 * mode == 1 - letterbox
 * mode == 2 - pan&scan
 */
vm.prototype.get_subp_stream = function(subpN, mode) {
  var streamN = -1;
  var source_aspect = this.get_video_aspect();

  if (this.state.domain != DVDDomain_t.DVD_DOMAIN_VTSTitle)
    subpN = 0;

  if (subpN < 32) { // a valid logical stream
    // Is this logical stream present
    if (this.state.pgc.subp_control[subpN] & (1 << 31)) {
      if (source_aspect == 0) // 4:3
        streamN = (this.state.pgc.subp_control[subpN] >> 24) & 0x1F;
      if (source_aspect == 3) // 16:9
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

  if (this.state.domain != DVDDomain_t.DVD_DOMAIN_VTSTitle && streamN == -1)
    streamN = 0;

  // FIXME: Should also check in vtsi/vmgi status what kind of stream it is.
  return streamN;
};

vm.prototype.get_audio_active_stream = function() {
  var audioN = this.state.AST_REG;
  var streamN = this.get_audio_stream(audioN);

  // If no such stream, then select the first one that exists.
  if (streamN == -1) {
    for (audioN = 0; audioN < 8; audioN++) {
      if (this.state.pgc.audio_control[audioN] & (1 << 15)) {
        if ((streamN = this.get_audio_stream(audioN)) >= 0)
          break;
      }
    }
  }

  return streamN;
};

vm.prototype.get_subp_active_stream = function(mode) {
  var subpN = this.state.SPST_REG & ~0x40;
  var streamN = this.get_subp_stream(subpN, mode);

  // If no such stream, then select the first one that exists.
  if (streamN == -1) {
    for (subpN = 0; subpN < 32; subpN++) {
      if (this.state.pgc.subp_control[subpN] & (1 << 31)) {
        if ((streamN = this.get_subp_stream(subpN, mode)) >= 0)
          break;
      }
    }
  }

  if (this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle && !(this.state.SPST_REG & 0x40))
  // Bit 7 set means hide, and only let Forced display show.
    return (streamN | 0x80);
  else
    return streamN;
};

vm.prototype.get_angle_info = function() {
  var current = 1;
  var num_avail = 1;

  if (this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle) {
    // TTN_REG does not always point to the correct title.
    if (this.state.TTN_REG > this.vmgi.tt_srpt.nr_of_srpts) {
      return {current: current, num_avail: num_avail};
    }
    var title = this.vmgi.tt_srpt.title[this.state.TTN_REG - 1];
    if (title.title_set_nr != this.state.vtsN || title.vts_ttn != this.state.VTS_TTN_REG) {
      return {current: current, num_avail: num_avail};
    }
    current = this.state.AGL_REG;
    num_avail = title.nr_of_angles;
  }

  return {current: current, num_avail: num_avail};
};

// currently unused
/*   vm.prototype.get_audio_info = function(current, num_avail) {
 switch (this.state.domain) {
 case DVDDomain_t.DVD_DOMAIN_VTSTitle:
 *num_avail = this.vtsi.vtsi_mat.nr_of_vts_audio_streams;
 *current = this.state.AST_REG;
 break;
 case DVDDomain_t.DVD_DOMAIN_VTSMenu:
 *num_avail = this.vtsi.vtsi_mat.nr_of_vtsm_audio_streams; // 1
 *current = 1;
 break;
 case DVDDomain_t.DVD_DOMAIN_VMGM:
 case DVDDomain_t.DVD_DOMAIN_FirstPlay:
 *num_avail = this.vmgi.vmgi_mat.nr_of_vmgm_audio_streams; // 1
 *current = 1;
 break;
 }
 }*/

// currently unused
/* vm.prototype.get_subp_info = function(current, num_avail) {
 switch (this.state.domain) {
 case DVDDomain_t.DVD_DOMAIN_VTSTitle:
 *num_avail = this.vtsi.vtsi_mat.nr_of_vts_subp_streams;
 *current = this.state.SPST_REG;
 break;
 case DVDDomain_t.DVD_DOMAIN_VTSMenu:
 *num_avail = this.vtsi.vtsi_mat.nr_of_vtsm_subp_streams; // 1
 *current = 0x41;
 break;
 case DVDDomain_t.DVD_DOMAIN_VMGM:
 case DVDDomain_t.DVD_DOMAIN_FirstPlay:
 *num_avail = this.vmgi.vmgi_mat.nr_of_vmgm_subp_streams; // 1
 *current = 0x41;
 break;
 }
 }*/

vm.prototype.get_video_res = function(width, height) {
  var attr = this.get_video_attr();

  if (attr.video_format != 0)
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
};

vm.prototype.get_video_aspect = function() {
  var aspect = this.get_video_attr().display_aspect_ratio;

  assert(aspect == 0 || aspect == 3);
  this.state.registers.SPRM[14] &= ~(0x03 << 10);
  this.state.registers.SPRM[14] |= aspect << 10;

  return aspect;
};

vm.prototype.get_video_scale_permission = function() {
  return this.get_video_attr().permitted_df;
};

vm.prototype.get_video_attr = function() {
  switch (this.state.domain) {
    case DVDDomain_t.DVD_DOMAIN_VTSTitle:
      return this.vtsi.vtsi_mat.vts_video_attr;
    case DVDDomain_t.DVD_DOMAIN_VTSMenu:
      return this.vtsi.vtsi_mat.vtsm_video_attr;
    case DVDDomain_t.DVD_DOMAIN_VMGM:
    case DVDDomain_t.DVD_DOMAIN_FirstPlay:
      return this.vmgi.vmgi_mat.vmgm_video_attr;
    default:
      abort();
  }
};

vm.prototype.get_audio_attr = function(streamN) {
  switch (this.state.domain) {
    case DVDDomain_t.DVD_DOMAIN_VTSTitle:
      return this.vtsi.vtsi_mat.vts_audio_attr[streamN];
    case DVDDomain_t.DVD_DOMAIN_VTSMenu:
      return this.vtsi.vtsi_mat.vtsm_audio_attr;
    case DVDDomain_t.DVD_DOMAIN_VMGM:
    case DVDDomain_t.DVD_DOMAIN_FirstPlay:
      return this.vmgi.vmgi_mat.vmgm_audio_attr;
    default:
      abort();
  }
};

vm.prototype.get_subp_attr = function(streamN) {
  switch (this.state.domain) {
    case DVDDomain_t.DVD_DOMAIN_VTSTitle:
      return this.vtsi.vtsi_mat.vts_subp_attr[streamN];
    case DVDDomain_t.DVD_DOMAIN_VTSMenu:
      return this.vtsi.vtsi_mat.vtsm_subp_attr;
    case DVDDomain_t.DVD_DOMAIN_VMGM:
    case DVDDomain_t.DVD_DOMAIN_FirstPlay:
      return this.vmgi.vmgi_mat.vmgm_subp_attr;
    default:
      abort();
  }
};


// Playback control
vm.prototype.play_PGC = function() {
  var link_values = new link_t();

  if (TRACE) {
    var msg = 'jsdvdnav: play_PGC:';
    if (this.state.domain != DVDDomain_t.DVD_DOMAIN_FirstPlay) {
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
      // link_values contains the 'jump' return value
      return link_values;
    } else if (TRACE) {
      console.log('jsdvdnav: PGC pre commands didn\'t do a Jump, Link or Call');
    }
  }
  return this.play_PG();
};

vm.prototype.play_PGC_PG = function(pgN) {
  var link_values = new link_t();

  if (TRACE) {
    var msg = 'jsdvdnav: play_PGC_PG:';
    if (this.state.domain != DVDDomain_t.DVD_DOMAIN_FirstPlay) {
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
      // link_values contains the 'jump' return value
      return link_values;
    } else if (TRACE) {
      console.log('jsdvdnav: PGC pre commands didn\'t do a Jump, Link or Call');
    }
  }
  return this.play_PG();
};

vm.prototype.play_PGC_post = function() {
  var link_values = new link_t();
  link_values.command = link_cmd_t.LinkNoLink;
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
    link_values.command = link_cmd_t.Exit;
    return link_values;
  }
  return this.play_PGC();
};

vm.prototype.play_PG = function() {
  if (TRACE) {
    console.log('jsdvdnav: play_PG: this.state.pgN (%i)', this.state.pgN);
  }

  assert(this.state.pgN > 0);
  if (this.state.pgN > this.state.pgc.nr_of_programs) {
    if (TRACE) {
      console.log('jsdvdnav: play_PG: this.state.pgN (%i) > pgc.nr_of_programs (%i)', this.state.pgN, this.state.pgc.nr_of_programs);
    }
    assert(this.state.pgN == this.state.pgc.nr_of_programs + 1);
    return this.play_PGC_post();
  }

  this.state.cellN = this.state.pgc.program_map[this.state.pgN - 1];

  return this.play_Cell();
};

vm.prototype.play_Cell = function() {
  var play_this = new link_t();
  play_this.command = link_cmd_t.PlayThis;
  play_this.data1 = 0;
  play_this.data2 = 0;
  play_this.data3 = 0;

  if (TRACE) {
    console.log('jsdvdnav: play_Cell: this.state.cellN (%i)', this.state.cellN);
  }

  assert(this.state.cellN > 0);
  if (this.state.cellN > this.state.pgc.nr_of_cells) {
    if (TRACE) {
      console.log('jsdvdnav: this.state.cellN (%i) > pgc.nr_of_cells (%i)',
        this.state.cellN, this.state.pgc.nr_of_cells);
    }
    assert(this.state.cellN == this.state.pgc.nr_of_cells + 1);
    return this.play_PGC_post();
  }

  // Multi angle/Interleaved
  switch (this.state.pgc.cell_playback[this.state.cellN - 1].block_mode) {
    case 0: // Normal
      assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_type == 0);
      break;
    case 1: // The first cell in the block
      switch (this.state.pgc.cell_playback[this.state.cellN - 1].block_type) {
        case 0: // Not part of a block
          assert(0);
          break;
        case 1: // Angle block
          // Loop and check each cell instead? So we don't get outside the block?
          this.state.cellN += this.state.AGL_REG - 1;
          if (false) {
            assert(this.state.cellN <= this.state.pgc.nr_of_cells);
            assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_mode != 0);
            assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_type == 1);
          } else {
            if (!(this.state.cellN <= this.state.pgc.nr_of_cells) || !(this.state.pgc.cell_playback[this.state.cellN - 1].block_mode != 0) || !(this.state.pgc.cell_playback[this.state.cellN - 1].block_type == 1)) {
              console.error('jsdvdnav: Invalid angle block');
              this.state.cellN -= this.state.AGL_REG - 1;
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
};

vm.prototype.play_Cell_post = function() {
  var cell;

  if (TRACE) {
    console.log('jsdvdnav: play_Cell_post: this.state.cellN (%i)', this.state.cellN);
  }

  cell = this.state.pgc.cell_playback[this.state.cellN - 1];

  // Still time is already taken care of before we get called.

  // Deal with a Cell command, if any
  if (cell.cell_cmd_nr != 0) {
    var link_values = new link_t();

    if (this.state.pgc.command_tbl != null && this.state.pgc.command_tbl.nr_of_cell >= cell.cell_cmd_nr) {
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
      assert(this.state.pgc.cell_playback[this.state.cellN - 1].block_type == 0);
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
          // Skip the 'other' angles
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
};


// link processing
vm.prototype.process_command = function(link_values) {
  while (link_values.command != link_cmd_t.PlayThis) {
    if (TRACE) {
      console.group('Process command');
      this.print_link(link_values);
      console.log('jsdvdnav: Link values', link_values.command, link_values.data1, link_values.data2, link_values.data3);
      this.print_current_domain_state();
      console.groupEnd();
    }

    switch (link_values.command) {
      case link_cmd_t.LinkNoLink:
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        return false;  // no actual jump
      case link_cmd_t.LinkTopC:
        // Restart playing from the beginning of the current Cell.
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        link_values = this.play_Cell();
        break;
      case link_cmd_t.LinkNextC:
        // Link to Next Cell
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        this.state.cellN += 1;
        link_values = this.play_Cell();
        break;
      case link_cmd_t.LinkPrevC:
        // Link to Previous Cell
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        assert(this.state.cellN > 1);
        this.state.cellN -= 1;
        link_values = this.play_Cell();
        break;
      case link_cmd_t.LinkTopPG:
        // Link to Top of current Program
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        link_values = this.play_PG();
        break;
      case link_cmd_t.LinkNextPG:
        // Link to Next Program
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        this.state.pgN += 1;
        link_values = this.play_PG();
        break;
      case link_cmd_t.LinkPrevPG:
        // Link to Previous Program
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        assert(this.state.pgN > 1);
        this.state.pgN -= 1;
        link_values = this.play_PG();
        break;
      case link_cmd_t.LinkTopPGC:
        // Restart playing from beginning of current Program Chain
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        link_values = this.play_PGC();
        break;
      case link_cmd_t.LinkNextPGC:
        // Link to Next Program Chain
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        assert(this.state.pgc.next_pgc_nr != 0);
        if (this.set_PGCN(this.state.pgc.next_pgc_nr))
          link_values = this.play_PGC();
        else
          link_values.command = link_cmd_t.Exit;
        break;
      case link_cmd_t.LinkPrevPGC:
        // Link to Previous Program Chain
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        assert(this.state.pgc.prev_pgc_nr != 0);
        if (this.set_PGCN(this.state.pgc.prev_pgc_nr))
          link_values = this.play_PGC();
        else
          link_values.command = link_cmd_t.Exit;
        break;
      case link_cmd_t.LinkGoUpPGC:
        // Link to GoUp Program Chain
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        assert(this.state.pgc.goup_pgc_nr != 0);
        if (this.set_PGCN(this.state.pgc.goup_pgc_nr))
          link_values = this.play_PGC();
        else
          link_values.command = link_cmd_t.Exit;
        break;
      case link_cmd_t.LinkTailPGC:
        // Link to Tail of Program Chain
        // BUTTON number:data1
        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;
        link_values = this.play_PGC_post();
        break;
      case link_cmd_t.LinkRSM:
        // Link to Resume point
        var i;

        // Check and see if there is any rsm info!!
        if (!this.state.rsm_vtsN) {
          console.error('jsdvdnav: Trying to resume without any resume info set');
          link_values.command = link_cmd_t.Exit;
          break;
        }

        this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSTitle;
        if (!this.ifoOpenNewVTSI(this.state.rsm_vtsN))
          assert(0);
        this.set_PGCN(this.state.rsm_pgcN);

        // These should never be set in SystemSpace and/or MenuSpace
        // this.state.TTN_REG = rsm_tt; ??
        // this.state.TT_PGCN_REG = this.state.rsm_pgcN; ??
        for (i = 0; i < 5; i++) {
          this.state.registers.SPRM[4 + i] = this.state.rsm_regs[i];
        }

        if (link_values.data1 != 0)
          this.state.HL_BTNN_REG = link_values.data1 << 10;

        if (this.state.rsm_cellN == 0) {
          assert(this.state.cellN); // Checking if this ever happens
          this.state.pgN = 1;
          link_values = this.play_PG();
        } else {
          // this.state.pgN = ?? this gets the right value in set_PGN() below
          this.state.cellN = this.state.rsm_cellN;
          link_values.command = link_cmd_t.PlayThis;
          link_values.data1 = this.state.rsm_blockN & 0xFFFF;
          link_values.data2 = this.state.rsm_blockN >> 16;
          if (!this.set_PGN()) {
            // Were at the end of the PGC, should not happen for a RSM
            assert(0);
            link_values.command = link_cmd_t.LinkTailPGC;
            link_values.data1 = 0;  // No button
          }
        }
        break;
      case link_cmd_t.LinkPGCN:
        // Link to Program Chain Number:data1
        if (!this.set_PGCN(link_values.data1))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.LinkPTTN:
        // Link to Part of current Title Number:data1
        // BUTTON number:data2
        // PGC Pre-Commands are not executed
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle);
        if (link_values.data2 != 0)
          this.state.HL_BTNN_REG = link_values.data2 << 10;
        if (!this.set_VTS_PTT(this.state.vtsN, this.state.VTS_TTN_REG, link_values.data1))
          link_values.command = link_cmd_t.Exit;
        else
          link_values = this.play_PG();
        break;
      case link_cmd_t.LinkPGN:
        // Link to Program Number:data1
        // BUTTON number:data2
        if (link_values.data2 != 0)
          this.state.HL_BTNN_REG = link_values.data2 << 10;
        // Update any other state, PTTN perhaps?
        this.state.pgN = link_values.data1;
        link_values = this.play_PG();
        break;
      case link_cmd_t.LinkCN:
        // Link to Cell Number:data1
        // BUTTON number:data2
        if (link_values.data2 != 0)
          this.state.HL_BTNN_REG = link_values.data2 << 10;
        // Update any other state, pgN, PTTN perhaps?
        this.state.cellN = link_values.data1;
        link_values = this.play_Cell();
        break;
      case link_cmd_t.Exit:
        this.stopped = true;
        return false;
      case link_cmd_t.JumpTT:
        // Jump to VTS Title Domain
        // Only allowed from the First Play domain(PGC)
        // or the Video Manager domain (VMG)
        // Stop SPRM9 Timer
        // Set SPRM1 and SPRM2
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VMGM || this.state.domain == DVDDomain_t.DVD_DOMAIN_FirstPlay); // ??
        if (this.set_TT(link_values.data1))
          link_values = this.play_PGC();
        else
          link_values.command = link_cmd_t.Exit;
        break;
      case link_cmd_t.JumpVTS_TT:
        // Jump to Title:data1 in same VTS Title Domain
        // Only allowed from the VTS Menu Domain(VTSM)
        // or the Video Title Set Domain(VTS)
        // Stop SPRM9 Timer
        // Set SPRM1 and SPRM2
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSMenu || this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        if (!this.set_VTS_TT(this.state.vtsN, link_values.data1))
          link_values.command = link_cmd_t.Exit;
        else
          link_values = this.play_PGC();
        break;
      case link_cmd_t.JumpVTS_PTT:
        // Jump to Part:data2 of Title:data1 in same VTS Title Domain
        // Only allowed from the VTS Menu Domain(VTSM)
        // or the Video Title Set Domain(VTS)
        // Stop SPRM9 Timer
        // Set SPRM1 and SPRM2
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSMenu || this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        if (!this.set_VTS_PTT(this.state.vtsN, link_values.data1, link_values.data2))
          link_values.command = link_cmd_t.Exit;
        else
          link_values = this.play_PGC_PG(this.state.pgN);
        break;
      case link_cmd_t.JumpSS_FP:
        // Jump to First Play Domain
        // Only allowed from the VTS Menu Domain(VTSM)
        // or the Video Manager domain (VMG)
        // Stop SPRM9 Timer and any GPRM counters
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VMGM || this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSMenu); // ??
        if (!this.set_FP_PGC())
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.JumpSS_VMGM_MENU:
        // Jump to Video Manager domain - Title Menu:data1 or any PGC in VMG
        // Allowed from anywhere except the VTS Title domain
        // Stop SPRM9 Timer and any GPRM counters
        assert(this.state.domain != DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        if (this.vmgi == null || this.vmgi.pgci_ut == null) {
          link_values.command = link_cmd_t.Exit;
          break;
        }
        this.state.domain = DVDDomain_t.DVD_DOMAIN_VMGM;
        if (!this.set_MENU(link_values.data1))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.JumpSS_VTSM:
        // Jump to a menu in Video Title domain,
        // or to a Menu is the current VTS
        // Stop SPRM9 Timer and any GPRM counters
        // ifoOpenNewVTSI:data1
        // VTS_TTN_REG:data2
        // get_MENU:data3
        if (link_values.data1 != 0) {
          if (link_values.data1 != this.state.vtsN) {
            // the normal case
            assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VMGM || this.state.domain == DVDDomain_t.DVD_DOMAIN_FirstPlay); // ??
            if (!this.ifoOpenNewVTSI(link_values.data1))  // Also sets this.state.vtsN
              assert(0);
            if (this.vtsi == null || this.vtsi.pgci_ut == null) {
              link_values.command = link_cmd_t.Exit;
              break;
            }
            this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSMenu;
          } else {
            // This happens on some discs like `Captain Scarlet & the Mysterons` or the German RC2
            // of `Anatomie` in VTSM.
            assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSMenu ||
              this.state.domain == DVDDomain_t.DVD_DOMAIN_VMGM || this.state.domain == DVDDomain_t.DVD_DOMAIN_FirstPlay); // ??
            if (this.vtsi == null || this.vtsi.pgci_ut == null) {
              link_values.command = link_cmd_t.Exit;
              break;
            }
            this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSMenu;
          }
        } else {
          // This happens on 'The Fifth Element' region 2.
          assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSMenu);
        }
        // I don't know what title is supposed to be used for.
        // Alien or Aliens has this != 1, I think.
        // assert(link_values.data2 == 1);
        this.state.VTS_TTN_REG = link_values.data2;
        // TTN_REG (SPRM4), VTS_TTN_REG (SPRM5), TT_PGCN_REG (SPRM6) are linked,
        // so if one changes, the others must change to match it.
        this.state.TTN_REG = this.get_TT(this.state.vtsN, this.state.VTS_TTN_REG);
        if (!this.set_MENU(link_values.data3))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.JumpSS_VMGM_PGC:
        // set_PGCN:data1
        // Stop SPRM9 Timer and any GPRM counters
        assert(this.state.domain != DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        if (this.vmgi == null || this.vmgi.pgci_ut == null) {
          link_values.command = link_cmd_t.Exit;
          break;
        }
        this.state.domain = DVDDomain_t.DVD_DOMAIN_VMGM;
        if (!this.set_PGCN(link_values.data1))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.CallSS_FP:
        // set_RSMinfo:data1
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        // Must be called before domain is changed
        this.set_RSMinfo(link_values.data1, /* We dont have block info */ 0);
        this.set_FP_PGC();
        link_values = this.play_PGC();
        break;
      case link_cmd_t.CallSS_VMGM_MENU:
        // set_MENU:data1
        // set_RSMinfo:data2
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        // Must be called before domain is changed
        if (this.vmgi == null || this.vmgi.pgci_ut == null) {
          link_values.command = link_cmd_t.Exit;
          break;
        }
        this.set_RSMinfo(link_values.data2, /* We dont have block info */ 0);
        this.state.domain = DVDDomain_t.DVD_DOMAIN_VMGM;
        if (!this.set_MENU(link_values.data1))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.CallSS_VTSM:
        // set_MENU:data1
        // set_RSMinfo:data2
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        // Must be called before domain is changed
        if (this.vtsi == null || this.vtsi.pgci_ut == null) {
          link_values.command = link_cmd_t.Exit;
          break;
        }
        this.set_RSMinfo(link_values.data2, /* We dont have block info */ 0);
        this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSMenu;
        if (!this.set_MENU(link_values.data1))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.CallSS_VMGM_PGC:
        // set_PGC:data1
        // set_RSMinfo:data2
        assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle); // ??
        // Must be called before domain is changed
        if (this.vmgi == null || this.vmgi.pgci_ut == null) {
          link_values.command = link_cmd_t.Exit;
          break;
        }
        this.set_RSMinfo(link_values.data2, /* We dont have block info */ 0);
        this.state.domain = DVDDomain_t.DVD_DOMAIN_VMGM;
        if (!this.set_PGCN(link_values.data1))
          assert(0);
        link_values = this.play_PGC();
        break;
      case link_cmd_t.PlayThis:
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
};


// Set functions
vm.prototype.set_TT = function(tt) {
  return this.set_PTT(tt, 1);
};

vm.prototype.set_PTT = function(tt, ptt) {
  assert(tt <= this.vmgi.tt_srpt.nr_of_srpts);
  return this.set_VTS_PTT(this.vmgi.tt_srpt.title[tt - 1].title_set_nr,
    this.vmgi.tt_srpt.title[tt - 1].vts_ttn, ptt);
};

vm.prototype.set_VTS_TT = function(vtsN, vts_ttn) {
  return this.set_VTS_PTT(vtsN, vts_ttn, 1);
};

vm.prototype.set_VTS_PTT = function(vtsN, vts_ttn, part) {
  var pgcN, pgN, res;

  this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSTitle;

  if (vtsN != this.state.vtsN)
    if (!this.ifoOpenNewVTSI(vtsN))  // Also sets this.state.vtsN
      return false;

  if ((vts_ttn < 1) || (vts_ttn > this.vtsi.vts_ptt_srpt.nr_of_srpts) ||
    (part < 1) || (part > this.vtsi.vts_ptt_srpt.title[vts_ttn - 1].nr_of_ptts)) {
    return false;
  }

  pgcN = this.vtsi.vts_ptt_srpt.title[vts_ttn - 1].ptt[part - 1].pgcn;
  pgN = this.vtsi.vts_ptt_srpt.title[vts_ttn - 1].ptt[part - 1].pgn;

  this.state.TT_PGCN_REG = pgcN;
  this.state.PTTN_REG = part;
  this.state.TTN_REG = this.get_TT(vtsN, vts_ttn);
  if ((this.state.TTN_REG) == 0)
    return false;

  this.state.VTS_TTN_REG = vts_ttn;
  this.state.vtsN = vtsN;  // Not sure about this one. We can get to it easily from TTN_REG
  // Any other registers?

  res = this.set_PGCN(pgcN); // This clobber's state.pgN (sets it to 1), but we don't want clobbering here.
  this.state.pgN = pgN;
  return res;
};

vm.prototype.set_PROG = function(tt, pgcn, pgn) {
  assert(tt <= this.vmgi.tt_srpt.nr_of_srpts);
  return this.set_VTS_PROG(this.vmgi.tt_srpt.title[tt - 1].title_set_nr,
    this.vmgi.tt_srpt.title[tt - 1].vts_ttn, pgcn, pgn);
};

vm.prototype.set_VTS_PROG = function(vtsN, vts_ttn, pgcn, pgn) {
  var pgcN, pgN, res, title, part = 0;

  this.state.domain = DVDDomain_t.DVD_DOMAIN_VTSTitle;

  if (vtsN != this.state.vtsN)
    if (!this.ifoOpenNewVTSI(vtsN))  // Also sets this.state.vtsN
      return false;

  if ((vts_ttn < 1) || (vts_ttn > this.vtsi.vts_ptt_srpt.nr_of_srpts)) {
    return false;
  }

  pgcN = pgcn;
  pgN = pgn;

  this.state.TT_PGCN_REG = pgcN;
  this.state.TTN_REG = this.get_TT(vtsN, vts_ttn);
  assert((this.state.TTN_REG) != 0);
  this.state.VTS_TTN_REG = vts_ttn;
  this.state.vtsN = vtsN;  // Not sure about this one. We can get to it easily from TTN_REG
  // Any other registers?

  res = this.set_PGCN(pgcN);   // This clobber's state.pgN (sets it to 1), but we don't want clobbering here.
  this.state.pgN = pgN;
  this.get_current_title_part(title, part);
  this.state.PTTN_REG = part;
  return res;
};

vm.prototype.set_FP_PGC = function() {
  this.state.domain = DVDDomain_t.DVD_DOMAIN_FirstPlay;
  if (!this.vmgi.first_play_pgc) {
    return this.set_PGCN(1);
  }
  this.state.pgc = this.vmgi.first_play_pgc;
  this.state.pgcN = this.vmgi.vmgi_mat.first_play_pgc;
  return true;
};

vm.prototype.set_MENU = function(menu) {
  assert(this.state.domain == DVDDomain_t.DVD_DOMAIN_VMGM || this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSMenu);
  return this.set_PGCN(this.get_ID(menu));
};

vm.prototype.set_PGCN = function(pgcN) {
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

  if (this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle)
    this.state.TT_PGCN_REG = pgcN;

  return true;
};

// Figure out the correct pgN from the cell and update this.state.
vm.prototype.set_PGN = function() {
  var new_pgN = 0;
  var dummy, part = 0;

  while (new_pgN < this.state.pgc.nr_of_programs
    && this.state.cellN >= this.state.pgc.program_map[new_pgN])
    new_pgN++;

  if (new_pgN == this.state.pgc.nr_of_programs) // We are at the last program
    if (this.state.cellN > this.state.pgc.nr_of_cells)
      return false; // We are past the last cell

  this.state.pgN = new_pgN;

  if (this.state.domain == DVDDomain_t.DVD_DOMAIN_VTSTitle) {
    if (this.state.TTN_REG > this.vmgi.tt_srpt.nr_of_srpts)
      return false; // ??

    this.get_current_title_part(dummy, part);
    this.state.PTTN_REG = part;
  }
  return true;
};

// Must be called before domain is changed (set_PGCN())
vm.prototype.set_RSMinfo = function(cellN, blockN) {
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

  // assert(this.state.rsm_pgcN == this.state.TT_PGCN_REG);  for DVDDomain_t.DVD_DOMAIN_VTSTitle

  for (i = 0; i < 5; i++) {
    this.state.rsm_regs[i] = this.state.registers.SPRM[4 + i];
  }
};


// Get functions

/* Searches the TT tables, to find the current TT.
 * returns the current TT.
 * returns 0 if not found.
 */
vm.prototype.get_TT = function(vtsN, vts_ttn) {
  var i;
  var tt = 0;

  for (i = 1; i <= this.vmgi.tt_srpt.nr_of_srpts; i++) {
    if (this.vmgi.tt_srpt.title[i - 1].title_set_nr == vtsN &&
      this.vmgi.tt_srpt.title[i - 1].vts_ttn == vts_ttn) {
      tt = i;
      break;
    }
  }
  return tt;
};

/* Search for entry_id match of the PGC Category in the current VTS PGCIT table.
 * Return pgcN based on entry_id match.
 */
vm.prototype.get_ID = function(id) {
  var pgcN, i;

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
    if ((pgcit.pgci_srp[i].entry_id) == id) {
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
      if ((pgcit.pgci_srp[i].entry_id & 0x80) == 0x80) {
        console.log('jsdvdnav: Available menus: %s',
          utils.toHex(pgcit.pgci_srp[i].entry_id & 0x7F));
      }
    }
  }
  return false; // error
};

// FIXME: we have a pgcN member in the vm's state now, so this should be obsolete
vm.prototype.get_PGCN = function() {
  var pgcN = 1;

  var pgcit = this.get_PGCIT();
  if (pgcit) {
    while (pgcN <= pgcit.nr_of_pgci_srp) {
      console.log('%cvm#get_PGCN()', 'color: green;', pgcit.pgci_srp[pgcN - 1].pgc, this.state.pgc);
      if (deepEqual(pgcit.pgci_srp[pgcN - 1].pgc, this.state.pgc)) {
        return pgcN;
      }
      pgcN++;
    }
  }

  console.error('jsdvdnav: get_PGCN failed. Was trying to find pgcN in domain %d', this.state.domain);
  return false; // error
};

vm.prototype.get_MENU_PGCIT = function(h, lang) {
  console.log('%cvm#get_MENU_PGCIT()', 'color: green;', h, lang);
  var i;

  if (h == null || h.pgci_ut == null) {
    console.error('jsdvdnav: pgci_ut handle is null');
    return null; // error?
  }

  i = 0;
  while (i < h.pgci_ut.nr_of_lus && h.pgci_ut.lu[i].lang_code != lang)
    i++;
  if (i == h.pgci_ut.nr_of_lus) {
    console.log('jsdvdnav: Language `%s` not found, using `%s` instead', utils.bit2str(lang), utils.bit2str(h.pgci_ut.lu[0].lang_code));
    var msg = 'jsdvdnav: Menu Languages available: ';
    for (i = 0; i < h.pgci_ut.nr_of_lus; i++) {
      msg += sprintf('%s ', utils.bit2str(h.pgci_ut.lu[i].lang_code));
    }
    console.log(msg);
    i = 0; // error?
  }

  return h.pgci_ut.lu[i].pgcit;
};

// Uses state to decide what to return
vm.prototype.get_PGCIT = function() {
  console.log('%cvm#get_PGCIT()', 'color: green;', this.state.domain);

  switch (this.state.domain) {
    case DVDDomain_t.DVD_DOMAIN_VTSTitle:
      if (!this.vtsi) return null;
      return this.vtsi.vts_pgcit;
      break;
    case DVDDomain_t.DVD_DOMAIN_VTSMenu:
      if (!this.vtsi) return null;
      return this.get_MENU_PGCIT(this.vtsi, this.state.registers.SPRM[0] | this.state.registers.SPRM[1] << 8);
      break;
    case DVDDomain_t.DVD_DOMAIN_VMGM:
    case DVDDomain_t.DVD_DOMAIN_FirstPlay:
      return this.get_MENU_PGCIT(this.vmgi, this.state.registers.SPRM[0] | this.state.registers.SPRM[1] << 8);
      break;
    default:
      abort();
  }

  return null;
};

//return the ifo_handle_t describing required title, used to
//identify chapters
vm.prototype.get_title_ifo = function(title) {
  var titleset_nr;
  if ((title < 1) || (title > this.vmgi.tt_srpt.nr_of_srpts))
    return null;
  titleset_nr = this.vmgi.tt_srpt.title[title - 1].title_set_nr;
  return ifoRead.ifoOpen(this.dvd, titleset_nr);
};


/**
 * The big VM function, executing the given commands and writing
 * the link where to continue, the return value indicates if a jump
 * has been performed.
 * Evaluate a set of commands in the given register set (which is modified).
 *
 * @param {vm_cmd_t} commands
 * @param {number} num_commands
 * @param {link_t} return_values
 * @return {boolean} Whether a Jump, Link or Call just happened.
 */
vm.prototype.evalCMD = function(commands, num_commands, return_values) {
  console.log('%cvm#evalCMD()', 'color: green;', JSON.stringify(commands), num_commands);

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
    console.log('%cvm#evalCMD()', 'color: green;', line, return_values);

    if (line < 0) { // Link command
      if (TRACE) {
        console.groupEnd(); // Closing 'Single stepping commands'.
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

  //memset(return_values, 0, sizeof(link_t));
  return_values.command = link_cmd_t.LinkNoLink;
  return_values.data1 = 0;
  return_values.data2 = 0;
  return_values.data3 = 0;

  if (TRACE) {
    console.groupEnd(); // Closing 'Single stepping commands'.
    console.group('jsdvdnav: Registers after transaction');
    this.print_registers();
    console.groupEnd();
  }
  return false;
};

/**
 * Extracts some bits from the command.
 *
 * @param {command_t} command (passed as reference).
 * @param {number} start
 * @param {number} count
 * @return {number}
 */
vm.prototype.getbits = function(command, start, count) {
  var result = 0;
  var bit_mask = 0;
  var examining = 0;
  var bits = 0;

  if (count == 0) return 0;

  if (((start - count) < -1) ||
    (count < 0) ||
    (start < 0) ||
    (count > 32) ||
    (start > 63)) {
    console.log('jsdvdnav: Bad call to vm#getbits(). Parameter out of range.');
    abort();
    return;
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
};

vm.prototype.get_GPRM = function(registers, reg) {
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
};

vm.prototype.set_GPRM = function(registers, reg, value) {
  if (registers.GPRM_mode[reg] & 0x01) {
    // Counter mode
    // console.log('jsdvdnav: Setting counter %d',reg);
    var current_time = performance.now();
    registers.GPRM_time[reg] = current_time;
    registers.GPRM_time[reg] -= value;
  }
  registers.GPRM[reg] = value;
};

/* Eval register code, can either be system or general register.
 SXXX_XXXX, where S is 1 if it is system register. */
vm.prototype.eval_reg = function(command, reg) {
  if (reg & 0x80) {
    if ((reg & 0x1F) == 20) {
      console.log('jsdvdnav: Suspected RCE Region Protection!!!');
    }
    return command.registers.SPRM[reg & 0x1F];
    // FIXME max 24 not 32
  } else {
    return this.get_GPRM(command.registers, reg & 0x0F);
  }
};

/* Eval register or immediate data.
 AAAA_AAAA BBBB_BBBB, if immediate use all 16 bits for data else use
 lower eight bits for the system or general purpose register. */
vm.prototype.eval_reg_or_data = function(command, imm, start) {
  if (imm) { // immediate
    return this.getbits(command, start, 16);
  } else {
    return this.eval_reg(command, this.getbits(command, (start - 8), 8));
  }
};

/* Eval register or immediate data.
 xBBB_BBBB, if immediate use all 7 bits for data else use
 lower four bits for the general purpose register number. */
// Evaluates gprm or data depending on bit, data is in byte n
vm.prototype.eval_reg_or_data_2 = function(command, imm, start) {
  if (imm) // immediate
    return this.getbits(command, (start - 1), 7);
  else
    return this.get_GPRM(command.registers, (this.getbits(command, (start - 4), 4)));
};

/* Compare data using operation, return result from comparison.
 Helper function for the different if functions. */
vm.prototype.eval_compare = function(operation, data1, data2) {
  switch (operation) {
    case 1:
      return data1 & data2;
    case 2:
      return data1 == data2;
    case 3:
      return data1 != data2;
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
  return 0;
};

/* Evaluate if version 1.
 Has comparison data in byte 3 and 4-5 (immediate or register) */
vm.prototype.eval_if_version_1 = function(command) {
  var op = this.getbits(command, 54, 3);
  if (op) {
    return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 39, 8)),
      this.eval_reg_or_data(command, this.getbits(command, 55, 1), 31));
  }
  return 1;
};

/* Evaluate if version 2.
 This version only compares register which are in byte 6 and 7 */
vm.prototype.eval_if_version_2 = function(command) {
  var op = this.getbits(command, 54, 3);
  if (op) {
    return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 15, 8)),
      this.eval_reg(command, this.getbits(command, 7, 8)));
  }
  return 1;
};

/* Evaluate if version 3.
 Has comparison data in byte 2 and 6-7 (immediate or register) */
vm.prototype.eval_if_version_3 = function(command) {
  var op = this.getbits(command, 54, 3);
  if (op) {
    return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 47, 8)),
      this.eval_reg_or_data(command, this.getbits(command, 55, 1), 15));
  }
  return 1;
};

/* Evaluate if version 4.
 Has comparison data in byte 1 and 4-5 (immediate or register)
 The register in byte 1 is only the lowe nibble (4 bits) */
vm.prototype.eval_if_version_4 = function(command) {
  var op = this.getbits(command, 54, 3);
  if (op) {
    return this.eval_compare(op, this.eval_reg(command, this.getbits(command, 51, 4)),
      this.eval_reg_or_data(command, this.getbits(command, 55, 1), 31));
  }
  return 1;
};

/* Evaluate special instruction.... returns the new row/line number,
 0 if no new row and 256 if Break. */
vm.prototype.eval_special_instruction = function(command, cond) {
  var line, level;

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
};

/* Evaluate link by subinstruction.
 Return 1 if link, or 0 if no link
 Actual link instruction is in return_values parameter */
vm.prototype.eval_link_subins = function(command, cond, return_values) {
  var button = this.getbits(command, 15, 6);
  var linkop = this.getbits(command, 4, 5);

  if (linkop > 0x10)
    return 0;
  // Unknown Link by Sub-Instruction command

  // Assumes that the link_cmd_t enum has the same values as the LinkSIns codes
  return_values.command = linkop;
  return_values.data1 = button;
  return cond;
};

/* Evaluate link instruction.
 Return 1 if link, or 0 if no link
 Actual link instruction is in return_values parameter */
vm.prototype.eval_link_instruction = function(command, cond, return_values) {
  var op = this.getbits(command, 51, 4);

  switch (op) {
    case 1:
      return this.eval_link_subins(command, cond, return_values);
    case 4:
      return_values.command = link_cmd_t.LinkPGCN;
      return_values.data1 = this.getbits(command, 14, 15);
      return cond;
    case 5:
      return_values.command = link_cmd_t.LinkPTTN;
      return_values.data1 = this.getbits(command, 9, 10);
      return_values.data2 = this.getbits(command, 15, 6);
      return cond;
    case 6:
      return_values.command = link_cmd_t.LinkPGN;
      return_values.data1 = this.getbits(command, 6, 7);
      return_values.data2 = this.getbits(command, 15, 6);
      return cond;
    case 7:
      return_values.command = link_cmd_t.LinkCN;
      return_values.data1 = this.getbits(command, 7, 8);
      return_values.data2 = this.getbits(command, 15, 6);
      return cond;
  }
  return 0;
};

/* Evaluate a jump instruction.
 returns 1 if jump or 0 if no jump
 actual jump instruction is in return_values parameter */
vm.prototype.eval_jump_instruction = function(command, cond, return_values) {
  switch (this.getbits(command, 51, 4)) {
    case 1:
      return_values.command = link_cmd_t.Exit;
      return cond;
    case 2:
      return_values.command = link_cmd_t.JumpTT;
      return_values.data1 = this.getbits(command, 22, 7);
      return cond;
    case 3:
      return_values.command = link_cmd_t.JumpVTS_TT;
      return_values.data1 = this.getbits(command, 22, 7);
      return cond;
    case 5:
      return_values.command = link_cmd_t.JumpVTS_PTT;
      return_values.data1 = this.getbits(command, 22, 7);
      return_values.data2 = this.getbits(command, 41, 10);
      return cond;
    case 6:
      switch (this.getbits(command, 23, 2)) {
        case 0:
          return_values.command = link_cmd_t.JumpSS_FP;
          return cond;
        case 1:
          return_values.command = link_cmd_t.JumpSS_VMGM_MENU;
          return_values.data1 = this.getbits(command, 19, 4);
          return cond;
        case 2:
          return_values.command = link_cmd_t.JumpSS_VTSM;
          return_values.data1 = this.getbits(command, 31, 8);
          return_values.data2 = this.getbits(command, 39, 8);
          return_values.data3 = this.getbits(command, 19, 4);
          return cond;
        case 3:
          return_values.command = link_cmd_t.JumpSS_VMGM_PGC;
          return_values.data1 = this.getbits(command, 46, 15);
          return cond;
      }
      break;
    case 8:
      switch (this.getbits(command, 23, 2)) {
        case 0:
          return_values.command = link_cmd_t.CallSS_FP;
          return_values.data1 = this.getbits(command, 31, 8);
          return cond;
        case 1:
          return_values.command = link_cmd_t.CallSS_VMGM_MENU;
          return_values.data1 = this.getbits(command, 19, 4);
          return_values.data2 = this.getbits(command, 31, 8);
          return cond;
        case 2:
          return_values.command = link_cmd_t.CallSS_VTSM;
          return_values.data1 = this.getbits(command, 19, 4);
          return_values.data2 = this.getbits(command, 31, 8);
          return cond;
        case 3:
          return_values.command = link_cmd_t.CallSS_VMGM_PGC;
          return_values.data1 = this.getbits(command, 46, 15);
          return_values.data2 = this.getbits(command, 31, 8);
          return cond;
      }
      break;
  }
  return 0;
};

/* Evaluate a set sytem register instruction
 May contain a link so return the same as eval_link */
vm.prototype.eval_system_set = function(command, cond, return_values) {
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
};

/* Evaluate set operation
 Sets the register given to the value indicated by op and data.
 For the swap case the contents of reg is stored in reg2. */
vm.prototype.eval_set_op = function(command, op, reg, reg2, data) {
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
      if (data != 0) {
        this.set_GPRM(command.registers, reg, this.get_GPRM(command.registers, reg) / data);
      } else {
        this.set_GPRM(command.registers, reg, 0xFFFF);
        // Avoid that divide by zero!
      }
      break;
    case 7:
      if (data != 0) {
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
};

// Evaluate set instruction, combined with either Link or Compare.
vm.prototype.eval_set_version_1 = function(command, cond) {
  var op = this.getbits(command, 59, 4);
  var reg = this.getbits(command, 35, 4);
  // FIXME: This is different from vmcmd.c!!!
  var reg2 = this.getbits(command, 19, 4);
  var data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 31);

  if (cond) {
    this.eval_set_op(command, op, reg, reg2, data);
  }
};

// Evaluate set instruction, combined with both Link and Compare.
vm.prototype.eval_set_version_2 = function(command, cond) {
  var op = this.getbits(command, 59, 4);
  var reg = this.getbits(command, 51, 4);
  var reg2 = this.getbits(command, 35, 4);
  // FIXME: This is different from vmcmd.c!!!
  var data = this.eval_reg_or_data(command, this.getbits(command, 60, 1), 47);

  if (cond) {
    this.eval_set_op(command, op, reg, reg2, data);
  }
};

/* Evaluate a command
 returns row number of goto, 0 if no goto, -1 if link.
 Link command in return_values */
vm.prototype.eval_command = function(bytes, return_values) {
  var registers = this.state.registers;
  var cond = 0, res = 0;
  var command = new command_t();
  // Working with strings avoid messing around with rounded values.
  // Alternatively, we could use a typed array here.
  command.instruction = bytes.map(function(byte: number) {
    return sprintf('%08i', (byte).toString(2));
  }).join('');
  command.examined = 0;
  command.registers = registers;

  //memset(return_values, 0, sizeof(link_t));
  return_values.command = link_cmd_t.LinkNoLink;
  return_values.data1 = 0;
  return_values.data2 = 0;
  return_values.data3 = 0;

  switch (this.getbits(command, 63, 3)) { // three first old_bits
    case 0: // Special instructions
      cond = this.eval_if_version_1(command);
      res = this.eval_special_instruction(command, cond);
      if (res == -1) {
        console.log('jsdvdnav: Unknown Instruction!');
        abort();
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
      if (res)
        res = -1;
      break;
    case 2: // System set instructions
      cond = this.eval_if_version_2(command);
      res = this.eval_system_set(command, cond, return_values);
      if (res)
        res = -1;
      break;
    case 3: // Set instructions, either Compare or Link may be used
      cond = this.eval_if_version_3(command);
      this.eval_set_version_1(command, cond);
      if (this.getbits(command, 51, 4)) {
        res = this.eval_link_instruction(command, cond, return_values);
      }
      if (res)
        res = -1;
      break;
    case 4: // Set, Compare -> Link Sub-Instruction
      this.eval_set_version_2(command, /*True*/ 1);
      cond = this.eval_if_version_4(command);
      res = this.eval_link_subins(command, cond, return_values);
      if (res)
        res = -1;
      break;
    case 5: // Compare -> (Set and Link Sub-Instruction)
      // FIXME: These are wrong. Need to be updated from vmcmd.c
      cond = this.eval_if_version_4(command);
      this.eval_set_version_2(command, cond);
      res = this.eval_link_subins(command, cond, return_values);
      if (res)
        res = -1;
      break;
    case 6: // Compare -> Set, allways Link Sub-Instruction
      // FIXME: These are wrong. Need to be updated from vmcmd.c
      cond = this.eval_if_version_4(command);
      this.eval_set_version_2(command, cond);
      res = this.eval_link_subins(command, /*True*/ 1, return_values);
      if (res)
        res = -1;
      break;
    default: // Unknown command
      console.error('jsdvdnav: Unknown Command=%s', utils.toHex(this.getbits(command, 63, 3)));
      abort();
  }
  // Check if there are bits not yet examined

  if (command.instruction & ~command.examined) {
    console.error('jsdvdnav: Unknown bits: %08', (command.instruction & ~command.examined));
  }

  return res;
};

vm.prototype.linkcmd2str = function(cmd) {
  switch (cmd) {
    case link_cmd_t.LinkNoLink:
      return 'LinkNoLink';
    case link_cmd_t.LinkTopC:
      return 'LinkTopC';
    case link_cmd_t.LinkNextC:
      return 'LinkNextC';
    case link_cmd_t.LinkPrevC:
      return 'LinkPrevC';
    case link_cmd_t.LinkTopPG:
      return 'LinkTopPG';
    case link_cmd_t.LinkNextPG:
      return 'LinkNextPG';
    case link_cmd_t.LinkPrevPG:
      return 'LinkPrevPG';
    case link_cmd_t.LinkTopPGC:
      return 'LinkTopPGC';
    case link_cmd_t.LinkNextPGC:
      return 'LinkNextPGC';
    case link_cmd_t.LinkPrevPGC:
      return 'LinkPrevPGC';
    case link_cmd_t.LinkGoUpPGC:
      return 'LinkGoUpPGC';
    case link_cmd_t.LinkTailPGC:
      return 'LinkTailPGC';
    case link_cmd_t.LinkRSM:
      return 'LinkRSM';
    case link_cmd_t.LinkPGCN:
      return 'LinkPGCN';
    case link_cmd_t.LinkPTTN:
      return 'LinkPTTN';
    case link_cmd_t.LinkPGN:
      return 'LinkPGN';
    case link_cmd_t.LinkCN:
      return 'LinkCN';
    case link_cmd_t.Exit:
      return 'Exit';
    case link_cmd_t.JumpTT:
      return 'JumpTT';
    case link_cmd_t.JumpVTS_TT:
      return 'JumpVTS_TT';
    case link_cmd_t.JumpVTS_PTT:
      return 'JumpVTS_PTT';
    case link_cmd_t.JumpSS_FP:
      return 'JumpSS_FP';
    case link_cmd_t.JumpSS_VMGM_MENU:
      return 'JumpSS_VMGM_MENU';
    case link_cmd_t.JumpSS_VTSM:
      return 'JumpSS_VTSM';
    case link_cmd_t.JumpSS_VMGM_PGC:
      return 'JumpSS_VMGM_PGC';
    case link_cmd_t.CallSS_FP:
      return 'CallSS_FP';
    case link_cmd_t.CallSS_VMGM_MENU:
      return 'CallSS_VMGM_MENU';
    case link_cmd_t.CallSS_VTSM:
      return 'CallSS_VTSM';
    case link_cmd_t.CallSS_VMGM_PGC:
      return 'CallSS_VMGM_PGC';
    case link_cmd_t.PlayThis:
      return 'PlayThis';
  }
  return '(bug)';
};

// Debug functions
/**
 * For debugging: prints a link in readable form.
 */
vm.prototype.print_link = function(value) {
  var cmd = this.linkcmd2str(value.command);

  switch (value.command) {
    case link_cmd_t.LinkNoLink:
    case link_cmd_t.LinkTopC:
    case link_cmd_t.LinkNextC:
    case link_cmd_t.LinkPrevC:
    case link_cmd_t.LinkTopPG:
    case link_cmd_t.LinkNextPG:
    case link_cmd_t.LinkPrevPG:
    case link_cmd_t.LinkTopPGC:
    case link_cmd_t.LinkNextPGC:
    case link_cmd_t.LinkPrevPGC:
    case link_cmd_t.LinkGoUpPGC:
    case link_cmd_t.LinkTailPGC:
    case link_cmd_t.LinkRSM:
      console.log('jsdvdnav: %s (button %d)', cmd, value.data1);
      break;
    case link_cmd_t.LinkPGCN:
    case link_cmd_t.JumpTT:
    case link_cmd_t.JumpVTS_TT:
    case link_cmd_t.JumpSS_VMGM_MENU: // == 2 -> Title Menu
    case link_cmd_t.JumpSS_VMGM_PGC:
      console.log('jsdvdnav: %s %d', cmd, value.data1);
      break;
    case link_cmd_t.LinkPTTN:
    case link_cmd_t.LinkPGN:
    case link_cmd_t.LinkCN:
      console.log('jsdvdnav: %s %d (button %d)', cmd, value.data1, value.data2);
      break;
    case link_cmd_t.Exit:
    case link_cmd_t.JumpSS_FP:
    case link_cmd_t.PlayThis: // Humm.. should we have this at all..
      console.log('jsdvdnav: %s', cmd);
      break;
    case link_cmd_t.JumpVTS_PTT:
      console.log('jsdvdnav: %s %d:%d', cmd, value.data1, value.data2);
      break;
    case link_cmd_t.JumpSS_VTSM:
      console.log('jsdvdnav: %s vts %d title %d menu %d',
        cmd, value.data1, value.data2, value.data3);
      break;
    case link_cmd_t.CallSS_FP:
      console.log('jsdvdnav: %s resume cell %d', cmd, value.data1);
      break;
    case link_cmd_t.CallSS_VMGM_MENU: // == 2 -> Title Menu
    case link_cmd_t.CallSS_VTSM:
      console.log('jsdvdnav: %s %d resume cell %d', cmd, value.data1, value.data2);
      break;
    case link_cmd_t.CallSS_VMGM_PGC:
      console.log('jsdvdnav: %s %d resume cell %d', cmd, value.data1, value.data2);
      break;
  }
};

vm.prototype.print_current_domain_state = function() {
  switch (this.state.domain) {
    case DVDDomain_t.DVD_DOMAIN_VTSTitle:
      console.log('jsdvdnav: Video Title Domain: -');
      break;
    case DVDDomain_t.DVD_DOMAIN_VTSMenu:
      console.log('jsdvdnav: Video Title Menu Domain: -');
      break;
    case DVDDomain_t.DVD_DOMAIN_VMGM:
      console.log('jsdvdnav: Video Manager Menu Domain: -');
      break;
    case DVDDomain_t.DVD_DOMAIN_FirstPlay:
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
    this.state.VTS_TTN_REG,
    this.state.TTN_REG,
    this.state.TT_PGCN_REG));
};

/**
 * Used in dvdnav.
 * @param position
 * @return {string}
 */
vm.prototype.print_position = function(position) {
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
};

/**
 * for debugging: dumps VM registers.
 */
vm.prototype.print_registers = function() {
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
};

function abort() {
  throw new Error('Unknown error');
}

// Ported from vm/vmcmd.c

var cmp_op_table = [
  '', '&', '==', '!=', '>=', '>', '<=', '<'
];
var set_op_table = [
  '', '=', '<->', '+=', '-=', '*=', '/=', '%=', 'rnd', '&=', '|=', '^='
];

var link_table = [
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

var system_reg_table = [
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

var system_reg_abbr_table = [
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

vm.prototype.print_system_reg = function(reg) {
  var msg = '';
  if (reg < system_reg_abbr_table.length / system_reg_abbr_table[0].length) {
    msg += sprintf('%s (SRPM:%d)', system_reg_table[reg], reg);
  } else {
    console.error('jsdvdnav: Unknown system register (reg=%d)', reg);
  }

  return msg;
};

vm.prototype.print_g_reg = function(reg) {
  var msg = '';
  if (reg < 16) {
    //msg += sprintf("g[%" PRIu8 "]", reg);
    msg += sprintf('g[%s]', utils.toHex(reg));
  } else {
    console.error('jsdvdnav: Unknown general register');
  }

  return msg;
};

vm.prototype.print_reg = function(reg) {
  var msg = '';
  if (reg & 0x80) {
    msg += this.print_system_reg(reg & 0x7F);
  } else {
    msg += this.print_g_reg(reg & 0x7F);
  }

  return msg;
};

vm.prototype.print_cmp_op = function(op) {
  var msg = '';
  if (op < cmp_op_table.length / cmp_op_table[0].length) {
    msg += sprintf(' %s ', cmp_op_table[op]);
  } else {
    console.error('jsdvdnav: Unknown compare op');
  }

  return msg;
};

vm.prototype.print_set_op = function(op) {
  var msg = '';
  if (op < set_op_table.length / cmp_op_table[0].length) {
    msg += sprintf(' %s ', set_op_table[op]);
  } else {
    console.error('jsdvdnav: Unknown set op');
  }

  return msg;
};

vm.prototype.print_reg_or_data = function(command, immediate, start) {
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
};

vm.prototype.print_reg_or_data_2 = function(command, immediate, start) {
  var msg = '';
  if (immediate) {
    msg += sprintf('%s', utils.toHex(this.getbits(command, start - 1, 7)));
  } else {
    //msg += sprintf("g[%" PRIu8 "]", this.getbits(command, start - 4, 4));
    msg += sprintf('g[%s]', utils.toHex(this.getbits(command, start - 4, 4)));
  }

  return msg;
};

vm.prototype.print_reg_or_data_3 = function(command, immediate, start) {
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
};

vm.prototype.print_if_version_1 = function(command) {
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
};

vm.prototype.print_if_version_2 = function(command) {
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
};

vm.prototype.print_if_version_3 = function(command) {
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
};

vm.prototype.print_if_version_4 = function(command) {
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
};

vm.prototype.print_if_version_5 = function(command) {
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
};

vm.prototype.print_special_instruction = function(command) {
  var msg = '';
  var op = this.getbits(command, 51, 4);

  switch (op) {
    case 0: // NOP
      msg += 'Nop';
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
};

vm.prototype.print_linksub_instruction = function(command) {
  var msg = '';
  var linkop = this.getbits(command, 7, 8);
  var button = this.getbits(command, 15, 6);

  if (linkop < link_table.length / link_table[0].length) {
    //msg += sprintf("%s (button %" PRIu8 ")", link_table[linkop], button);
    msg += sprintf('%s (button %s)', link_table[linkop], button);
  } else {
    console.error('jsdvdnav: Unknown linksub instruction (%i)', linkop);
  }

  return msg;
};

vm.prototype.print_link_instruction = function(command, optional) {
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
};

vm.prototype.print_jump_instruction = function(command) {
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
};

vm.prototype.print_system_set = function(command) {
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
};

vm.prototype.print_set_version_1 = function(command) {
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
};

vm.prototype.print_set_version_2 = function(command) {
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
};

vm.prototype.print_set_version_3 = function(command) {
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
};

vm.prototype.print_mnemonic = function(vm_command) {
  var msg = '';
  var command = new command_t();
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
        msg += this.print_link_instruction(command, 0);
        // must be present
      }
      break;
    case 2: // Set System Parameters instructions
      msg += this.print_if_version_2(command);
      msg += this.print_system_set(command);
      msg += this.print_link_instruction(command, 1);
      // either 'if' or 'link'
      break;
    case 3: // Set General Parameters instructions
      msg += this.print_if_version_3(command);
      msg += this.print_set_version_1(command);
      msg += this.print_link_instruction(command, 1);
      // either 'if' or 'link'
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

  if (command.instruction & ~command.examined) {
    console.error('jsdvdnav: Unknown bits: %s', (command.instruction & ~command.examined));
    //console.error(" %08"PRIx64, (command.instruction & ~ command.examined) );
  }

  return msg;
};

vm.prototype.print_cmd = function(row, vm_command) {
  var msg = sprintf('(%03d) ', row + 1);

  for (var i = 0; i < 8; i++)
    msg += sprintf('%s ', utils.toHex(vm_command.bytes[i]));
  msg += '| ';

  msg += this.print_mnemonic(vm_command);

  return msg;
};
