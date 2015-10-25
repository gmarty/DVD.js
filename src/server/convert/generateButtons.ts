// Generate buttons for menu UI.

/// <reference path="../../references.ts" />

'use strict';


import fs = require('fs');
import path = require('path');

import serverUtils = require('../../server/utils/index');
import editMetadataFile = require('../../server/utils/editMetadataFile');
import utils = require('../../utils');

var toHex = utils.toHex;

export = generateButtons;

/**
 * Generate buttons from menu UI.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function generateButtons(dvdPath: string, callback) {
  process.stdout.write('\nGenerating buttons:\n');

  var dvdName = dvdPath.split(path.sep).pop();
  var webPath = serverUtils.getWebPath(dvdPath);

  var ifoPath = getWebName('metadata');
  var filesList = require(ifoPath);

  var css = [];
  var pointer = 0;

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    ifoFile = path.join(webPath, '../', ifoFile);
    var name = path.basename(ifoFile);
    var basename = path.basename(name, '.json');
    var ifoJson = require(ifoFile);

    var vobPointer = 0;

    generateButtonsCss();

    function generateButtonsCss() {
      if (!ifoJson.menu_c_adt) {
        callNext();
        return;
      }

      var vob = ifoJson.menu_c_adt.cell_adr_table[vobPointer];
      var start = vob.start_sector;

      var cellID = vob.cell_id;
      var vobID = vob.vob_id;

      var ifoFile = path.join(webPath, basename + '-' + toHex(start) + '.json');
      var json = require(ifoFile);

      var cssContent = [];

      // A CSS file is always generated even if it's empty.
      if (json.pci && json.pci.hli && json.pci.hli.hl_gi && json.pci.hli.hl_gi.btn_ns !== undefined) {
        // Creating a CSS file with the buttons coordinates and size.
        // json.pci.hli.hl_gi.`btn_ns` or json.pci.hli.hl_gi.`nsl_btn_ns`?
        for (var i = 0; i < json.pci.hli.hl_gi.btn_ns; i++) {
          cssContent.push(`[data-domain="${pointer}"][data-cell="${cellID}"][data-vob="${vobID}"] .btn[data-id="${i}"]{` +
            buttonToCss(json.pci.hli.btnit[i], i) + '}');

          if (!css[pointer]) {
            css[pointer] = {};
          }
          if (!css[pointer].css) {
            css[pointer].css = [];
          }
          if (!css[pointer].css[cellID - 1]) {
            css[pointer].css[cellID - 1] = [];
          }
          if (!css[pointer].css[cellID - 1][vobID - 1]) {
            css[pointer].css[cellID - 1][vobID - 1] = [];
          }
          css[pointer].css[cellID - 1][vobID - 1].push(buttonToCss(json.pci.hli.btnit[i], i));
        }

        saveCSSFile(cssContent, json.pci.hli.hl_gi.btn_ns);
      }

      function buttonToCss(btn, i) {
        // @todo Read video dimension from source (e.g. 720 x 480).
        return 'left:' + round(btn.x_start / 720 * 100) + '%;' +
          'top:' + round(btn.y_start / 480 * 100) + '%;' +
          'width:' + round((btn.x_end - btn.x_start) / 720 * 100) + '%;' +
          'height:' + round((btn.y_end - btn.y_start) / 480 * 100) + '%';

        /**
         * Round a number to 1 digit.
         *
         * @param {Number} val
         * @returns {Number}
         */
        function round(val) {
          val = val.toFixed(1);

          if (val.substr(-1) === '0') {
            // Return '9' if val equals '9.0'.
            return Math.round(val);
          }

          return val;
        }
      }

      function saveCSSFile(cssContent, btn_nb) {
        var fileName = 'menu-' + pointer + '-' + cellID + '-' + vobID + '.css';
        cssContent = cssContent.join('');

        fs.writeFile(path.join(webPath, fileName), cssContent, function(err) {
          if (err) {
            console.error(err);
          }

          process.stdout.write('.');

          if (btn_nb > 0) {
            if (!css[pointer]) {
              css[pointer] = {};
            }
            if (!css[pointer].menuCell) {
              css[pointer].menuCell = {};
            }
            if (!css[pointer].menuCell[cellID]) {
              css[pointer].menuCell[cellID] = {};
            }
            if (!css[pointer].menuCell[cellID][vobID]) {
              css[pointer].menuCell[cellID][vobID] = {};
            }
            css[pointer].menuCell[cellID][vobID].css = '/' + dvdName + '/' + fileName;
            css[pointer].menuCell[cellID][vobID].btn_nb = btn_nb;
          }

          // Next iteration.
          vobPointer++;
          if (vobPointer < ifoJson.menu_c_adt.nr_of_vobs) {
            setTimeout(function() {
              generateButtonsCss();
            }, 0);
          } else {
            callNext();
          }
        });
      }

      function callNext() {
        pointer++;
        if (pointer < filesList.length) {
          setTimeout(function() {
            next(filesList[pointer].ifo);
          }, 0);
        } else {
          // At the end of all iterations.
          // Save a metadata file containing the list of all IFO files.
          editMetadataFile(getWebName('metadata'), css, function() {
            callback();
          });
        }
      }
    }
  }

  /**
   * Return the file path for the web given a file.
   * Used for naming both the IFO files and the metadata file.
   *
   * @param name A file name.
   * @return {string}
   */
  function getWebName(name: string): string {
    return path.join(webPath, getJsonFileName(name));
  }
}

/**
 * Transform the file name of a JSON file.
 *
 * @param {string} name A file name.
 * @return {string}
 */
function getJsonFileName(name: string): string {
  return name.replace(/\.IFO$/i, '') + '.json';
}
