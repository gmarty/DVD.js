'use strict';


/*
 * This header defines events and event types
 */

/*
 * DVDNAV_STILL_FRAME
 *
 * We have reached a still frame. The player application should wait
 * the amount of time specified by the still's length while still handling
 * user input to make menus and other interactive stills work.
 * The last delivered frame should be kept showing.
 * Once the still has timed out, call dvdnav_skip_still().
 * A length of 0xFF means an infinite still which has to be skipped
 * indirectly by some user interaction.
 */
export function dvdnav_still_event_t() {
  /* The length (in seconds) the still frame should be displayed for,
   * or 0xFF if infinite. */
  this.length = 0;
}


/*
 * DVDNAV_SPU_STREAM_CHANGE
 *
 * Inform the SPU decoding/overlaying engine to switch SPU channels.
 */
export function dvdnav_spu_stream_change_event_t() {
  /* The physical (MPEG) stream number for widescreen SPU display.
   * Use this, if you blend the SPU on an anamorphic image before
   * unsqueezing it. */
  this.physical_wide = 0;

  /* The physical (MPEG) stream number for letterboxed display.
   * Use this, if you blend the SPU on an anamorphic image after
   * unsqueezing it. */
  this.physical_letterbox = 0;

  /* The physical (MPEG) stream number for pan&scan display.
   * Use this, if you blend the SPU on an anamorphic image after
   * unsqueezing it the pan&scan way. */
  this.physical_pan_scan = 0;

  // The logical (DVD) stream number.
  this.logical = 0;
}


/*
 * DVDNAV_AUDIO_STREAM_CHANGE
 *
 * Inform the audio decoder to switch channels.
 */
export function dvdnav_audio_stream_change_event_t() {
  // The physical (MPEG) stream number.
  this.physical = 0;

  // The logical (DVD) stream number.
  this.logical = 0;
}


/*
 * DVDNAV_VTS_CHANGE
 *
 * Some status information like video aspect and video scale permissions do
 * not change inside a VTS. Therefore this event can be used to query such
 * information only when necessary and update the decoding/displaying
 * accordingly.
 */
export function dvdnav_vts_change_event_t() {
  this.old_vtsN = 0;    // The old VTS number
  this.old_domain = {}; // The old domain
  this.new_vtsN = 0;    // The new VTS number
  this.new_domain = {}; // The new domain
}


/*
 * DVDNAV_CELL_CHANGE
 *
 * Some status information like the current Title and Part numbers do not
 * change inside a cell. Therefore this event can be used to query such
 * information only when necessary and update the decoding/displaying
 * accordingly.
 * Some useful information for accurate time display is also reported
 * together with this event.
 */
export function dvdnav_cell_change_event_t() {
  this.cellN = 0;       // The new cell number
  this.pgN = 0;         // The current program number
  this.cell_length = 0; // The length of the current cell in PTS ticks
  this.pg_length = 0;   // The length of the current program in PTS ticks
  this.pgc_length = 0;  // The length of the current program chain in PTS ticks
  this.cell_start = 0;  // The start time of the current cell relatively to the PGC in PTS ticks
  this.pg_start = 0;    // The start time of the current PG relatively to the PGC in PTS ticks
}


/*
 * DVDNAV_NAV_PACKET
 *
 * NAV packets are useful for various purposes. They define the button
 * highlight areas and VM commands of DVD menus, so they should in any
 * case be sent to the SPU decoder/overlaying engine for the menus to work.
 * NAV packets also provide a way to detect PTS discontinuities, because
 * they carry the start and end PTS values for the current VOBU.
 * (pci.vobu_s_ptm and pci.vobu_e_ptm) Whenever the start PTS of the
 * current NAV does not match the end PTS of the previous NAV, a PTS
 * discontinuity has occured.
 * NAV packets can also be used for time display, because they are
 * timestamped relatively to the current Cell.
 */
// No event type associated.


/*
 * DVDNAV_STOP
 *
 * Applications should end playback here. A subsequent dvdnav_get_next_block()
 * call will restart the VM from the beginning of the DVD.
 */
// No event type associated.


/*
 * DVDNAV_HIGHLIGHT
 *
 * The current button highlight changed. Inform the overlaying engine to
 * highlight a different button. Please note, that at the moment only mode 1
 * highlights are reported this way. That means, when the button highlight
 * has been moved around by some function call, you will receive an event
 * telling you the new button. But when a button gets activated, you have
 * to handle the mode 2 highlighting (that is some different colour the
 * button turns to on activation) in your application.
 */
export function dvdnav_highlight_event_t() {
  return {
    // highlight mode: 0 - hide, 1 - show, 2 - activate, currently always 1
    display: 0,

    // @fixme these fields are currently not set
    palette: 0, /* The CLUT entries for the highlight palette
     (4-bits per entry -> 4 entries) */
    sx: 0, sy: 0, ex: 0, ey: 0, // The start/end x,y positions
    pts: 0, // Highlight PTS to match with SPU

    // button number for the SPU decoder/overlaying engine
    buttonN: 0
  }
}


/*
 * DVDNAV_SPU_CLUT_CHANGE
 *
 * Inform the SPU decoder/overlaying engine to update its colour lookup table.
 * The CLUT is given as 16 uint32_t's in the buffer.
 */
// No event type associated.


/*
 * DVDNAV_HOP_CHANNEL
 *
 * A non-seamless operation has been performed. Applications can drop all
 * their internal fifo's content, which will speed up the response.
 */
// No event type associated.


/*
 * DVDNAV_WAIT
 *
 * We have reached a point in DVD playback, where timing is critical.
 * Player application with internal fifos can introduce state
 * inconsistencies, because libdvdnav is always the fifo's length
 * ahead in the stream compared to what the application sees.
 * Such applications should wait until their fifos are empty
 * when they receive this type of event.
 * Once this is achieved, call dvdnav_skip_wait().
 */
// No event type associated.
