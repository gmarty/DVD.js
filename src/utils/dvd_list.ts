// Return the list of DVD available locally.

'use strict';


import fs = require('fs');
import path = require('path');

/**
 * Return the list of directory given a directory.
 * @todo Refactor to use asynchronous API.
 *
 * @param {string} dvdPath
 * @param {function(Array.<string>)} callback
 */
function getDVDList(dvdPath, callback) {
  var dvds = fs.readdirSync(dvdPath)
    .filter(function(file) {
      var stats = fs.statSync(path.normalize(dvdPath, file));
      return stats.isDirectory();
    });

  callback(dvds);
}

export = getDVDList;
