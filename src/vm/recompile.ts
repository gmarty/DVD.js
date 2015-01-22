// Generate static JavaScript code from VM instructions.

'use strict';


var VM = require('../vm');
import utils = require('../utils');

var sprintf = utils.sprintf;

/**
 * Overridden here to use JavaScript === and !== comparators.
 * @const
 */
var CMP_OP_TABLE = [
  '', '&', '===', '!==', '>=', '>', '<=', '<'
];

/**
 * @const
 */
var SET_OP_TABLE = [
  '', '=', '<->', '+=', '-=', '*=', '/=', '%=', 'rnd', '&=', '|=', '^='
];

export = compile;

/**
 * Compile a set of VM commands to JavaScript code.
 * @todo Changing language is not allowed for the moment (See `lang` usage below).
 *
 * @param {Array} vm_commands
 * @returns {string}
 */
function compile(vm_commands: Array<number>): string {
  if (!vm_commands) {
    return '';
  }

  if (hasGoTo(vm_commands)) {
    return '\n' + compileCommandsWithGoTo(vm_commands) + '\n';
  }

  return vm_commands
    .map(function(vm_command) {
      return '\n  ' + compileSingleCommand(vm_command);
    })
    .join('') + '\n';
}

function compileCommandsWithGoTo(vm_commands) {
  var code = [
    'var pc = 1;',
    'while(true) {',
    '  switch(pc++) {',
  ];

  vm_commands.forEach(function(vm_command, line) {
    code = code.concat([
        '    case ' + (line + 1) + ':',
        '      ' + compileSingleCommand(vm_command) + '',
      '      break;',
    ]);
  });

  code = code.concat([
    '    default:',
    '      return;',
    '  }',
    '}',
  ]);

  return code.join('\n');
}

/**
 * Determine whether the set of commands has a GoTo command.
 *
 * @param {Array} vm_commands
 * @returns {boolean}
 */
function hasGoTo(vm_commands) {
  return vm_commands.some(function(vm_command) {
    var command = vm_command.bytes.map(function(byte: number): string {
      return sprintf('%08i', (byte).toString(2));
    }).join('');

    return getbits(command, 63, 3) === 0 && getbits(command, 51, 4) === 1;
  });
}

function compileSingleCommand(vm_command) {
  var command = vm_command.bytes.map(function(byte: number): string {
    return sprintf('%08i', (byte).toString(2));
  }).join('');

  var code = '';

  // Sample:
  //  { bytes: [ 48, 2, 0, 0, 0, 1, 0, 0 ] }
  //  001 1 00000000 0010 0000000000000000000000000 0000001 0000000000000000
  //    1 1        0    2                         0       1                0
  //  --- - -------- ---- ------------------------- ------- ----------------
  //  JumpTT 1

  //  011 1 00010000 0000000000000000000000000000000000000000000000000000

  switch (getbits(command, 63, 3)) {
    case 0: // Special instructions
      code += compile_if_version_1(command);
      code += '{ ';
      code += compile_special_instruction(command);
      code += ' }';
      break;
    case 1: // Jump/Call or Link instructions
      if (getbits(command, 60, 1)) {
        code += compile_if_version_2(command);
        code += '{ ';
        code += compile_jump_instruction(command);
        code += ' }';
      } else {
        code += compile_if_version_1(command);
        code += '{ ';
        code += compile_link_instruction(command, false);
        code += ' }';
      }
      break;
    case 2: // Set System Parameters instructions
      code += compile_if_version_2(command);
      code += '{ ';
      code += compile_system_set(command);
      code += compile_link_instruction(command, true);
      code += ' }';
      break;
    case 3: // Set General Parameters instructions
      code += compile_if_version_3(command);
      code += '{ ';
      code += compile_set_version_1(command);
      code += compile_link_instruction(command, true);
      code += ' }';
      break;
    case 4: // Set, Compare -> LinkSub instructions
      code += compile_set_version_2(command);
      code += ', ';
      code += compile_if_version_4(command);
      code += '{ ';
      code += compile_linksub_instruction(command);
      code += ' }';
      break;
    case 5: // Compare -> (Set and LinkSub) instructions
      code += compile_if_version_5(command);
      code += '{ ';
      code += compile_set_version_3(command);
      code += ', ';
      code += compile_linksub_instruction(command);
      code += ' }';
      break;
    case 6: // Compare -> Set, always LinkSub instructions
      code += compile_if_version_5(command);
      code += '{ ';
      code += compile_set_version_3(command);
      code += ' } ';
      code += compile_linksub_instruction(command);
      break;
    default:
      console.error('Unknown command type (%i)', getbits(command, 63, 3));
  }

  return code;
}

/**
 * Extracts some bits from the command.
 *
 * @param {string} instruction
 * @param {number} start
 * @param {number} count
 * @return {number}
 */
function getbits(instruction: string, start: number, count: number): number {
  if (count === 0) {
    return 0;
  }

  if (start - count < -1 || count < 0 || start < 0 || count > 32 || start > 63) {
    console.error('Bad call to getbits(). Parameter out of range.');
    return 0;
  }

  return Number(parseInt(instruction.substr(63 - start, count), 2).toString(10));
}

function compile_system_reg(reg) {
  var code = '';
  if (reg < VM.system_reg_abbr_table.length && VM.system_reg_table[reg] !== '') {
    code += sprintf('sprm["%s"] /*%s (SRPM:%d)*/',
      VM.system_reg_abbr_table[reg], VM.system_reg_table[reg], reg);
  } else {
    console.error('jsdvdnav: Unknown system register (reg=%d)', reg);
  }

  return code;
}

function compile_g_reg(reg) {
  var code = '';
  if (reg < 0x10) {
    code += sprintf('gprm[%s]', utils.toHex(reg));
  } else {
    console.error('jsdvdnav: Unknown general register');
  }

  return code;
}

function compile_reg(reg) {
  var code = '';
  if (reg & 0x80) {
    code += compile_system_reg(reg & 0x7F);
  } else {
    code += compile_g_reg(reg & 0x7F);
  }

  return code;
}

function compile_cmp_op(op) {
  var code = '';
  if (op < CMP_OP_TABLE.length && CMP_OP_TABLE[op] !== '') {
    code += sprintf(' %s ', CMP_OP_TABLE[op]);
  } else {
    console.error('jsdvdnav: Unknown compare op');
  }

  return code;
}

function compile_set_op(var1, var2, op) {
  var code = '';

  if (op >= SET_OP_TABLE.length || SET_OP_TABLE[op] === '') {
    console.error('jsdvdnav: Unknown set op');
    return;
  }

  switch (op) {
    case 2: // <->
      code += 'var temp = ' + var1 + ';' +
        ' ' + var1 + ' = ' + var2 + ';' +
        ' ' + var1 + ' = temp;';
      break;
    case 6: // /=
      code += var1 + ' = parseInt(' + var1 + ' / ' + var2 + ', 10);';
      break;
    case 8: // rnd
      code += var1 + ' = Math.round(Math.random(0xFFFF));'; // Untested!!
      break;
    default:
      code += sprintf('%s %s %s;', var1, SET_OP_TABLE[op], var2);
      break;
  }

  return code;
}

function compile_reg_or_data(command, immediate: boolean, start) {
  var code = '';
  if (immediate) {
    var i = getbits(command, start, 16);

    code += sprintf('%s', utils.toHex(i));
    if (utils.isprint(i & 0xFF) && utils.isprint((i >> 8) & 0xFF)) {
      code += sprintf(' ("%s")', utils.bit2str(i));
    }
  } else {
    code += compile_reg(getbits(command, start - 8, 8));
  }

  return code;
}

function compile_reg_or_data_2(command, immediate: boolean, start) {
  var code = '';
  if (immediate) {
    code += sprintf('%s', utils.toHex(getbits(command, start - 1, 7)));
  } else {
    code += sprintf('gprm[%s]', utils.toHex(getbits(command, start - 4, 4)));
  }

  return code;
}

function compile_reg_or_data_3(command, immediate: boolean, start) {
  var code = '';
  if (immediate) {
    var i = getbits(command, start, 16);

    code += sprintf('%s', utils.toHex(i));
    if (utils.isprint(i & 0xFF) && utils.isprint((i >> 8) & 0xFF)) {
      code += sprintf(' ("%s")', utils.bit2str(i));
    }
  } else {
    code += compile_reg(getbits(command, start, 8));
  }

  return code;
}

function compile_if_version_1(command) {
  var code = '';
  var op = getbits(command, 54, 3);

  if (op) {
    code += 'if (';
    code += compile_g_reg(getbits(command, 39, 8));
    code += compile_cmp_op(op);
    code += compile_reg_or_data(command, !!getbits(command, 55, 1), 31);
    code += ') ';
  }

  return code;
}

function compile_if_version_2(command) {
  var code = '';
  var op = getbits(command, 54, 3);

  if (op) {
    code += 'if (';
    code += compile_reg(getbits(command, 15, 8));
    code += compile_cmp_op(op);
    code += compile_reg(getbits(command, 7, 8));
    code += ') ';
  }

  return code;
}

function compile_if_version_3(command) {
  var code = '';
  var op = getbits(command, 54, 3);

  if (op) {
    code += 'if (';
    code += compile_g_reg(getbits(command, 43, 4));
    code += compile_cmp_op(op);
    code += compile_reg_or_data(command, !!getbits(command, 55, 1), 15);
    code += ') ';
  }

  return code;
}

function compile_if_version_4(command) {
  var code = '';
  var op = getbits(command, 54, 3);

  if (op) {
    code += 'if (';
    code += compile_g_reg(getbits(command, 51, 4));
    code += compile_cmp_op(op);
    code += compile_reg_or_data(command, !!getbits(command, 55, 1), 31);
    code += ') ';
  }

  return code;
}

function compile_if_version_5(command) {
  var code = '';
  var op = getbits(command, 54, 3);
  var set_immediate = getbits(command, 60, 1);

  if (op) {
    if (set_immediate) {
      code += 'if (';
      code += compile_g_reg(getbits(command, 31, 8));
      code += compile_cmp_op(op);
      code += compile_reg(getbits(command, 23, 8));
      code += ') ';
    } else {
      code += 'if (';
      code += compile_g_reg(getbits(command, 39, 8));
      code += compile_cmp_op(op);
      code += compile_reg_or_data(command, !!getbits(command, 55, 1), 31);
      code += ') ';
    }
  }

  return code;
}

function compile_special_instruction(command) {
  var code = '';
  var op = getbits(command, 51, 4);

  switch (op) {
    case 0:
      // Nop
      // No operation.
      code += 'console.log(\'NOP\');';
      break;
    case 1:
      // GoTo
      // Go to a specified command line.
      code += sprintf('pc = %1s;', getbits(command, 7, 8));
      break;
    case 2:
      // Break
      // Exit the current command section.
      code += 'return;';
      break;
    case 3:
      // SetTmpPML
      // Set Temporary Parental Management Level.
      code += sprintf('console.log(\'SetTmpPML %1s = %2s\');',
        getbits(command, 11, 4),
        getbits(command, 7, 8)
      );
      break;
    default:
      code += 'console.log(\'Unknown special instruction (' + op + ')\');';
      console.error('jsdvdnav: Unknown special instruction (%i)', op);
  }

  return code;
}

function compile_linksub_instruction(command) {
  var code = '';
  var op = getbits(command, 7, 8);

  if (op < VM.link_table.length && VM.link_table[op] !== '') {
    switch (op) {
      case 1:
        // LinkTopC
        // Link to current cell in the same PGC.
        // We should have an infinite loop while we wait for a user interaction.
        // For now, we just return 1 to avoid the post command to be executed.
        code += sprintf('return 1;');
        break;
      case 13:
        // LinkTailPGC
        // Link to post-command section of current PGC.
        code += sprintf('MPGCIUT[domain][lang][pgc].post();');
        break;
      default:
        code += sprintf('console.log(\'%s (button %d)\');',
          VM.link_table[op],
          getbits(command, 15, 6)
        );
        break;
    }
  } else {
    code += 'console.log(\'Unknown linksub instruction (' + op + ')\');';
    console.error('jsdvdnav: Unknown linksub instruction (%i)', op);
  }

  return code;
}

function compile_link_instruction(command, optional: boolean) {
  var code = '';
  var op = getbits(command, 51, 4);

  if (optional && op)
    code += '; ';

  switch (op) {
    case 0:
      if (!optional)
        console.error('jsdvdnav: NOP (link)!');
      break;
    case 1:
      code += compile_linksub_instruction(command);
      break;
    case 4:
      // LinkPGCN x
      // Link to a PGC in the same domain.
      code += sprintf('setTimeout(MPGCIUT[domain][lang][%i].run.bind(MPGCIUT[domain][lang][%i])); return 1;',
        getbits(command, 14, 15),
        getbits(command, 14, 15),
        getbits(command, 14, 15)
      );
      break;
    case 5:
      // LinkPTT x (button y)
      // Link to a PTT in the current VTS.
      code += sprintf('console.log(\'LinkPTT %s (button %d)\');',
        getbits(command, 9, 10),
        getbits(command, 15, 6)
      );
      break;
    case 6:
      // LinkPGN x (button y)
      // Link to a program in the same PGC.
      code += sprintf('console.log(\'LinkPGN %s (button %d)\');',
        getbits(command, 6, 7),
        getbits(command, 15, 6)
      );
      break;
    case 7:
      // LinkCN x (button y)
      // Link to a cell in the same PGC.
      code += sprintf('console.log(\'LinkCN %s (button %d)\');',
        getbits(command, 7, 8),
        getbits(command, 15, 6)
      );
      break;
    default:
      code += 'console.log(\'Unknown link instruction (' + op + ')\');';
      console.error('jsdvdnav: Unknown link instruction (%i)', op);
  }

  return code;
}

function compile_jump_instruction(command) {
  var code = '';
  var op = getbits(command, 51, 4);

  switch (op) {
    case 1:
      // Exit
      // Terminate the playback of a video DVD.
      code += 'console.log(\'Exit\'); return 1;';
      break;
    case 2:
      // JumpTT x
      // Jump to a video title.
      // @todo We need to set the video current time here.
      code += sprintf('var vtt = VTT_TABLE[%s]; PGCIUT[vtt.domain][vtt.pgc].run(); return 1;',
        getbits(command, 22, 7)
      );
      break;
    case 3:
      // JumpVTS_TT x
      // Jump to a video title in the current VTS.
      code += sprintf('var vtt = PTT_TABLE[domain][%s][0]; PGCIUT[vtt.domain][vtt.pgc].run(); dvd.playChapter(vtt.chapter); return 1;',
        getbits(command, 22, 7)
      );
      break;
    case 5:
      // JumpVTS_PTT x:y
      // Jump to a PTT in a specified VTS.
      // @todo Use a table here
      //code += sprintf('console.log(\'JumpVTS_PTT %s:%s\'); return 1;',
      code += sprintf('var ptt = PTT_TABLE[domain][%s][%s]; PGCIUT[ptt.domain][ptt.pgc].run(); dvd.playChapter(ptt.chapter); return 1;',
        getbits(command, 22, 7),
          getbits(command, 41, 10) - 1
      );
      break;
    case 6:
      // JumpSS
      // Jump to a PGC in System Space.
      switch (getbits(command, 23, 2)) {
        case 0:
          // JumpSS FP
          code += 'console.log(\'JumpSS FP\'); return 1;';
          break;
        case 1:
          // JumpSS VMGM (menu x)
          // x is the type of menu (Root, Title...)
          code += sprintf('var menu = MENU_TYPES[0][lang][%s]; setTimeout(MPGCIUT[menu.domain][menu.lang][menu.pgc].run.bind(MPGCIUT[menu.domain][menu.lang][menu.pgc])); return 1;',
            getbits(command, 19, 4)
          );
          break;
        case 2:
          // JumpSS VTSM (vts x, title y, menu z)
          code += sprintf('var menu = MENU_TYPES[%s][lang/* Should be %s */][%s]; setTimeout(MPGCIUT[menu.domain][menu.lang][menu.pgc].run.bind(MPGCIUT[menu.domain][menu.lang][menu.pgc])); return 1;',
            getbits(command, 30, 7),
            getbits(command, 38, 7),
            getbits(command, 19, 4)
          );
          break;
        case 3:
          // JumpSS VMGM (pgc x)
          // pgc is entry pgc
          code += sprintf('setTimeout(MPGCIUT[0][lang][%s].run.bind(MPGCIUT[0][lang][%s])); return 1;',
            getbits(command, 46, 15),
            getbits(command, 46, 15)
          );
          break;
      }
      break;
    case 8:
      // CallSS
      // Jump to a PGC in System Space from VTS domain.
      switch (getbits(command, 23, 2)) {
        case 0:
          // CallSS FP (rsm_cell x)
          code += sprintf('console.log(\'CallSS FP (rsm_cell %s)\'); return 1;',
            getbits(command, 31, 8)
          );
          break;
        case 1:
          // CallSS VMGM (menu x, rsm_cell y)
          // x is the type of menu (Root, Title...)
          code += sprintf('console.log(\'CallSS VMGM (menu %s, rsm_cell %s)\'); return 1;',
            getbits(command, 19, 4), getbits(command, 31, 8));
          break;
        case 2:
          // CallSS VTSM (menu x, rsm_cell y)
          code += sprintf('console.log(\'CallSS VTSM (menu %s, rsm_cell %s)\'); return 1;',
            getbits(command, 19, 4),
            getbits(command, 31, 8)
          );
          break;
        case 3:
          // CallSS VMGM (pgc x, rsm_cell y)
          // @todo What to do with the value of rsm_cell?
          code += sprintf('setTimeout(MPGCIUT[0][lang][%s].run.bind(MPGCIUT[0][lang][%s])) /* rsm_cell %s*/; return 1;',
            getbits(command, 46, 15),
            getbits(command, 46, 15),
            getbits(command, 31, 8)
          );
          break;
      }
      break;
    default:
      code += 'console.log(\'Unknown Jump/Call instruction (' + op + ')\');';
      console.error('jsdvdnav: Unknown Jump/Call instruction (%i)', op);
  }

  return code;
}

function compile_system_set(command) {
  var code = '';
  var op = getbits(command, 59, 4);
  var i = 0;
  // FIXME: What about SPRM11 ? Karaoke
  // Surely there must be some system set command for that?

  switch (op) {
    case 1: // Set system reg 1 &| 2 &| 3 (Audio, Subp. Angle)
      for (i = 1; i <= 3; i++) {
        if (getbits(command, 47 - (i * 8), 1)) {
          code += compile_system_reg(i);
          code += ' = ';
          code += compile_reg_or_data_2(command, !!getbits(command, 60, 1), 47 - (i * 8));
          code += ';';
        }
      }
      break;
    case 2: // Set system reg 9 & 10 (Navigation timer, Title PGC number)
      code += compile_system_reg(9);
      code += ' = ';
      code += compile_reg_or_data(command, !!getbits(command, 60, 1), 47);
      code += ' ';
      code += compile_system_reg(10);
      code += sprintf(' = %s', getbits(command, 30, 15));
      code += ';';
      // ??
      break;
    case 3: // Mode: Counter / Register + Set
      code += 'SetMode ';
      if (getbits(command, 23, 1)) {
        code += 'Counter ';
      } else {
        code += 'Register ';
      }
      // '='
      code += compile_set_op(
        compile_g_reg(getbits(command, 19, 4)),
        compile_reg_or_data(command, !!getbits(command, 60, 1), 47),
        0x01
      );
      code += ';';
      break;
    case 6: // Set system reg 8 (Highlighted button)
      code += compile_system_reg(8);
      if (getbits(command, 60, 1)) { // immediate
        code += sprintf(' = %s /* (button %d) */', utils.toHex(getbits(command, 31, 16)), getbits(command, 31, 6));
      } else {
        code += sprintf(' = gprm[%s]', utils.toHex(getbits(command, 19, 4)));
      }
      code += ';';
      break;
    default:
      code += 'console.log(\'Unknown system set instruction (' + op + ')\');';
      console.error('jsdvdnav: Unknown system set instruction (%i)', op);
  }

  return code;
}

function compile_set_version_1(command) {
  var code = '';
  var op = getbits(command, 59, 4);

  if (op) {
    code += compile_set_op(
      compile_g_reg(getbits(command, 35, 4)),
      compile_reg_or_data(command, !!getbits(command, 60, 1), 31),
      op
    );
  } else {
    code += 'console.log(\'NOP\');';
  }

  return code;
}

function compile_set_version_2(command) {
  var code = '';
  var op = getbits(command, 59, 4);

  if (op) {
    code += compile_set_op(
      compile_g_reg(getbits(command, 51, 4)),
      compile_reg_or_data(command, !!getbits(command, 60, 1), 47),
      op
    );
  } else {
    code += 'console.log(\'NOP\');';
  }

  return code;
}

function compile_set_version_3(command) {
  var code = '';
  var op = getbits(command, 59, 4);

  if (op) {
    code += compile_set_op(
      compile_g_reg(getbits(command, 51, 4)),
      compile_reg_or_data_3(command, !!getbits(command, 60, 1), 47),
      op
    );
  } else {
    code += 'console.log(\'NOP\');';
  }

  return code;
}
