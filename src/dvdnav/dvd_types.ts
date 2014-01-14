/*
 * Various useful structs and enums for DVDs.
 */

'use strict';


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
