// A class to manage everything related to the video player.

'use strict';


import utils = require('../utils');

export = Player;

class Player {
  private screen: HTMLVideoElement;

  constructor(screen: HTMLVideoElement) {
    this.screen = screen;
  }

  /**
   * Execute a callback.
   *
   * @param {string} path
   * @param {string} file
   * @param {function} callback
   */
  initializeVideoSource(path, file, callback) {
    if (file) {
      file = utils.convertVobPath('/' + path + file);
      console.log('file', file);

      if (this.screen.paused) {
        // The video is paused, we update the src and start playing.
        this.screen.src = file;
        this.screen.play();
      } else {
        // Otherwise, we wait until the current video playback finishes to switch the video.
        var changeSource = function(event) {
          console.log('HTMLVideoElement ended event', event);

          this.screen.src = file;
          this.screen.play();

          // Remove listener after execution.
          this.screen.removeEventListener('ended', changeSource.bind(this), false);
        };
        this.screen.addEventListener('ended', changeSource.bind(this), false);
      }
    }

    setTimeout(callback, 0);
  }

  /**
   * Update the video source if required.
   */
  appendVideoChunk() {
  }
}
