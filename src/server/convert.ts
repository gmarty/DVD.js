// Convert a DVD to a web suitable format.

/// <reference path="../references.ts" />

'use strict';


import path = require('path');
import optimist = require('optimist');

import generateCatalogue = require('../server/convert/generateCatalogue');
import createDir = require('../server/convert/createDir');
import convertIfo = require('../server/convert/convertIfo');
import generateChapters = require('../server/convert/generateChapters');
import extractNavPackets = require('../server/convert/extractNavPackets');
import extractMenu = require('../server/convert/extractMenu');
import generateMenuCellTable = require('../server/convert/generateMenuCellTable');
import generateButtons = require('../server/convert/generateButtons');
import generateJavaScript = require('../server/convert/generateJavaScript');
import encodeVideo = require('../server/convert/encodeVideo');

var cli: optimist.Optimist = optimist(process.argv.slice(2));
cli.usage('Convert a DVD for the web.\n' +
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

  // Create an empty directory if not already there.
  createDir(dvdPath, function() {
    // Convert IFO files.
    convertIfo(dvdPath, function() {
      // Generate WebVTT files with video chapters.
      generateChapters(dvdPath, function() {
        // Extract NAV packets.
        extractNavPackets(dvdPath, function() {
          // Generate JavaScript from VM instructions.
          generateJavaScript(dvdPath, function() {
            // Extract menu still frames.
            extractMenu(dvdPath, function() {
              // Generate menu cell table.
              generateMenuCellTable(dvdPath, function() {
                // Generate buttons for menu UI.
                generateButtons(dvdPath, function() {
                  // Convert video.
                  encodeVideo(dvdPath, function() {
                    // Regenerate the list of DVD.
                    generateCatalogue(function() {
                      console.log('That\'s all folks!');
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

convertDVD(dvdPath);
