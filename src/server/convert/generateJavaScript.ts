// Generate a JavaScript file with translated VM programs.

/// <reference path="../../references.ts" />

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
  var currentVideoTitle = 1;
  var code = [
    '\'use strict\';',
    '',
    'var lang = "en";',
    'var domain = 0;',
    'var pgc = 0;',
    'var gprm = Array(16);',
    'var sprm = {ASTN: 15, SPSTN: 62, AGLN: 1, TTN: 1, VTS_TTN: 1, TT_PGCN: 0, PTTN: 1, HL_BTNN: 1 * 0x400, NVTMR: 0, NV_PGCN: 0, CC_PLT: 0, PLT: 15};',
    'var PGCIUT = [];',
    'var MPGCIUT = [];',
    'var btnCmd = [];',
    'var VTT_TABLE = {};',
    'var PTT_TABLE = {};',
    'var MENU_TYPES = [];',
    'var dummy = 0;',
    '',
    'for (var i = 0; i < 16; i++) {',
    '  gprm[i] = 0;',
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

    // PGCI Unit table
    code = pgciut(json, code);

    // Menu PGCI Unit table
    code = pgci_srp(json, code);

    // Button commands
    code = btn_cmd(json, code);

    // VTT table (used for JumpTT)
    code = vtt_table(json, code);

    // PTT table (used for JumpVTS_PTT)
    code = ptt_table(json, code);

    // Menu type table (used for JumpSS VMGM, JumpSS VTSM, CallSS VMGM and CallSS VTSM)
    code = menu_type_table(json, code);

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
        return code;
      }

      code = code.concat([
        '',
        '// First Play PGC',
        'function fp_pgc() {',
        // We need to delay startup to allow the browser to preload the video
        // and get the VTT files.
        // @todo Listen to video events of all videos.
          '  setTimeout(function() {' + recompile(json.first_play_pgc.command_tbl.pre_cmds) + '}, 500);',
        '}',
      ]);
      return code;
    }

    function pgciut(json, code) {
      if (!json.vts_pgcit || !json.vts_pgcit.pgci_srp || !Array.isArray(json.vts_pgcit.pgci_srp)) {
        console.log('No Menu PGCI Unit table present');
        return code;
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
          // The post command should be executed at the end of the video.
          //code.push('  this.post();');
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

    function pgci_srp(json, code) {
      if (!json.pgci_ut || !json.pgci_ut.lu || !Array.isArray(json.pgci_ut.lu)) {
        console.log('No Menu PGCI Unit table present');
        return code;
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
          code.push('btnCmd[' + pointer + '][' + vobPointer + '][' + j + '] = function() {domain = ' + pointer + ';' + recompile([cmd]) + '};');
        }
      }

      return code;
    }

    function vtt_table(json, code) {
      if (!json.vts_pgcit || !json.vts_pgcit.pgci_srp || !Array.isArray(json.vts_pgcit.pgci_srp)) {
        console.log('No PGCI Unit table present');
        return code;
      }
      var domainIndex = pointer; // 0 for VIDEO_TS (VMGM) ; > 0 for VTS (VTSM)

      for (var i = 0; i < json.vts_pgcit.nr_of_pgci_srp; i++) {
        var pgci_srp = json.vts_pgcit.pgci_srp[i];
        var pgcIndex = i + 1;
        if (pgci_srp.pgc) {
          code.push('VTT_TABLE[' + currentVideoTitle + '] = {domain: ' + domainIndex + ', pgc: ' + pgcIndex + '};');
        }
        currentVideoTitle++;
      }

      return code;
    }

    // The table matches PTT to chapters.
    function ptt_table(json, code) {
      if (!json.vts_pgcit || !json.vts_pgcit.pgci_srp || !Array.isArray(json.vts_pgcit.pgci_srp)) {
        console.log('No PGCI Unit table present');
        return code;
      }
      var domainIndex = pointer; // 0 for VIDEO_TS (VMGM) ; > 0 for VTS (VTSM)
      var vtsIndex = 1;
      var chapterIndex = 1;

      code.push('PTT_TABLE[' + domainIndex + '] = {};');

      for (var i = 0; i < json.vts_pgcit.nr_of_pgci_srp; i++) {
        var pgci_srp = json.vts_pgcit.pgci_srp[i];
        var pgcIndex = i + 1;
        var pttIndex = 0;
        code.push('PTT_TABLE[' + domainIndex + '][' + vtsIndex + '] = [];');

        for (var j = 0; j < pgci_srp.pgc.nr_of_programs; j++) {
          code.push('PTT_TABLE[' + domainIndex + '][' + vtsIndex + '][' + pttIndex + '] = {domain: ' + domainIndex + ', pgc: ' + pgcIndex + ', chapter: ' + chapterIndex + '};');
          pttIndex++;
          chapterIndex++;
        }
        vtsIndex++;
      }

      return code;
    }

    // The table matches menu types to menu pgc.
    function menu_type_table(json, code) {
      if (!json.pgci_ut || !json.pgci_ut.lu || !Array.isArray(json.pgci_ut.lu)) {
        console.log('No Menu PGCI Unit table present');
        return code;
      }
      var domainIndex = pointer; // 0 for VIDEO_TS (VMGM) ; > 0 for VTS (VTSM)

      code.push('MENU_TYPES[' + domainIndex + '] = {};');

      for (var i = 0; i < json.pgci_ut.nr_of_lus; i++) {
        var lu = json.pgci_ut.lu[i];
        var lang = utils.bit2str(lu.lang_code);
        code.push('MENU_TYPES[' + domainIndex + '].' + lang + ' = [];');

        for (var j = 0; j < lu.pgcit.nr_of_pgci_srp; j++) {
          var pgci_srp = lu.pgcit.pgci_srp[j];
          var pgcIndex = j + 1;
          var menuType = pgci_srp.entry_id & 0x0F;
          var menuName = ifo_print_menu_name(menuType);
          if (menuType === 0) {
            continue;
          }
          if (pgci_srp.pgc) {
            code.push('MENU_TYPES[' + domainIndex + '].' + lang + '[' + menuType + ' /* ' + menuName + ' */] = {' +
              'domain: ' + domainIndex + ', ' +
              'lang: "' + lang + '", ' +
              'pgc: ' + pgcIndex + '};');
          }
        }
      }

      return code;

      /**
       * Function passed as reference.
       * From /src/dvdread/ifo_print_html.ts.
       * @param {number} type
       * @return {string}
       */
      function ifo_print_menu_name(type) {
        switch (type) {
          case 2:
            return 'Title';
            break;
          case 3:
            return 'Root';
            break;
          case 4:
            return 'Sub-Picture';
            break;
          case 5:
            return 'Audio';
            break;
          case 6:
            return 'Angle';
            break;
          case 7:
            return 'PTT (Chapter)';
            break;
          default:
            return 'Unknown';
            break;
        }
      }
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
        '    sprm["HL_BTNN"] = parseInt(id, 10) * 0x0400;',
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
        '',
        '  // Override the menu button logic.',
        '  dvd.onmenu = function(event) {',
        '    var menu = null;',
        '    if (MENU_TYPES[domain][lang][3 /* Root */]) {',
        '      menu = MENU_TYPES[domain][lang][3 /* Root */];',
        '    } else if (MENU_TYPES[0][lang][2 /* Title */]) {',
        '      menu = MENU_TYPES[0][lang][2 /* Title */];',
        '    }',
        '',
        '    if (menu) {',
        '      console.log(menu)',
        '      MPGCIUT[menu.domain][menu.lang][menu.pgc].run();',
        '    }',
        '  };',
        '}',
        ''
      ]);

      return code;
    }
  }
}
