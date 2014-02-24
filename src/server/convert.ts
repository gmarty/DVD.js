// Convert a DVD to a web suitable format.

'use strict';


import path = require('path');
import optimist = require('optimist');

import createDir = require('../server/convert/createDir');
import generateCatalogue = require('../server/convert/generateCatalogue');
import convertIfo = require('../server/convert/convertIfo');
import extractNavPackets = require('../server/convert/extractNavPackets');
import encodeVideo = require('../server/convert/encodeVideo');

var cli = optimist
  .usage('Convert a DVD for the web.\n' +
    'Usage: $0 path/to/DVD/root');
var dvdPath = cli.argv._[0];

// No param? Show help message then.
if (!dvdPath) {
  cli.showHelp();
  process.exit(0);
}

function convertDVD(dvdPath) {
  dvdPath = dvdPath.split(path.sep);

  // We remove the trailing /.
  var part = dvdPath.pop();
  if (part !== '') {
    dvdPath.push(part);
  }
  dvdPath = dvdPath.join(path.sep);

  // Regenerate the list of DVD.
  generateCatalogue(function() {
    // Convert IFO files.
    createDir(dvdPath, function() {
      // Convert IFO files.
      convertIfo(dvdPath, function() {
        // Extract NAV packets.
        extractNavPackets(dvdPath, function() {
          // Convert video.
          encodeVideo(dvdPath);
        });
      });
    });
  });
}

convertDVD(dvdPath);
