// Generate static JavaScript code from VM instructions.

'use strict';


import VM = require('../vm');
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
function compile(vm_commands: Array): string {
  if (!vm_commands) {
    return '';
  }

  // @todo Add heuristics to determine if there is a Goto command.
  if (vm_commands.length === 1) {
    return '\n  ' + vm_commands.map(function(vm_command) {
      return compileSingleCommand(vm_command);
    });
  }

  var code = '\n' + compileMultipleCommands(vm_commands);

  // The trailing semicolons for each instruction are appended here.
  return code;
}

function compileMultipleCommands(vm_commands) {
  var code = [
    'var pc = 1;',
    'while(true) {',
    '  switch(pc++) {',
  ];

  vm_commands.forEach(function(vm_command, line) {
    code = code.concat([
        '    case ' + (line + 1) + ':',
        '      ' + compileSingleCommand(vm_command) + ';',
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
        code += compile_jump_instruction(command);
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
    code += sprintf('g[%s]', utils.toHex(reg));
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
      code += 'var temp = ' + var1 + '; ' + var1 + ' = ' + var2 + '; ' + var1 + ' = temp;';
      break;
    case 6: // /=
      code += var1 + ' = parseInt(' + var1 + ' / ' + var2 + ', 10)';
      break;
    case 8: // rnd
      code += var1 + ' = Math.round(Math.random(0xFFFF))'; // Untested!!
      break;
    default:
      code += sprintf('%s %s %s', var1, SET_OP_TABLE[op], var2);
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
    code += sprintf('g[%s]', utils.toHex(getbits(command, start - 4, 4)));
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
      code += 'console.log(\'NOP\')';
      break;
    case 1:
      // GoTo
      // Go to a specified command line.
      code += sprintf('pc = %1s', getbits(command, 7, 8));
      break;
    case 2:
      // Break
      // Exit the current command section.
      code += 'console.log(\'Break\')';
      break;
    case 3:
      // SetTmpPML
      // Set Temporary Parental Management Level.
      code += sprintf('/* SetTmpPML %1s */ pc = %2s', getbits(command, 11, 4), getbits(command, 7, 8));
      break;
    default:
      console.error('jsdvdnav: Unknown special instruction (%i)', getbits(command, 51, 4));
  }

  return code;
}

function compile_linksub_instruction(command) {
  var code = '';
  var linkop = getbits(command, 7, 8);
  var button = getbits(command, 15, 6);

  if (linkop < VM.link_table.length && VM.link_table[linkop] !== '') {
    switch (VM.link_table[linkop]) {
      case 'LinkTailPGC':
        code += sprintf('MPGCIUT[domain][lang][pgc].post()', button);
        break;
      default:
        code += sprintf('dummy/*%s (button %s)*/', VM.link_table[linkop], button);
        break;
    }
  } else {
    code += 'console.log(\'Unknown linksub instruction (' + linkop + ')\')';
    console.error('jsdvdnav: Unknown linksub instruction (%i)', linkop);
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
      code += sprintf('console.log(\'LinkPTT %s (button %s)\')',
        getbits(command, 9, 10), getbits(command, 15, 6));
      break;
    case 6:
      // LinkPGN x (button y)
      // Link to a program in the same PGC.
      code += sprintf('console.log(\'LinkPGN %s (button %s)\')',
        getbits(command, 6, 7), getbits(command, 15, 6));
      break;
    case 7:
      // LinkCN x (button y)
      // Link to a cell in the same PGC.
      code += sprintf('console.log(\'LinkCN %s (button %s)\')',
        getbits(command, 7, 8), getbits(command, 15, 6));
      break;
    default:
      console.error('jsdvdnav: Unknown link instruction');
  }

  return code;
}

function compile_jump_instruction(command) {
  var code = '';
  switch (getbits(command, 51, 4)) {
    case 1:
      // Exit
      // Terminate the playback of a video DVD.
      code += 'return console.log(\'Exit\'), 1';
      break;
    case 2:
      // JumpTT x
      // Jump to a video title.
      code += sprintf('return dvd.playByID("video-%s"), 1', getbits(command, 22, 7));
      break;
    case 3:
      // JumpVTS_TT x
      // Jump to a video title in the current VTS.
      code += sprintf('return console.log(\'JumpVTS_TT %s\'), 1', getbits(command, 22, 7));
      break;
    case 5:
      // JumpVTS_PTT x:y
      // Jump to a PTT in a specified VTS.
      code += sprintf('return dvd.playByIndex("video-%s"), dvd.playChapter(%s), 1',
        getbits(command, 22, 7), getbits(command, 41, 10));
      break;
    case 6:
      // JumpSS
      // Jump to a PGC in System Space.
      switch (getbits(command, 23, 2)) {
        case 0:
          // JumpSS FP
          code += 'return console.log(\'JumpSS FP\'), 1';
          break;
        case 1:
          // JumpSS VMGM (menu x)
          code += sprintf('return console.log(\'JumpSS VMGM (menu %s)\'), 1',
            getbits(command, 19, 4)
          );
          break;
        case 2:
          // JumpSS VTSM (vts x, title y, menu z)
          code += sprintf('setTimeout(MPGCIUT[%s][lang/* Should be `%s` */][%s].run.bind(MPGCIUT[%s][lang/* Should be `%s` */][%s])); return 1',
            getbits(command, 30, 7),
            getbits(command, 38, 7),
            getbits(command, 19, 4),
            getbits(command, 30, 7),
            getbits(command, 38, 7),
            getbits(command, 19, 4)
          );
          break;
        case 3:
          // JumpSS VMGM (pgc x)
          code += sprintf('setTimeout(MPGCIUT[0][lang][%s].run.bind(MPGCIUT[0][lang][%s])); return 1',
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
          code += sprintf('return console.log(\'CallSS FP (rsm_cell %s)\'), 1', getbits(command, 31, 8));
          break;
        case 1:
          // CallSS VMGM (menu x, rsm_cell y)
          code += sprintf('return console.log(\'CallSS VMGM (menu %s, rsm_cell %s)\'), 1', getbits(command, 19, 4), getbits(command, 31, 8));
          break;
        case 2:
          // CallSS VTSM (menu x, rsm_cell y)
          code += sprintf('return console.log(\'CallSS VTSM (menu %s, rsm_cell %s)\'), 1', getbits(command, 19, 4), getbits(command, 31, 8));
          break;
        case 3:
          // CallSS VMGM (pgc x, rsm_cell y)
          code += sprintf('return console.log(\'CallSS VMGM (pgc %s, rsm_cell %s)\'), 1', getbits(command, 46, 15), getbits(command, 31, 8));
          break;
      }
      break;
    default:
      console.error('jsdvdnav: Unknown Jump/Call instruction');
  }

  //code += ', return 1'; // Jump commands return 1.

  return code;
}

function compile_system_set(command) {
  var code = '';
  var i = 0;
  // FIXME: What about SPRM11 ? Karaoke
  // Surely there must be some system set command for that?

  switch (getbits(command, 59, 4)) {
    case 1: // Set system reg 1 &| 2 &| 3 (Audio, Subp. Angle)
      for (i = 1; i <= 3; i++) {
        if (getbits(command, 47 - (i * 8), 1)) {
          code += compile_system_reg(i);
          code += ' = ';
          code += compile_reg_or_data_2(command, !!getbits(command, 60, 1), 47 - (i * 8));
          code += '; '
        }
      }
      code = code.substring(0, code.length - 2); // Removing the semicolon.
      break;
    case 2: // Set system reg 9 & 10 (Navigation timer, Title PGC number)
      code += compile_system_reg(9);
      code += ' = ';
      code += compile_reg_or_data(command, !!getbits(command, 60, 1), 47);
      code += ' ';
      code += compile_system_reg(10);
      code += sprintf(' = %s', getbits(command, 30, 15));
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
      break;
    case 6: // Set system reg 8 (Highlighted button)
      code += compile_system_reg(8);
      if (getbits(command, 60, 1)) { // immediate
        code += sprintf(' = dummy/*%s (button no %d)*/', utils.toHex(getbits(command, 31, 16)), getbits(command, 31, 6));
      } else {
        code += sprintf(' = g[%s]', utils.toHex(getbits(command, 19, 4)));
      }
      break;
    default:
      console.error('jsdvdnav: Unknown system set instruction (%i)', getbits(command, 59, 4));
  }

  return code;
}

function compile_set_version_1(command) {
  var code = '';
  var set_op = getbits(command, 59, 4);

  if (set_op) {
    code += compile_set_op(
      compile_g_reg(getbits(command, 35, 4)),
      compile_reg_or_data(command, !!getbits(command, 60, 1), 31),
      set_op
    );
  } else {
    code += 'console.log(\'NOP\')';
  }

  return code;
}

function compile_set_version_2(command) {
  var code = '';
  var set_op = getbits(command, 59, 4);

  if (set_op) {
    code += compile_set_op(
      compile_g_reg(getbits(command, 51, 4)),
      compile_reg_or_data(command, !!getbits(command, 60, 1), 47),
      set_op
    );
  } else {
    code += 'console.log(\'NOP\')';
  }

  return code;
}

function compile_set_version_3(command) {
  var code = '';
  var set_op = getbits(command, 59, 4);

  if (set_op) {
    code += compile_set_op(
      compile_g_reg(getbits(command, 51, 4)),
      compile_reg_or_data_3(command, !!getbits(command, 60, 1), 47),
      set_op
    );
  } else {
    code += 'console.log(\'NOP\')';
  }

  return code;
}
