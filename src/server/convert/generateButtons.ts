// Generate buttons for menu UI.

/// <reference path="../../references.ts" />

'use strict';


import fs = require('fs');
import path = require('path');

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

  var ifoPath = path.join(dvdPath, '/web', '/metadata.json');
  var filesList = require(ifoPath);

  var dvdName = dvdPath.split(path.sep).pop();
  var menuCell = [];
  var pointer = 0;

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    ifoFile = path.join(dvdPath, '../', ifoFile);
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

      var ifoFile = path.join(dvdPath, '/web', '/' + basename + '-' + toHex(start) + '.json');
      var json = require(ifoFile);

      var css = [];

      // A CSS file is always generated even if it's empty.
      if (json.pci && json.pci.hli && json.pci.hli.hl_gi && json.pci.hli.hl_gi.btn_ns !== undefined) {
        // Creating a CSS file with the buttons coordinates and size.
        // json.pci.hli.hl_gi.`btn_ns` or json.pci.hli.hl_gi.`nsl_btn_ns`?
        for (var i = 0; i < json.pci.hli.hl_gi.btn_ns; i++) {
          css.push(buttonToCss(json.pci.hli.btnit[i], i));
        }

        saveCSSFile(css, json.pci.hli.hl_gi.btn_ns);
      }

      function buttonToCss(btn, i) {
        return '[data-cell="' + cellID + '"][data-vob="' + vobID + '"] .btn[data-id="' + i + '"]{' +
          'display:block;' +
          'left:' + btn.x_start + 'px;' +
          'top:' + btn.y_start + 'px;' +
          'width:' + (btn.x_end - btn.x_start) + 'px;' +
          'height:' + (btn.y_end - btn.y_start) + 'px' +
          '}';
      }

      function saveCSSFile(css, btn_nb) {
        var fileName = 'menu-' + pointer + '-' + cellID + '-' + vobID + '.css';
        css = css.join('\n');

        fs.writeFile(path.join(dvdPath, '/web/', fileName), css, function(err) {
          if (err) {
            console.error(err);
          }

          process.stdout.write('.');

          if (!menuCell[pointer]) {
            menuCell[pointer] = {};
            menuCell[pointer].menuCell = {};
          }
          if (!menuCell[pointer].menuCell[cellID]) {
            menuCell[pointer].menuCell[cellID] = {};
          }
          if (!menuCell[pointer].menuCell[cellID][vobID]) {
            menuCell[pointer].menuCell[cellID][vobID] = {};
          }
          menuCell[pointer].menuCell[cellID][vobID].css = '/' + dvdName + '/web/' + fileName;
          menuCell[pointer].menuCell[cellID][vobID].btn_nb = btn_nb;

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
          editMetadataFile(getWebName('metadata'), menuCell, function() {
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
    return path.join(dvdPath, '/web/', getJsonFileName(name));
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
