// Extract NAV packets from VOB files.

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');

import jDataView = require('../../../public/lib/jDataView/src/jdataview.js');
import Stream = require('../../utils/stream');
import decodePacket = require('../../utils/decode_packet');
import navRead = require('../../dvdread/nav_read');
import utils = require('../../utils');

/**
 * The length of one Logical Block of a DVD.
 * From dvdread/index.ts.
 * @const
 */
var DVD_VIDEO_LB_LEN = 2048;

export = extractNav;

/**
 * Extract NAV packets from the VOB files located in a folder.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function extractNav(dvdPath: string, callback) {
  process.stdout.write('\nExtracting NAV packets:\n');

  var ifoPath = path.join(dvdPath, '/VIDEO_TS', '/*.VOB');
  glob(ifoPath, function(err, vobFiles) {
    if (err) {
      console.error(err);
    }

    var pointer = 0;

    next(vobFiles[pointer]);

    // There are better ways to do async...
    function next(vobFile: string) {
      var name = path.basename(vobFile);

      fs.readFile(vobFile, function(err, data) {
        if (err) {
          console.error(err);
        }

        var p = new Stream(data);
        var lastSector = data.length / DVD_VIDEO_LB_LEN;

        extractFromSector(0x00);

        function extractFromSector(sector) {
          p.seek(sector * DVD_VIDEO_LB_LEN);
          var navPackets = decodePacket(p);

          var json = {
            pci: navRead.parsePCI(new jDataView(navPackets.pci, undefined, undefined, false)),
            dsi: navRead.parseDSI(new jDataView(navPackets.dsi, undefined, undefined, false))
          };

          var jsonPath = path.join(dvdPath, '/web/', name + '-' + utils.toHex(sector) + '.json');
          fs.writeFile(jsonPath, JSON.stringify(json), function(err) {
            if (err) {
              console.error(err);
            }

            process.stdout.write('.');

            // Extract the next NAV packets recursively.
            var nextSector = json.dsi.dsi_gi.nv_pck_lbn + json.dsi.dsi_gi.vobu_ea + 1;

            if (nextSector < lastSector) {
              setTimeout(function() {
                extractFromSector(nextSector);
              }, 0);
            } else {
              // Next iteration.
              pointer++;
              if (pointer < vobFiles.length) {
                setTimeout(function() {
                  next(vobFiles[pointer]);
                }, 0);
              } else {
                // At the end of all iterations.
                callback();
              }
            }
          });
        }
      });
    }
  });
}
