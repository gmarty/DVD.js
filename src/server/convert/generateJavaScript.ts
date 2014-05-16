// Generate a WebVTT file with video chapters.

'use strict';


import fs = require('fs');
import path = require('path');

import recompile = require('../../vm/recompile');
import utils = require('../../utils');

export = generateJavaScript;

/**
 * Generate generateJavaScript code from IFO files pre/post commands.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function generateJavaScript(dvdPath: string, callback) {
  process.stdout.write('\nGenerating JavaScript files:\n');

  var ifoPath = path.join(dvdPath, '/web', '/metadata.json');
  var filesList = require(ifoPath);

  var pointer = 0;
  var code = [
    '\'use strict\';',
    '',
    'var LANG = "en";',
    'var MPGCIUT=[];',
    'var g=[];',
    'var dummy=0;',
  ];

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    ifoFile = path.join(dvdPath, '../', ifoFile);
    var json = require(ifoFile);

    // First Play PGC
    code = first_play_pgc(json, code);

    // VMGM table (Menu PGCI Unit table)
    code = pgci_srp(json, code);

    pointer++;
    if (pointer < filesList.length) {
      setTimeout(function() {
        next(filesList[pointer].ifo);
      }, 0);
    } else {
      // At the end of all iterations.

      // Save file.
      var jsPath = path.join(dvdPath, '/web', '/vm.js');
      fs.writeFile(jsPath, code.join('\n'), function(err) {
        if (err) {
          console.error(err);
        }

        process.stdout.write('.');

        callback();
      });
    }

    function first_play_pgc(json, code) {
      // First Play PGC
      if (!json.first_play_pgc || !json.first_play_pgc.command_tbl.nr_of_pre) {
        console.log('No First Play PGC present');
        return  code;
      }

      code = code.concat([
        '',
        '// First Play PGC',
          'function fp_pgc() {' + recompile(json.first_play_pgc.command_tbl.pre_cmds) + '}'
      ]);
      return  code;
    }

    function pgci_srp(json, code) {
      if (!json.pgci_ut || !json.pgci_ut.lu || !Array.isArray(json.pgci_ut.lu)) {
        console.log('No Menu PGCI Unit table present');
        return  code;
      }
      var index = pointer; // 0 for VIDEO_TS (VMGM) ; > 0 for VTS (VTSM)

      code = code.concat([
        '',
        '// VMGM',
          'MPGCIUT[' + index + ']=[];'
      ]);

      for (var i = 0; i < json.pgci_ut.nr_of_lus; i++) {
        var lu = json.pgci_ut.lu[i];
        var lang = utils.bit2str(lu.lang_code);
        code.push(
            'MPGCIUT[' + index + '].' + lang + '={};'
        );
        for (var j = 0; j < lu.pgcit.nr_of_pgci_srp; j++) {
          var pgci_srp = lu.pgcit.pgci_srp[j];
          var pgcIndex = j + 1;
          code = code.concat([
              'MPGCIUT[' + index + '].' + lang + '[' + pgcIndex + ']=function(){',
            'if(pre()){return;}',
              'dvd.playMenuByID("#menu-' + lang + '-' + index + '-' + pgcIndex + '");',
            'post();',
              'function pre(){' + recompile(pgci_srp.pgc.command_tbl.pre_cmds) + '}',
              'function post(){' + recompile(pgci_srp.pgc.command_tbl.post_cmds) + '}',
              'function cell(){' + recompile(pgci_srp.pgc.command_tbl.cell_cmds) + '}',
            '};',
          ]);
        }
      }
      return  code;
    }
  }
}
