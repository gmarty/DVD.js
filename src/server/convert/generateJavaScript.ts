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

  // First Play PGC
  var json = require(path.join(dvdPath, '/web', '/VIDEO_TS.json'));

  if (!json.first_play_pgc.command_tbl.pre_cmds || !json.first_play_pgc.command_tbl.nr_of_pre) {
    console.error('Missing First Play PGC');
  }

  var code = '\'use strict\';\n' +
    'function fp_pgc() {\n' +
    recompile(json.first_play_pgc.command_tbl.pre_cmds) + '\n' +
    '}';

  // Save file.
  var jsPath = path.join(dvdPath, '/web', '/vm.js');
  fs.writeFile(jsPath, code, function(err) {
    if (err) {
      console.error(err);
    }

    process.stdout.write('.');

    callback();
  });
}
