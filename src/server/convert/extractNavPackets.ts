// Extract NAV packets from VOB files.

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');
var jDataView: jDataViewStatic = require('jdataview');

import Stream = require('../../server/utils/stream');
import decodePacket = require('../../server/utils/decode_packet');
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

    // Filter out non-menu VOB files as we only use these NAV packets for generating UI buttons.
    vobFiles = vobFiles.filter(function(ifoFile) : boolean {
      return ifoFile.match(/VIDEO_TS\.VOB$/) || ifoFile.match(/VTS_\d{1,2}_0.VOB$/);
    });

    if (!vobFiles.length) {
      // Some DVD don't have menu at all.
      callback();
      return;
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

          var jsonPath = getNavFilename(name, sector);
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

  /**
   * Return the file path for the web given a file.
   * Used for naming both the NAV packet files and the metadata file.
   *
   * @param {string} name A file name.
   * @param {number} sector A file name.
   * @return {string}
   */
  function getNavFilename(name: string, sector: number): string {
    return path.join(dvdPath, '/web/', getJsonFileName(name, sector));
  }
}

/**
 * Transform the file name of a JSON file.
 *
 * @param {string} name A file name.
 * @param {number} sector A file name.
 * @return {string}
 */
function getJsonFileName(name: string, sector: number): string {
  return name.replace(/\.VOB$/i, '') + '-' + utils.toHex(sector) + '.json';
}
