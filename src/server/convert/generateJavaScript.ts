// Generate a WebVTT file with video chapters.

'use strict';


import fs = require('fs');
import path = require('path');

import recompile = require('../../vm/recompile');
import utils = require('../../utils');

var toHex = utils.toHex;

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
    'var lang = "en";',
    'var domain = 0;',
    'var pgc = 0;',
    'var sprm = {ASTN: 0, SPSTN: 0, AGLN: 0, TTN: 0, VTS_TTN: 0, TT_PGCN: 0, PTTN: 0, HL_BTNN: 0, NVTMR: 0, NV_PGCN: 0, CC_PLT: 0, PLT: 0};',
    'var g = Array(16);',
    'var MPGCIUT = [];',
    'var PGCIUT = [];',
    'var btnCmd = [];',
    'var dummy = 0;',
    '',
    'for (var i = 0; i < 16; i++) {',
    '  g[i] = 0;',
    '}'
  ];

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    ifoFile = path.join(dvdPath, '../', ifoFile);
    var name = path.basename(ifoFile);
    var basename = path.basename(name, '.json');
    var json = require(ifoFile);

    // First Play PGC
    code = first_play_pgc(json, code);

    // Menu PGCI Unit table
    code = pgci_srp(json, code);

    // PGCI Unit table
    code = pgciut(json, code);

    // Button commands
    code = btn_cmd(json, code);

    pointer++;
    if (pointer < filesList.length) {
      setTimeout(function() {
        next(filesList[pointer].ifo);
      }, 0);
    } else {
      // At the end of all iterations.

      // Add the event listener to the UI buttons.
      code = addEventListener(json, code);

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
          'MPGCIUT[' + index + '] = [];'
      ]);

      for (var i = 0; i < json.pgci_ut.nr_of_lus; i++) {
        var lu = json.pgci_ut.lu[i];
        var lang = utils.bit2str(lu.lang_code);
        code.push(
            'MPGCIUT[' + index + '].' + lang + ' = {};'
        );
        for (var j = 0; j < lu.pgcit.nr_of_pgci_srp; j++) {
          var pgci_srp = lu.pgcit.pgci_srp[j];
          var pgcIndex = j + 1;
          if (pgci_srp.pgc && pgci_srp.pgc.command_tbl) {
            code = code.concat([
                'MPGCIUT[' + index + '].' + lang + '[' + pgcIndex + '] = {',
              'run: function() {',
                '  domain = ' + index + ';',
                '  pgc = ' + pgcIndex + ';',
              '  console.log(domain, lang, pgc); // DEBUG',
              '  if(this.pre()){return;}',
                '  dvd.playMenuByID("menu-' + lang + '-' + index + '-' + pgcIndex + '");',
              '  if(this.cell()){return;}'
            ]);
            if (pgci_srp.pgc.cell_playback && pgci_srp.pgc.cell_playback[0].stc_discontinuity) {
              code.push('  this.post();');
            }
            code = code.concat([
              '},',
                'pre: function() {' + recompile(pgci_srp.pgc.command_tbl.pre_cmds) + '},',
                'post: function() {' + recompile(pgci_srp.pgc.command_tbl.post_cmds) + '},',
                'cell: function() {' + recompile(pgci_srp.pgc.command_tbl.cell_cmds) + '}',
              '};'
            ]);
          }
        }
      }
      return code;
    }

    function pgciut(json, code) {
      if (!json.vts_pgcit || !json.vts_pgcit.pgci_srp || !Array.isArray(json.vts_pgcit.pgci_srp)) {
        console.log('No Menu PGCI Unit table present');
        return  code;
      }
      var index = pointer; // 0 for VIDEO_TS (VMGM) ; > 0 for VTS (VTSM)

      code = code.concat([
        '',
          'PGCIUT[' + index + '] = [];'
      ]);

      for (var j = 0; j < json.vts_pgcit.nr_of_pgci_srp; j++) {
        var pgci_srp = json.vts_pgcit.pgci_srp[j];
        var pgcIndex = j + 1;
        if (pgci_srp.pgc && pgci_srp.pgc.command_tbl) {
          code = code.concat([
              'PGCIUT[' + index + '][' + pgcIndex + '] = {',
            'run: function() {',
              '  domain = ' + index + ';',
              '  pgc = ' + pgcIndex + ';',
            '  console.log(domain, lang, pgc); // DEBUG',
            '  if(this.pre()){return;}',
              '  dvd.playByID("video-' + index + '");',
            '  if(this.cell()){return;}'
          ]);
          if (pgci_srp.pgc.cell_playback && pgci_srp.pgc.cell_playback[0].stc_discontinuity) {
            code.push('  this.post();');
          }
          code = code.concat([
            '},',
              'pre: function() {' + recompile(pgci_srp.pgc.command_tbl.pre_cmds) + '},',
              'post: function() {' + recompile(pgci_srp.pgc.command_tbl.post_cmds) + '},',
              'cell: function() {' + recompile(pgci_srp.pgc.command_tbl.cell_cmds) + '}',
            '};'
          ]);
        }
      }
      return code;
    }

    function btn_cmd(json, code) {
      if (!json.menu_c_adt || !json.menu_c_adt.nr_of_vobs) {
        return code;
      }

      code.push('btnCmd[' + pointer + '] = [];');

      for (var i = 0; i < json.menu_c_adt.nr_of_vobs; i++) {
        var vobPointer = json.menu_c_adt.cell_adr_table[i].vob_id;
        var vob = json.menu_c_adt.cell_adr_table[i];
        var start = vob.start_sector;

        var ifoFile = path.join(dvdPath, '/web', '/' + basename + '-' + toHex(start) + '.json');
        var pci = require(ifoFile).pci;

        code.push('btnCmd[' + pointer + '][' + vobPointer + '] = [];');
        for (var j = 0; j < pci.hli.hl_gi.btn_ns; j++) {
          var cmd = pci.hli.btnit[j].cmd;
          code.push('btnCmd[' + pointer + '][' + vobPointer + '][' + j + '] = function(){domain = ' + pointer + ';' + recompile([cmd]) + '};');
        }
      }

      return  code;
    }

    function addEventListener(json, code) {
      code = code.concat([
        'function init() {',
        '  dvd.addEventListener(\'click\', function(event) {',
        '    event.stopImmediatePropagation();',
        '    var target = event.target;',
        '    var domain = target.parentNode.dataset.domain;',
        '    var vob = target.parentNode.dataset.vob;',
        '    var id = target.dataset.id;',
        '',
        '    sprm["HL_BTNN"] = parseInt(id, 10);',
        '',
        '    if (target.tagName !== \'INPUT\' || domain === undefined || vob === undefined || id === undefined) {',
        '      return;',
        '    }',
        '',
        '    if (!btnCmd[domain] || !btnCmd[domain][vob] || !btnCmd[domain][vob][id]) {',
        '      console.error(\'Missing button command for\', domain, vob, id);',
        '      return;',
        '    }',
        '',
        '    // DEBUG',
        '    console.log(domain, vob, id, btnCmd[domain][vob][id]);',
        '',
        '    btnCmd[domain][vob][id]();',
        '  });',
        '',
        '  // Update the value of lang.',
        '  MPGCIUT.forEach(function(obj) {',
        '    lang = Object.keys(obj)[0] || lang;',
        '  });',
        '}',
        ''
      ]);

      return code;
    }
  }
}
