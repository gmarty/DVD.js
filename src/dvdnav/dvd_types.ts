/*
 * Various useful structs and enums for DVDs.
 */

'use strict';


/**
 *
 */
export enum dvd_read_domain_t {
  DVD_READ_INFO_FILE,        // VIDEO_TS.IFO  or VTS_XX_0.IFO (title)
  DVD_READ_INFO_BACKUP_FILE, // VIDEO_TS.BUP  or VTS_XX_0.BUP (title)
  DVD_READ_MENU_VOBS,        // VIDEO_TS.VOB  or VTS_XX_0.VOB (title)
  DVD_READ_TITLE_VOBS        // VTS_XX_[1-9].VOB (title). All files in the title set are opened and read as a single file.
}

/*
 * DVD Menu ID
 * (see dvdnav_menu_call())
 */
export enum DVDMenuID_t {
  /* When used in VTS domain, DVD_MENU_Escape behaves like DVD_MENU_Root,
   * but from within a menu domain, DVD_MENU_Escape resumes playback. */
  DVD_MENU_Escape,
  DVD_MENU_Unknown, // Unused
  DVD_MENU_Title,
  DVD_MENU_Root,
  DVD_MENU_Subpicture,
  DVD_MENU_Audio,
  DVD_MENU_Angle,
  DVD_MENU_Part
}

/* Domain */
export enum DVDDomain_t {
  DVD_DOMAIN_FirstPlay = 1, // First Play Domain
  DVD_DOMAIN_VTSTitle = 2, // Video Title Set Domain
  DVD_DOMAIN_VMGM = 4, // Video Manager Domain
  DVD_DOMAIN_VTSMenu = 8   // Video Title Set Menu Domain
}

/*
 * Structure containing info on highlight areas
 * (see dvdnav_get_highlight_area())
 */
export function dvdnav_highlight_area_t() {
  return {
    palette: 'uint32_t', // The CLUT entries for the highlight palette (4-bits per entry -> 4 entries)
    sx: 'uint16_t', sy: 'uint16_t', ex: 'uint16_t', ey: 'uint16_t', // The start/end x,y positions
    pts: 'uint32_t',         // Highlight PTS to match with SPU

    // button number for the SPU decoder/overlaying engine
    buttonN: 'uint32_t'
  };
}

/* The audio format */
export enum DVDAudioFormat_t {
  DVD_AUDIO_FORMAT_AC3,
  DVD_AUDIO_FORMAT_UNKNOWN_1,
  DVD_AUDIO_FORMAT_MPEG,
  DVD_AUDIO_FORMAT_MPEG2_EXT,
  DVD_AUDIO_FORMAT_LPCM,
  DVD_AUDIO_FORMAT_UNKNOWN_5,
  DVD_AUDIO_FORMAT_DTS,
  DVD_AUDIO_FORMAT_SDDS
}

/**
 * Opaque type for a file read handle, much like a normal fd or FILE *.
 *
 * @constructor
 */
export function dvd_file_t() {
  // Basic information.
  //this.dvd = dvd_reader_t(); -> Better avoid recursion. The relation is inverted here.

  // Hack for selecting the right css title.
  //this.css_title = null;

  // Information required for an image file.
  //this.lb_start = null;
  //this.seek_pos = null;
  this.file = null; // File type
  this.view = null; // jDataView

  // Information required for a directory path drive.
  //this.title_sizes = new Array(TITLES_MAX);
  //this.title_devs = new Array(TITLES_MAX); // Array of dvd_input_t().

  // Calculated at open-time, size in blocks.
  //this.filesize = null; // ssize_t()

  this.path = '';
}

export function vm_position_t() {
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
