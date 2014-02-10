// Convert IFO files and save as JSON.

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');

import jDataView = require('../../../public/lib/jDataView/src/jdataview.js');
import ifoRead = require('../../dvdread/ifo_read');
import dvdRead = require('../../dvdread/index');
import ifoTypes = require('../../dvdread/ifo_types');
import dvdTypes = require('../../dvdnav/dvd_types');

var ifo_handle_t = ifoTypes.ifo_handle_t;
var dvd_file_t = dvdTypes.dvd_file_t;

export = convertIfo;

/**
 * Convert IFO files from a folder to JSON files.
 *
 * @param {string} dvdPath
 */
function convertIfo(dvdPath: string, callback) {
  process.stdout.write('Convert IFO files:\n');

  var ifoPath = path.join(dvdPath, '/VIDEO_TS', '/*.IFO');
  glob(ifoPath, function(err, ifoFiles) {
    if (err) {
      console.error(err);
    }

    var dvdName = dvdPath.split(path.sep).pop();
    var fileList = [];
    var pointer = 0;

    next(ifoFiles[pointer]);

    // There are better ways to do async...
    function next(ifoFile: string) {
      var name = path.basename(ifoFile);
      fileList.push('/' + dvdName + '/web/' + name + '.json');

      fs.readFile(ifoFile, function(err, data) {
        if (err) {
          console.error(err);
        }

        var ifoFile = new ifo_handle_t();
        ifoFile.file = new dvd_file_t();
        ifoFile.file = {
          name: name,
          size: data.length
        };
        ifoFile.file.view = new jDataView(data, undefined, undefined, false);
        ifoFile.file.path = '';

        ifoFile = ifoRead.parseIFO(ifoFile);

        // We don't need all the properties from the original object.
        var json = {
          file: {
            file: {
              name: name,
              size: data.length
            },
            view: null,
            path: ''
          },

          // VMGI
          vmgi_mat: ifoFile.vmgi_mat,
          tt_srpt: ifoFile.tt_srpt,
          first_play_pgc: ifoFile.first_play_pgc,
          ptl_mait: ifoFile.ptl_mait,
          vts_atrt: ifoFile.vts_atrt,
          txtdt_mgi: ifoFile.txtdt_mgi,

          // Common
          pgci_ut: ifoFile.pgci_ut,
          menu_c_adt: ifoFile.menu_c_adt,
          menu_vobu_admap: ifoFile.menu_vobu_admap,

          // VTSI
          vtsi_mat: ifoFile.vtsi_mat,
          vts_ptt_srpt: ifoFile.vts_ptt_srpt,
          vts_pgcit: ifoFile.vts_pgcit,
          vts_tmapt: ifoFile.vts_tmapt,
          vts_c_adt: ifoFile.vts_c_adt,
          vts_vobu_admap: ifoFile.vts_vobu_admap
        };

        var jsonPath = getWebName(name);
        fs.writeFile(jsonPath, JSON.stringify(json), function(err) {
          if (err) {
            console.error(err);
          }

          process.stdout.write('.');

          // Next iteration.
          pointer++;
          if (pointer < ifoFiles.length) {
            setTimeout(function() {
              next(ifoFiles[pointer]);
            }, 0);
          } else {
            // At the end of all iterations.
            // Save a metadata file containing the list of all IFO files.
            fs.writeFile(getWebName('metadata'), JSON.stringify(fileList), function(err) {
              if (err) {
                console.error(err);
              }

              process.stdout.write('.');

              callback();
            });
          }
        });
      });
    }
  });

  /**
   * Return the file path for the web given a file.
   *
   * @param name A file name.
   * @returns {string}
   */
  function getWebName(name: string): string {
    return path.join(dvdPath, '/web/', name + '.json');
  }
}
