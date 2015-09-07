// Create the directory containing the static assets.

'use strict';


import fs = require('fs');
import path = require('path');

import serverUtils = require('../../server/utils/index');

export = createDir;

/**
 * Create a subfolder to `webFolder` named like the DVD disc.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function createDir(dvdPath, callback) {
  process.stdout.write('\nCreating the `web` folder:\n');

  var webPath = serverUtils.getWebPath(dvdPath);

  fs.mkdir(webPath, function(err) {
    if (err && err.code === 'EEXIST') {
      process.stdout.write('(Folder already exists)\n');
    } else if (err) {
      console.error(err);
    }

    process.stdout.write('.');

    callback();
  });
}
