'use strict';


import config = require('./config');

var DEBUG = config.DEBUG;

// A collection of helper functions.


/**
 * JavaScript printf/sprintf functions.
 *
 * This code is unrestricted: you are free to use it however you like.
 *
 * The functions should work as expected, performing left or right alignment,
 * truncating strings, outputting numbers with a required precision etc.
 *
 * For complex cases, these functions follow the Perl implementations of
 * (s)printf, allowing arguments to be passed out-of-order, and to set the
 * precision or length of the output based on arguments instead of fixed
 * numbers.
 *
 * See http://perldoc.perl.org/functions/sprintf.html for more information.
 *
 * Implemented:
 * - zero and space-padding
 * - right and left-alignment,
 * - base X prefix (binary, octal and hex)
 * - positive number prefix
 * - (minimum) width
 * - precision / truncation / maximum width
 * - out of order arguments
 *
 * Not implemented (yet):
 * - vector flag
 * - size (bytes, words, long-words etc.)
 *
 * Will not implement:
 * - %n or %p (no pass-by-reference in JavaScript)
 *
 * @version 2007.04.27
 * @author Ash Searle
 *
 * @param {string} str
 * @param {*=} arg1
 * @param {*=} arg2
 * @param {*=} arg3
 * @param {*=} arg4
 * @param {*=} arg5
 * @param {*=} arg6
 * @param {*=} arg7
 * @param {*=} arg8
 * @param {*=} arg9
 * @param {*=} arg10
 * @param {*=} arg11
 * @param {*=} arg12
 * @return {string}
 */
export function sprintf(str: string, arg1?: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any, arg7?: any, arg8?: any, arg9?: any, arg10?: any, arg11?: any, arg12?: any) {
  /*if (NODE || util.format) {
   // @todo Uncomment when util.format support '%x' placeholder.
   return util.format.apply(undefined, arguments)
   }*/

  var regex = /%%|%(\d+\$)?([\-+#0 ]*)(\*\d+\$|\*|\d+)?(\.(\*\d+\$|\*|\d+))?([scboxXuidfegEG])/g;

  function pad(str, len, chr, leftJustify) {
    var padding = (str.length >= len) ? '' : new Array(1 + len - str.length >>> 0).join(chr);
    return leftJustify ? str + padding : padding + str;
  }

  function justify(value, prefix, leftJustify, minWidth, zeroPad) {
    var diff = minWidth - value.length;
    if (diff > 0) {
      if (leftJustify || !zeroPad) {
        value = pad(value, minWidth, ' ', leftJustify);
      } else {
        value = value.slice(0, prefix.length) + pad('', diff, '0', true) + value.slice(prefix.length);
      }
    }
    return value;
  }

  function formatBaseX(value, base, prefix, leftJustify, minWidth, precision, zeroPad) {
    // Note: casts negative numbers to positive ones
    var number = value >>> 0;
    prefix = prefix && number && {'2': '0b', '8': '0', '16': '0x'}[base] || '';
    value = prefix + pad(number.toString(base), precision || 0, '0', false);
    return justify(value, prefix, leftJustify, minWidth, zeroPad);
  }

  function formatString(value, leftJustify, minWidth, precision, zeroPad) {
    if (precision !== null) {
      value = value.slice(0, precision);
    }
    return justify(value, '', leftJustify, minWidth, zeroPad);
  }

  var a = arguments, i = 0, format = a[i++];
  return format.replace(regex, function(substring: string, valueIndex, flags, minWidth: any, _, precision: any, type: string) {
    if (substring == '%%') return '%';

    // parse flags
    var leftJustify = false, positivePrefix = '', zeroPad = false, prefixBaseX = false;
    for (var j = 0; flags && j < flags.length; j++)
      switch (flags.charAt(j)) {
        case ' ':
          positivePrefix = ' ';
          break;
        case '+':
          positivePrefix = '+';
          break;
        case '-':
          leftJustify = true;
          break;
        case '0':
          zeroPad = true;
          break;
        case '#':
          prefixBaseX = true;
          break;
      }

    // parameters may be null, undefined, empty-string or real valued
    // we want to ignore null, undefined and empty-string values

    if (!minWidth) {
      minWidth = 0;
    } else if (minWidth == '*') {
      minWidth = +a[i++];
    } else if (minWidth.charAt(0) == '*') {
      minWidth = +a[minWidth.substring(1, minWidth.length - 1)];
    } else {
      minWidth = +minWidth;
    }

    // Note: undocumented perl feature:
    if (minWidth < 0) {
      minWidth = -minWidth;
      leftJustify = true;
    }

    if (!isFinite(minWidth)) {
      throw new Error('sprintf: (minimum-)width must be finite');
    }

    if (!precision) {
      precision = 'fFeE'.indexOf(type) > -1 ? 6 : (type == 'd') ? 0 : undefined;
    } else if (precision == '*') {
      precision = +a[i++];
    } else if (precision.charAt(0) == '*') {
      precision = +a[precision.substring(1, precision.length - 1)];
    } else {
      precision = +precision;
    }

    // grab value using valueIndex if required?
    var value = valueIndex ? a[valueIndex.slice(0, -1)] : a[i++];
    var number;
    var prefix;

    switch (type) {
      case 's':
        return formatString(String(value), leftJustify, minWidth, precision, zeroPad);
      case 'c':
        return formatString(String.fromCharCode(+value), leftJustify, minWidth, precision, zeroPad);
      case 'b':
        return formatBaseX(value, 2, prefixBaseX, leftJustify, minWidth, precision, zeroPad);
      case 'o':
        return formatBaseX(value, 8, prefixBaseX, leftJustify, minWidth, precision, zeroPad);
      case 'x':
        return formatBaseX(value, 16, prefixBaseX, leftJustify, minWidth, precision, zeroPad);
      case 'X':
        return formatBaseX(value, 16, prefixBaseX, leftJustify, minWidth, precision, zeroPad).toUpperCase();
      case 'u':
        return formatBaseX(value, 10, prefixBaseX, leftJustify, minWidth, precision, zeroPad);
      case 'i':
      case 'd':
        number = parseInt(value, 10);
        prefix = number < 0 ? '-' : positivePrefix;
        value = prefix + pad(String(Math.abs(number)), precision, '0', false);
        return justify(value, prefix, leftJustify, minWidth, zeroPad);
      case 'e':
      case 'E':
      case 'f':
      case 'F':
      case 'g':
      case 'G':
        number = +value;
        prefix = number < 0 ? '-' : positivePrefix;
        var method = ['toExponential', 'toFixed', 'toPrecision']['efg'.indexOf(type.toLowerCase())];
        var textTransform = ['toString', 'toUpperCase']['eEfFgG'.indexOf(type) % 2];
        value = prefix + Math.abs(number)[method](precision);
        return justify(value, prefix, leftJustify, minWidth, zeroPad)[textTransform]();
      default:
        return substring;
    }
  });
}


/**
 * Display a sprintf formatted string.
 *
 * @param {string} str
 * @param {*=} arg1
 * @param {*=} arg2
 * @param {*=} arg3
 * @param {*=} arg4
 * @param {*=} arg5
 * @param {*=} arg6
 * @param {*=} arg7
 * @param {*=} arg8
 * @param {*=} arg9
 * @param {*=} arg10
 * @param {*=} arg11
 * @param {*=} arg12
 */
export function printf(str: string, arg1?: any, arg2?: any, arg3?: any, arg4?: any, arg5?: number, arg6?: any, arg7?: any, arg8?: any, arg9?: any, arg10?: number, arg11?: any, arg12?: number) {
  console.log(sprintf.apply(undefined, arguments));
}


/**
 * https://github.com/substack/node-deep-equal
 * Node's assert.deepEqual() algorithm as a standalone module.
 *
 * @param {*} actual
 * @param {*} expected
 * @return {boolean}
 */
export function deepEqual(actual, expected) {
  var pSlice = Array.prototype.slice;
  var Object_keys = typeof Object.keys === 'function' ? Object.keys : function(obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
  };

  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

    // 7.3. Other pairs that do not both pass typeof value == 'object',
    // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

    // 7.4. For all other Object pairs, including Array objects, equivalence is
    // determined by having the same number of owned properties (as verified
    // with Object.prototype.hasOwnProperty.call), the same set of keys
    // (although not necessarily the same order), equivalent values for every
    // corresponding key, and an identical 'prototype' property. Note: this
    // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }

  function isUndefinedOrNull(value) {
    return value === null || value === undefined;
  }

  function isArguments(object) {
    return Object.prototype.toString.call(object) == '[object Arguments]';
  }

  function objEquiv(a, b) {
    if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
      return false;
    // an identical 'prototype' property.
    if (a.prototype !== b.prototype) return false;
    //~~~I've managed to break Object.keys through screwy arguments passing.
    //   Converting to array solves the problem.
    if (isArguments(a)) {
      if (!isArguments(b)) {
        return false;
      }
      a = pSlice.call(a);
      b = pSlice.call(b);
      return deepEqual(a, b);
    }
    try {
      var ka = Object_keys(a),
        kb = Object_keys(b),
        key, i;
    } catch (e) {//happens when one is a string literal and the other isn't
      return false;
    }
    // having the same number of owned properties (keys incorporates
    // hasOwnProperty)
    if (ka.length != kb.length)
      return false;
    //the same set of keys (although not necessarily the same order),
    ka.sort();
    kb.sort();
    //~~~cheap key test
    for (i = ka.length - 1; i >= 0; i--) {
      if (ka[i] != kb[i])
        return false;
    }
    //equivalent values for every corresponding key, and
    //~~~possibly expensive deep test
    for (i = ka.length - 1; i >= 0; i--) {
      key = ka[i];
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
}


/**
 * Get a bit representation of a string.
 *
 * @param {string} str
 * @return {number}
 */
export function str2bit(str: string): number {
  for (var bit = 0, i = 0, length = str.length; i < length; i++) {
    bit <<= 8;
    bit |= str.charCodeAt(i);
  }

  return bit;
}


/**
 * Get a string from bits.
 *
 * @param {number} bit
 * @return {string}
 */
export function bit2str(bit: number): string {
  return String.fromCharCode(bit >> 8) + String.fromCharCode(bit & 0xFF);
}


/**
 * @param {number} ptr (passed as reference).
 * @param {number} len
 */
export function hexdump(ptr: number, len: number) {
  while (len--)
    printf('%02x ', ptr++);
}


/**
 * Check if a character is alphabetic.
 * @param {string} char
 * @return {boolean}
 */
export function isalpha(char: string): boolean {
  var code = char.charCodeAt(0);
  return (code >= 0x41 && code <= 0x5A) || // A-Z
    (code >= 0x61 && code <= 0x7A);        // a-z
}


/**
 * Check if a character is printable.
 * @param {string} char
 * @return {boolean}
 */
export function isprint(char: string): boolean {
  var code = char.charCodeAt(0);
  return code >= 0x1F && code != 0x7F;
}


/**
 * Get a hex from a decimal. Pad with 0 if necessary.
 * Doesn't work for negative numbers.
 *
 * @param {number} dec A decimal integer.
 * @return {string} A hex representation of the input.
 */
export function toHex(dec: number): string {
  var hex = (dec).toString(16).toUpperCase();
  if (hex.length % 2) {
    hex = '0' + hex;
  }
  return '0x' + hex;
}


/**
 * @param {boolean} arg
 */
export function assert(arg) {
  if (DEBUG)
    console.assert(arg);
}


/**
 * @param {number} arg
 */
export function CHECK_ZERO0(arg) {
  if (DEBUG && arg != 0)
    throw (sprintf('*** Zero check failed: 0x%x', arg));
}


/**
 * @param {Array.<number>} arg
 */
export function CHECK_ZERO(arg) {
  if (!DEBUG)
    return;

  var i = 0;
  var len = arg.length;
  for (; i < len; i++)
    CHECK_ZERO0(arg[i]);
}


/**
 * @param {boolean} arg
 */
export function CHECK_VALUE(arg) {
  if (DEBUG && !arg) {
    throw (sprintf('*** Check value failed', arg));
  }
}


/**
 * @param {Function} ctor
 * @param {Function} superCtor
 */
export function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}


/**
 * Creates a new Uint8Array based on an array of ArrayBuffer.
 *
 * @param {Array.<ArrayBuffer>} buffers An array of ArrayBuffer.
 * @return {ArrayBuffer} The new ArrayBuffer created out of the two.
 */
export function concatBuffer(buffers) {
  var byteLength = buffers
    .map(function(buffer) {
      return buffer.byteLength;
    })
    .reduce(function(bufferA, bufferB) {
      return bufferA + bufferB;
    }, 0);

  var tmp = new Uint8Array(byteLength);

  var prevByteLength = 0;
  buffers.forEach(function(buffer) {
    tmp.set(new Uint8Array(buffer), prevByteLength);
    prevByteLength = buffer.byteLength;
  });

  return tmp.buffer;
}


/**
 * Dump ArrayBuffers for debug purposes.
 * @todo Pass an optional name as parameter.
 * @todo Add a space between each group of 4 bytes.
 *
 * @param {Array.<ArrayBuffer>} buffer An ArrayBuffer.
 */
export function dumpBuffer(buffer) {
  console.groupCollapsed('Buffer dump');

  var view = new DataView(buffer, 0, buffer.byteLength);
  var output = '';

  for (var i = 1; i <= buffer.byteLength; i++) {
    output += toHex(view.getUint8(i - 1)) + ' ';
    if (i % 16 === 0) {
      console.log(output.trim());
      output = '';
    }
  }

  console.groupEnd();
}
