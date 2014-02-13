// Create the directory containing the static assets.

'use strict';


import fs = require('fs');
import path = require('path');

export = createDir;

/**
 * Create a subfolder name `web` under the path `dvdPath`.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function createDir(dvdPath, callback) {
  process.stdout.write('\nCreating the `web` folder:\n');

  fs.mkdir(path.join(dvdPath, '/web/'), function(err) {
    if (err && err.code === 'EEXIST') {
      process.stdout.write('(Folder already exists)');
    } else if (err) {
      console.error(err);
    }

    callback();
  });
}
