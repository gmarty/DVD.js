// A class to manage everything related to the video player.

'use strict';


import config = require('../config');

var LOG_DEBUG = config.DEBUG;

export = Player;

class Player {
  private screen: HTMLVideoElement;
  private mediaSource: MediaSource;
  private sourceBuffer: SourceBuffer;

  constructor(screen: HTMLVideoElement) {
    this.screen = screen;

    // Initialise video.
    this.mediaSource = null;
    this.sourceBuffer = null;
  }

  /**
   * Initialize the video source via Media Source and execute a callback when ready.
   *
   * @param {string} path Unused in this implementation.
   * @param {string} file Unused in this implementation.
   * @param {function} callback A function to execute when the media source is opened.
   */
  initializeVideoSource(path, file, callback) {
    // New VOB file, it's probably a good idea to reinitialise video.
    this.mediaSource = new MediaSource();
    this.sourceBuffer = null;
    this.screen.src = window.URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', function(event) {
      if (LOG_DEBUG) {
        console.log('MediaSource sourceopen event', event);
      }
      this.sourceBuffer = this.mediaSource.addSourceBuffer('video/webm;codecs=vp8,vorbis');
      //this.sourceBuffer.timestampOffset = 0;

      if (this.screen.paused) {
        this.screen.play(); // Start playing after 1st chunk is appended.
      }

      callback.call(this);
    }.bind(this), false);

    if (LOG_DEBUG) {
      this.mediaSource.addEventListener('sourceended', function(event) {
        console.log('MediaSource sourceended event', event);
      }, false);

      this.mediaSource.addEventListener('sourceclose', function(event) {
        console.log('MediaSource sourceclose event', event);
      }, false);
    }
  }

  /**
   * Append a buffer to the current source buffer.
   *
   * @param {ArrayBuffer} buffer
   */
  appendVideoChunk(buffer: ArrayBuffer) {
    this.sourceBuffer.appendBuffer(new Uint8Array(buffer));
  }
}
