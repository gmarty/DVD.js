// Extract menu still frames.

/// <reference path="../../references.ts" />

'use strict';


import path = require('path');

import utils = require('../../utils');
import editMetadataFile = require('../../server/utils/editMetadataFile');

export = extractMenu;

/**
 * Extract menu still frames.
 * @todo Delete the temporary mpeg file after extraction.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function extractMenu(dvdPath: string, callback) {
  process.stdout.write('\nExtracting menu:\n');

  var ifoPath = path.join(dvdPath, '/web', '/metadata.json');
  var filesList = require(ifoPath);

  var menu = [];
  var pointer = 0;

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    ifoFile = path.join(dvdPath, '../', ifoFile);
    var json = require(ifoFile);

    menu[pointer] = {};
    menu[pointer].menu = {};

    extractMenuData();

    function extractMenuData() {
      if (!json.pgci_ut || !json.pgci_ut.lu || !Array.isArray(json.pgci_ut.lu)) {
        callNext();
        return;
      }

      for (var i = 0; i < json.pgci_ut.nr_of_lus; i++) {
        var lu = json.pgci_ut.lu[i];
        var lang = utils.bit2str(lu.lang_code);
        menu[pointer].menu[lang] = [];
        for (var j = 0; j < lu.pgcit.nr_of_pgci_srp; j++) {
          var pgci_srp = lu.pgcit.pgci_srp[j];
          var pgcIndex = j + 1;
          var vobID = null;
          var cellID = null;
          if (pgci_srp.pgc.cell_position && pgci_srp.pgc.cell_position.length) {
            vobID = pgci_srp.pgc.cell_position[0].vob_id_nr;
            cellID = pgci_srp.pgc.cell_position[0].cell_nr;
          }
          menu[pointer].menu[lang].push({
            pgc: pgcIndex,
            entry: pgci_srp.entry_id,
            vobID: vobID,
            cellID: cellID
          });
        }
      }

      callNext();

      function callNext() {
        pointer++;
        if (pointer < filesList.length) {
          setTimeout(function() {
            next(filesList[pointer].ifo);
          }, 0);
        } else {
          // At the end of all iterations.
          // Save a metadata file containing the list of all IFO files.
          editMetadataFile(getWebName('metadata'), menu, function() {
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
