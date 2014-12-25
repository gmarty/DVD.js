///<reference path='../references.ts'/>

'use strict';


import DvdReader = require('../dvdread/index');
import VM = require('../vm/index');
import Player = require('../player/index');
import dvdTypes = require('../dvdnav/dvd_types');
import dvdEvents = require('../dvdnav/dvdnav_events');
import config = require('../config');
import utils = require('../utils');
var EventEmitter: any = require('../../../bower_components/eventEmitter/EventEmitter.min.js');

var LOG_DEBUG = config.DEBUG;
var DVDDomain_t = dvdTypes.DVDDomain_t;
var dvd_read_domain_t = dvdTypes.dvd_read_domain_t;
var vm_position_t = dvdTypes.vm_position_t;
var sprintf = utils.sprintf;
var toHex = utils.toHex;

enum DSI_ILVU {
  PRE = 1 << 15, // set during the last 3 VOBU preceding an interleaved block.
  BLOCK = 1 << 14, // set for all VOBU in an interleaved block
  FIRST = 1 << 13, // set for the first VOBU for a given angle or scene within a ILVU, or the first VOBU in the preparation (PREU) sequence
  LAST = 1 << 12, // set for the last VOBU for a given angle or scene within a ILVU, or the last VOBU in the preparation (PREU) sequence
  MASK = 0xF000
}

export = dvdnav;

/**
 * The main DVDNAV type.
 *
 * @param {HTMLVideoElement} screen A video element.
 * @return {dvdnav}
 */
function dvdnav(screen): void {
  if (!(this instanceof dvdnav)) return new dvdnav(screen);

  // Not in original code:
  this.dvd = new DvdReader();
  //this.stream = null;             // Manage buffer.
  //this.event = 0;                 // Avoid passing by reference.

  // General data
  this.path = '';                 // Path to DVD device/dir
  this.file = null;               // Currently opened file

  // Position data
  this.position_next = new vm_position_t();
  this.position_current = new vm_position_t();
  this.vobu = new dvdnav_vobu_t();

  // NAV data
  this.pci = null;
  this.dsi = null;
  this.last_cmd_nav_lbn = 0;      // Detects when a command is issued on an already left NAV

  // Flags
  this.skip_still = false;        // Set when skipping a still
  this.sync_wait = false;         // Applications should wait till they are in sync with us
  this.sync_wait_skip = false;    // Set when skipping wait state
  this.spu_clut_changed = false;  // The SPU CLUT changed
  this.started = false;           // vm_start has been called?
  //this.use_read_ahead = false;    // 1 - use read-ahead cache, 0 - don't
  this.pgc_based = false;         // Positioning works PGC based instead of PG based
  this.cur_cell_time = 0;         // Time expired since the beginning of the current cell, read from the dsi

  // VM
  this.vm = null;

  // Read-ahead cache
  //this.cache = {};

  // Errors
  //this.err_str = [];

  // Initialise video.
  this.player = new Player(screen);
}

// Inherit from event emitter.
utils.inherits(dvdnav, EventEmitter);

/** @const */ var SRI_END_OF_CELL = 0x3FFFFFFF;

/**
 * Magic number for seeking hops.
 * @const
 */
var HOP_SEEK = 0x1000;

function dvdnav_vobu_t() {
  this.vobu_start = 0;  // Logical Absolute. MAX needed is 0x300000
  this.vobu_length = 0;
  this.blockN = 0;      // Relative offset
  this.vobu_next = 0;   // Relative offset

  // Not in original code:
  this.vobu = 0;        // Current VOBU.
  this.vobuNb = 0;      // Total number of VOBUs.
}

/**
 * Request the list of available DVD from the server, then execute a callback function.
 * @todo Refactor to merge into dvdread/index to avoid instantiate BinaryClient twice.
 *
 * @param {Function} callback
 */
dvdnav.prototype.getDVDList = function(callback) {
  this.dvd.getDVDList(callback);
};


/*********************************************************************
 * initialisation & housekeeping functions                           *
 *********************************************************************/

/*
 * These functions allow you to open a DVD device and associate it
 * with a dvdnav_t.
 */

/**
 * Attempts to open the DVD drive at the specified path and pre-cache
 * the CSS-keys. libdvdread is used to access the DVD, so any source
 * supported by libdvdread can be given with `path`. Currently,
 * libdvdread can access: DVD drives, DVD image files, DVD file-by-file
 * copies.
 *
 * The resulting dvdnav_t handle will be written to *dest.
 */
dvdnav.prototype.open = function(path, cb) {
  var time;

  // Create a new structure.
  console.log('jsdvdnav: Using jsdvdnav version %s', config.VERSION);

  this.path = path;

  // Initialise the VM.
  this.vm = new VM(this.dvd);
  if (!this.vm) {
    console.error('Error initialising the DVD VM.');
    return;
  }

  this.vm.reset(path, cb);

  // Following code ported from dvdnav_clear().
  // Clear everything except file, vm, mutex, readahead.
  this.position_current = new vm_position_t();
  this.pci = null;
  this.dsi = null;
  this.last_cmd_nav_lbn = SRI_END_OF_CELL;

  // Set initial values of flags.
  this.skip_still = false;
  this.sync_wait = false;
  this.sync_wait_skip = false;
  this.spu_clut_changed = false;
  this.started = false;
  this.cur_cell_time = 0;
};

// HELPER FUNCTIONS

/**
 * Converts a dvd_time_t to PTS ticks.
 */
dvdnav.prototype.convert_time = function(time) {
  var result = (time.hour >> 4) * 10 * 60 * 60 * 90000
    + (time.hour & 0x0F) * 60 * 60 * 90000
    + (time.minute >> 4) * 10 * 60 * 90000
    + (time.minute & 0x0F) * 60 * 90000
    + (time.second >> 4) * 10 * 90000
    + (time.second & 0x0F) * 90000;

  var frames = ((time.frame_u & 0x30) >> 4) * 10
    + time.frame_u & 0x0F;

  if (time.frame_u & 0x80) {
    return result + frames * 3000;
  }

  return result + frames * 3600;
};


/**
 * DSI is used for most angle stuff.
 * PCI is used for only non-seamless angle stuff.
 */
dvdnav.prototype.get_vobu = function() {
  var next = 0;

  this.vobu.vobu_start = this.dsi.dsi_gi.nv_pck_lbn; // Absolute offset from start of disk.
  this.vobu.vobu_length = this.dsi.dsi_gi.vobu_ea;   // Relative offset from vobu_start.

  /*
   * If we're not at the end of this cell, we can determine the next
   * VOBU to display using the VOBU_SRI information section of the
   * DSI.  Using this value correctly follows the current angle,
   * avoiding the doubled scenes in The Matrix, and makes our life
   * really happy.
   *
   * vobu_next is an offset value, 0x3FFFFFFF = SRI_END_OF_CELL
   * DVDs are about 6 Gigs, which is only up to 0x300000 blocks
   * Should really assert if bit 31 != 1
   */

  // Relative offset from vobu_start
  this.vobu.vobu_next = this.dsi.vobu_sri.next_vobu & 0x3FFFFFFF;

  var obj = this.vm.get_angle_info();
  var angle = obj.current;
  var num_angle = obj.num_avail;

  // FIMXE: The angle reset doesn't work for some reason for the moment
  /*if ((num_angle < angle) && (angle != 1)) {
   console.error('jsdvdnav: angle ends!');

   // This is to switch back to angle one when we finish with angles.
   this.angle_change(1);
   }*/

  // only use ILVU information if we are at the last vobunit in ILVU,
  // otherwise we will miss nav packets from vobunits inbetween.
  if (num_angle != 0 && (this.dsi.sml_pbi.category & DSI_ILVU.MASK) == (DSI_ILVU.BLOCK | DSI_ILVU.LAST)) {

    if ((next = this.pci.nsml_agli.nsml_agl_dsta[angle - 1]) != 0) {
      if ((next & 0x3FFFFFFF) != 0) {
        if (next & 0x80000000)
          this.vobu.vobu_next = -(next & 0x3FFFFFFF);
        else
          this.vobu.vobu_next = +(next & 0x3FFFFFFF);
      }
    } else if ((next = this.dsi.sml_agli.data[angle - 1].address) != 0) {
      this.vobu.vobu_length = this.dsi.sml_pbi.ilvu_ea;

      if ((next & 0x80000000) && (next != 0x7FFFFFFF))
        this.vobu.vobu_next = -(next & 0x3FFFFFFF);
      else
        this.vobu.vobu_next = +(next & 0x3FFFFFFF);
    }
  }
};


/*
 * Attempts to get the next block off the DVD and copies it into the buffer 'buf'.
 * If there is any special actions that may need to be performed, the value
 * pointed to by 'event' gets set accordingly.
 *
 * If 'event' is DVDNAV_BLOCK_OK then 'buf' is filled with the next block
 * (note that means it has to be at /least/ 2048 bytes big). 'len' is
 * then set to 2048.
 *
 * Otherwise, buf is filled with an appropriate event structure and
 * len is set to the length of that structure.
 *
 * See the dvdnav_events.h header for information on the various events.
 */
/*
 * These are the main get_next_block function which actually get the media stream video and audio etc.
 *
 * There are two versions: The second one is using the zero-copy read ahead cache and therefore
 * hands out pointers targeting directly into the cache.
 * The first one uses a memcopy to fill this cache block into the application provided memory.
 * The benefit of this first one is that no special memory management is needed. The application is
 * the only one responsible of allocating and freeing the memory associated with the pointer.
 * The drawback is the additional memcopy.
 */
/*
 * This basically does the same as this.get_next_block. The only difference is
 * that it avoids a memcopy, when the requested block was found in the cache.
 * In such a case (cache hit) this function will return a different pointer than
 * the one handed in, pointing directly into the relevant block in the cache.
 * Those pointers must _never_ be freed but instead returned to the library via
 * this.free_cache_block().
 */
dvdnav.prototype.get_next_cache_block = function() {
  var state = this.vm.state;

  if (!this.started) {
    // Start the VM.
    if (!this.vm.start()) {
      console.error('Encrypted or faulty DVD');
      return;
    }
    this.started = true;
  }

  // Check the STOP flag.
  if (this.vm.stopped) {
    this.vm.stop();
    this.emit('stop');
    this.started = false;

    return;
  }

  /*console.log('this.vobu.vobu_start', this.vobu.vobu_start);
  console.log('this.vobu.blockN', this.vobu.blockN);
  console.log('this.vobu.vobu_length', this.vobu.vobu_length);
  console.log('this.vobu.vobu_next', this.vobu.vobu_next);
  console.log('this.vobu.vobu', this.vobu.vobu);*/

  this.position_next = this.vm.position_get();

  if (LOG_DEBUG) {
    console.log('jsdvdnav: POS-NEXT ' + this.vm.print_position(this.position_next));
    console.log('jsdvdnav: POS-CUR  ' + this.vm.print_position(this.position_current));
  }

  // Did we hop?
  if (this.position_current.hop_channel != this.position_next.hop_channel) {
    if (this.position_next.hop_channel - this.position_current.hop_channel >= HOP_SEEK) {
      // We seeked -> check for multiple angles.
      var obj = this.vm.get_angle_info();
      var current = obj.current;
      var num_angles = obj.num_angles;
      if (num_angles > 1) {
        // We have to skip the first VOBU when seeking in a multiangle feature, because it might belong to the wrong angle.
        this.dvd.read_cache_block(this.file, 'NAV', this.position_next.cell_start + this.position_next.block, 1, function(pci, dsi) {

          // Decode nav into pci and dsi. Then get next VOBU info.
          if (!pci || !dsi) {
            console.error('Expected NAV packet but none found.');
            return;
          }

          this.pci = pci;
          this.dsi = dsi;

          this.get_vobu();
          // Skip to next, if there is a next.
          if (this.vobu.vobu_next != SRI_END_OF_CELL) {
            this.vobu.vobu_start += this.vobu.vobu_next;
            this.vobu.vobu_next = 0;
          }
          // Update VM state.
          this.vm.state.blockN = this.vobu.vobu_start - this.position_next.cell_start;

          // We have to duplicate the code below.
          this.position_current.hop_channel = this.position_next.hop_channel;
          // Update VOBU info.
          this.vobu.vobu_start = this.position_next.cell_start + this.position_next.block;
          this.vobu.vobu_next = 0;
          // Make blockN == vobu_length to do expected_nav.
          this.vobu.vobu_length = 0;
          this.vobu.blockN = 0;
          this.sync_wait = false;

          this.nextBlock();
        }.bind(this));

        return;
      }
    }
    this.position_current.hop_channel = this.position_next.hop_channel;
    // Update VOBU info.
    this.vobu.vobu_start = this.position_next.cell_start + this.position_next.block;
    this.vobu.vobu_next = 0;
    // Make blockN == vobu_length to do expected_nav.
    this.vobu.vobu_length = 0;
    this.vobu.blockN = 0;
    this.sync_wait = false;

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: HOP_CHANNEL', 'font-weight: bold;');
    }
    this.emit('hopChannel');

    this.nextBlock();
    return;
  }

  // Check the HIGHLIGHT flag.
  if (this.position_current.button != this.position_next.button) {
    var highlight_event = new dvdEvents.dvdnav_highlight_event_t();

    highlight_event.display = 1;
    highlight_event.buttonN = this.position_next.button;

    this.position_current.button = this.position_next.button;

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: HIGHLIGHT', 'font-weight: bold;');
    }
    this.emit('highlight', highlight_event);

    this.nextBlock();
    return;
  }

  // Check the WAIT flag.
  if (this.sync_wait) {
    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: WAIT', 'font-weight: bold;');
    }
    this.emit('wait');

    debugger;

    setTimeout(function() {
      this.nextBlock();
    }.bind(this), 0);

    return;
  }

  // Check to see if we need to change the currently opened VOB or open a new one because we don't currently have an opened VOB.
  if (!this.file || this.position_current.vts != this.position_next.vts || this.position_current.domain != this.position_next.domain) {
    var domain;
    var vtsN;
    var vts_change_event = new dvdEvents.dvdnav_vts_change_event_t();

    if (this.file) {
      this.file = null;
    }

    vts_change_event.old_vtsN = this.position_current.vts;
    vts_change_event.old_domain = this.position_current.domain;

    // Use the DOMAIN to find whether to open menu or title VOBs.
    switch (this.position_next.domain) {
      case DVDDomain_t.DVD_DOMAIN_FirstPlay:
      case DVDDomain_t.DVD_DOMAIN_VMGM:
        domain = dvd_read_domain_t.DVD_READ_MENU_VOBS;
        vtsN = 0;
        break;
      case DVDDomain_t.DVD_DOMAIN_VTSMenu:
        domain = dvd_read_domain_t.DVD_READ_MENU_VOBS;
        vtsN = this.position_next.vts;
        break;
      case DVDDomain_t.DVD_DOMAIN_VTSTitle:
        domain = dvd_read_domain_t.DVD_READ_TITLE_VOBS;
        vtsN = this.position_next.vts;
        break;
      default:
        console.error('Unknown domain when changing VTS.');
        return;
    }

    this.position_current.vts = this.position_next.vts;
    this.position_current.domain = this.position_next.domain;
    vts_change_event.new_vtsN = this.position_next.vts;
    vts_change_event.new_domain = this.position_next.domain;

    this.file = this.dvd.openFile(vtsN, domain);

    console.log('file', this.file);
    // If couldn't open the file for some reason, moan.
    if (!this.file) {
      console.error('Error opening vtsN=%i, domain=%i.', vtsN, domain);
      debugger;
      return;
    }

    this.spu_clut_changed = true;
    this.position_current.cell = -1; // Force an update.
    this.position_current.spu_channel = -1; // Force an update.
    this.position_current.audio_channel = -1; // Force an update.

    this.vobu.vobu = 0;
    if (this.position_current.vts === -1) {
      // VMG
      this.vobu.vobuNb = this.vm.vmgi.menu_vobu_admap.vobu_start_sectors.length;
    } else {
      // VTS
      this.vobu.vobuNb = this.vm.vtsi.vts_vobu_admap.vobu_start_sectors.length;
    }

    // File opened successfully so return a VTS change event.
    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: VTS_CHANGE', 'font-weight: bold;');
    }
    this.emit('vtsChange', vts_change_event);

    this.player.initializeVideoSource(this.path, this.file, function() {
      this.nextBlock();
    }.bind(this));

    return;
  }

  // Check if the cell changed.
  if (this.position_current.cell != this.position_next.cell || this.position_current.cell_restart != this.position_next.cell_restart || this.position_current.cell_start != this.position_next.cell_start) {
    var cell_change_event = new dvdEvents.dvdnav_cell_change_event_t();
    var first_cell_nr, last_cell_nr, i;
    state = this.vm.state;

    this.cur_cell_time = 0;

    cell_change_event.cellN = state.cellN;
    cell_change_event.pgN = state.pgN;
    cell_change_event.cell_length = this.convert_time(state.pgc.cell_playback[state.cellN - 1].playback_time);

    cell_change_event.pg_length = 0;
    // Find start cell of program.
    first_cell_nr = state.pgc.program_map[state.pgN - 1];
    // Find end cell of program.
    if (state.pgN < state.pgc.nr_of_programs)
      last_cell_nr = state.pgc.program_map[state.pgN] - 1;
    else
      last_cell_nr = state.pgc.nr_of_cells;
    for (i = first_cell_nr; i <= last_cell_nr; i++)
      cell_change_event.pg_length += this.convert_time(state.pgc.cell_playback[i - 1].playback_time);
    cell_change_event.pgc_length = this.convert_time(state.pgc.playback_time);

    cell_change_event.cell_start = 0;
    for (i = 1; i < state.cellN; i++)
      cell_change_event.cell_start += this.convert_time(state.pgc.cell_playback[i - 1].playback_time);

    cell_change_event.pg_start = 0;
    for (i = 1; i < state.pgc.program_map[state.pgN - 1]; i++)
      cell_change_event.pg_start += this.convert_time(state.pgc.cell_playback[i - 1].playback_time);

    this.position_current.cell = this.position_next.cell;
    this.position_current.cell_restart = this.position_next.cell_restart;
    this.position_current.cell_start = this.position_next.cell_start;
    this.position_current.block = this.position_next.block;

    // VOBU info is used for mid cell resumes.
    this.vobu.vobu_start = this.position_next.cell_start + this.position_next.block;
    this.vobu.vobu_next = 0;
    // Make blockN == vobu_length to do expected_nav.
    this.vobu.vobu_length = 0;
    this.vobu.blockN = 0;

    // Update the spu palette at least on PGC changes.
    this.spu_clut_changed = true;
    this.position_current.spu_channel = -1; // Force an update
    this.position_current.audio_channel = -1; // Force an update

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: CELL_CHANGE', 'font-weight: bold;');
    }
    this.emit('cellChange', cell_change_event);

    this.nextBlock();
    return;
  }

  // Has the CLUT changed?
  if (this.spu_clut_changed) {
    //memcpy(buf, state.pgc.palette, sizeof(state.pgc.palette));
    this.spu_clut_changed = false;

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: SPU_CLUT_CHANGE', 'font-weight: bold;');
    }
    this.emit('spuClutChange', cell_change_event);

    this.nextBlock();
    return;
  }

  // Has the SPU channel changed?
  if (this.position_current.spu_channel != this.position_next.spu_channel) {
    var stream_change_event = new dvdEvents.dvdnav_spu_stream_change_event_t();

    stream_change_event.physical_wide = this.vm.get_subp_active_stream(0);
    stream_change_event.physical_letterbox = this.vm.get_subp_active_stream(1);
    stream_change_event.physical_pan_scan = this.vm.get_subp_active_stream(2);

    this.position_current.spu_channel = this.position_next.spu_channel;

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: SPU_STREAM_CHANGE', 'font-weight: bold;');
    }
    if (LOG_DEBUG) {
      console.log('jsdvdnav: SPU_STREAM_CHANGE stream_id_wide=%d', stream_change_event.physical_wide);
      console.log('jsdvdnav: SPU_STREAM_CHANGE stream_id_letterbox=%d', stream_change_event.physical_letterbox);
      console.log('jsdvdnav: SPU_STREAM_CHANGE stream_id_pan_scan=%d', stream_change_event.physical_pan_scan);
    }
    this.emit('spuStreamChange', stream_change_event);

    this.nextBlock();
    return;
  }

  // Has the audio channel changed?
  if (this.position_current.audio_channel != this.position_next.audio_channel) {
    var stream_change_event = new dvdEvents.dvdnav_audio_stream_change_event_t();

    stream_change_event.physical = this.vm.get_audio_active_stream();
    stream_change_event.logical = this.position_next.audio_channel;

    this.position_current.audio_channel = this.position_next.audio_channel;

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: AUDIO_STREAM_CHANGE', 'font-weight: bold;');
    }
    if (LOG_DEBUG) {
      console.log('jsdvdnav: AUDIO_STREAM_CHANGE stream_id=%d', stream_change_event.physical);
    }
    this.emit('audioStreamChange', stream_change_event);

    this.nextBlock();
    return;
  }

  // Check the STILLFRAME flag.
  if (this.position_current.still != 0) {
    var still_event = new dvdEvents.dvdnav_still_event_t();

    still_event.length = this.position_current.still;

    if (LOG_DEBUG) {
      console.log('%cjsdvdnav: STILL_FRAME', 'font-weight: bold;');
    }
    this.emit('stillFrame', still_event);

    this.nextBlock();
    return;
  }

  // Have we reached the end of a VOBU?
  if (this.vobu.blockN >= this.vobu.vobu_length) {
    // Have we reached the end of a cell?
    if (this.vobu.vobu_next == SRI_END_OF_CELL) {
      // End of Cell from NAV DSI info.
      // Handle related state changes in next iteration.
      this.position_current.still = this.position_next.still;

      /* We are about to leave a cell, so a lot of state changes could occur;
       * under certain conditions, the application should get in sync with us before this,
       * otherwise it might show stills or menus too shortly */
      if ((this.position_current.still || this.pci.hli.hl_gi.hli_ss) && !this.sync_wait_skip) {
        this.sync_wait = true;
      }

      if (!this.position_current.still || this.skip_still) {
        // No active cell still -> get us to the next cell.
        this.vm.get_next_cell();
        this.position_current.still = 0; // Still gets activated at end of cell.
        this.skip_still = 0;
        this.sync_wait_skip = false;
      }

      if (LOG_DEBUG) {
        console.log('%cjsdvdnav: NOP', 'font-weight: bold;');
      }
      if (LOG_DEBUG) {
        console.log('jsdvdnav: Still set to %s', utils.toHex(this.position_next.still));
      }
      this.emit('nop');

      this.nextBlock();
      return;
    }

    // At the start of the next VOBU -> expecting NAV packet.
    // The following instruction should return pci and dsi binary packets from the server.
    this.dvd.read_cache_block(this.file, 'NAV', this.vobu.vobu_start + this.vobu.vobu_next, 1, function(pci, dsi) {
      // Decode nav into pci and dsi. Then get next VOBU info.
      if (!pci || !dsi) {
        console.error('Expected NAV packet but none found.');
        return;
      }

      this.pci = pci;
      this.dsi = dsi;

      // We need to update the vm state.blockN with which VOBU we are in.
      // This is so RSM resumes to the VOBU level and not just the CELL level.
      this.vm.state.blockN = this.vobu.vobu_start - this.position_current.cell_start;

      this.get_vobu();
      this.vobu.blockN = 0;

      // Release NAV menu filter, when we reach the same NAV packet again.
      if (this.last_cmd_nav_lbn == this.pci.pci_gi.nv_pck_lbn)
        this.last_cmd_nav_lbn = SRI_END_OF_CELL;

      // Successfully got a NAV packet.
      this.cur_cell_time = this.convert_time(this.dsi.dsi_gi.c_eltm);

      if (LOG_DEBUG) {
        console.log('%cjsdvdnav: NAV_PACKET', 'font-weight: bold;');
      }
      this.emit('navPacket');

      // At each VOBU, requests the corresponding bit of the encoded video file.
      // We probably need to add the cell number too.
      this.dvd.read_cache_block(this.file, 'VID', this.vobu.vobu, this.vobu.vobuNb, function(buffer) {
        // We append the video chunk.
        this.player.appendVideoChunk(buffer);

        this.nextBlock();
      }.bind(this));

      this.vobu.vobu++;
    }.bind(this));

    return;
  }

  // To speed up things, we jump directly to the next VOBU.
  // We don't trigger event for individual blocks.
  this.vobu.blockN += this.vobu.vobu_length;

  this.nextBlock();
};

// Ported from settings.c.
// Characteristics/setting API calls.

/*
 * Specify whether the positioning works PGC or PG based.
 * Programs (PGs) on DVDs are similar to Chapters and a program chain (PGC)
 * usually covers a whole feature. This affects the behaviour of the
 * functions dvdnav_get_position() and dvdnav_sector_search(). See there.
 * Default is PG based positioning.
 */
dvdnav.prototype.set_PGC_positioning_flag = function(pgc) {
  this.pgc_based = pgc;
};

/**
 * Start the DVD playback.
 */
dvdnav.prototype.start = function() {
  // Set the PGC positioning flag to have position information relatively to the whole feature
  // instead of just relatively to the current chapter.
  this.set_PGC_positioning_flag(true);

  this.nextBlock();
};

dvdnav.prototype.nextBlock = function() {
  if (LOG_DEBUG) {
    console.log('-----------------------------------------------------------');
  }
  this.get_next_cache_block();
};
