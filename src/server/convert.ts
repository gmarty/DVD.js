// Convert a DVD to a web suitable format.

'use strict';


import optimist = require('optimist');

import createDir = require('./convert/createDir');
import generateCatalogue = require('./convert/generateCatalogue');
import convertIfo = require('./convert/convertIfo');
import extractNavPackets = require('./convert/extractNavPackets');
import encodeVideo = require('./convert/encodeVideo');

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