// Generate buttons for menu UI.

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');

import editMetadataFile = require('../../server/utils/editMetadataFile');
import utils = require('../../utils');

export = generateButtons;

/**
 * Generate buttons from menu UI.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function generateButtons(dvdPath: string, callback) {
  process.stdout.write('\nGenerating buttons:\n');

  var ifoPath = path.join(dvdPath, '/web', '/V*TS*-0x00.json');
  glob(ifoPath, function(err, ifoFiles) {
    if (err) {
      console.error(err);
    }

    var dvdName = dvdPath.split(path.sep).pop(); // Use path.resolve() instead.
    var cssFilesList = [];
    var pointer = 0;

    next(ifoFiles[pointer]);

    // There are better ways to do async...
    function next(ifoFile: string) {
      var name = path.basename(ifoFile);
      var json = require(ifoFile);

      var css = [];

      if (json.pci && json.pci.hli && json.pci.hli.hl_gi && json.pci.hli.hl_gi.btn_ns) {
        // Creating a CSS file with the buttons coordinates and size.
        // json.pci.hli.hl_gi.`btn_ns` or json.pci.hli.hl_gi.`nsl_btn_ns`?
        for (var i = 0; i < json.pci.hli.hl_gi.btn_ns; i++) {
          css.push(buttonToCss(json.pci.hli.btnit[i], i));
        }

        saveCSSFile(css);
      }

      function buttonToCss(btn, i) {
        return '.btn[data-id="' + i + '"]{' +
          'left:' + btn.x_start + 'px;' +
          'top:' + btn.y_start + 'px;' +
          'width:' + (btn.x_end - btn.x_start) + 'px;' +
          'height:' + (btn.y_end - btn.y_start) + 'px' +
          '}';
      }

      function saveCSSFile(css) {
        var fileName = getCSSFileName(name);

        cssFilesList.push('/' + dvdName + '/web/' + fileName);
        fs.writeFile(path.join(dvdPath, '/web/', fileName), css.join('\n'), function(err) {
          if (err) {
            console.error(err);
          }

          process.stdout.write('.');
        });
      }

      // Next iteration.
      pointer++;
      if (pointer < ifoFiles.length) {
        setTimeout(function() {
          next(ifoFiles[pointer]);
        }, 0);
      } else {
        // At the end of all iterations.
        // Save a metadata file containing the list of all IFO files.
        editMetadataFile(getWebName('metadata'), 'css', cssFilesList, function() {
          callback();
        });
      }
    }
  });

  /**
   * Return the file path for the web given a file.
   * Used for naming both the IFO files and the metadata file.
   *
   * @param name A file name.
   * @return {string}
   */
  function getWebName(name: string): string {
    return path.join(dvdPath, '/web/', getJsonFileName(name));
  }
}

/**
 * Transform the file name of a JSON file.
 *
 * @param name A file name.
 * @return {string}
 */
function getJsonFileName(name: string): string {
  return name.replace(/\.IFO$/i, '') + '.json';
}

/**
 * Return the file path for the web given a file.
 *
 * @param name A file name.
 * @return {string}
 */
function getCSSFileName(name: string): string {
  if (name.match(/VIDEO_TS/)) {
    // First Play menu.
    return 'menu.css';
  }

  // Video Title Set menu.
  var vts = name.substring(4, 6);
  return 'menu-' + vts + '.css';
}
