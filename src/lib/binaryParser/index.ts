/**
 * Original code by Vjeux (Christopher Chedeau) on http://blog.vjeux.com/2011/javascript/binaryparser-unleash-javascript-power.html
 * Edited by g_marty to add back references and bitfields parsing.
 *
 * Back references implementation is very naive and unstable, it looks for the value in a flat representation of the output.
 * Keys might be overriden if the same key is located in a different level in the object (e.g. {key: {key: value}}).
 * I highly discourage using it!
 *
 * Bitfields parser looks OK to me, but is not optimized.
 */

'use strict';


export = BinaryParser;

/**
 * @constructor
 * @param {Object} binaryReader
 * @param {string|Object=} description
 * @param {Object=} caller
 */
var BinaryParser = function(binaryReader, description, caller) {
  this.binaryReader = binaryReader;

  this.description = BinaryParser.stdDescription;
  for (var i in description) {
    this.description[i] = description[i];
  }

  this.caller = caller;

  var that = this;
  this.param = {
    parse: function(desc, param) {return that.parse(desc, param);},
    binaryReader: binaryReader,

    // Back reference implementation.
    output: {},

    // Bitfield parser.
    bits: null,
    counter: null
  };
};

BinaryParser.stdDescription = {
  'uint8': function(config) {return config.binaryReader.getUint8();},
  'int8': function(config) {return config.binaryReader.getInt8();},
  'uint16': function(config) {return config.binaryReader.getUint16();},
  'int16': function(config) {return config.binaryReader.getInt16();},
  'uint32': function(config) {return config.binaryReader.getUint32();},
  'int32': function(config) {return config.binaryReader.getInt32();},
  'uint64': function(config) {return config.binaryReader.getUint64();},
  'float': function(config) {return config.binaryReader.getFloat32();},
  'char': function(config) {return config.binaryReader.getChar();},
  'string': function(config, size) {return config.binaryReader.getString(size);},
  'array': function(config, type, number) {
    var num_type = typeof number;
    var k = (num_type === 'number') ? number
        : (num_type === 'function') ? number(config)
        : 0;
    var array = [];
    var i = 0;

    if (k === 0) {
      // \@todo Should we return an empty array here?
      return null;
    }

    for (; i < k; ++i) {
      array[i] = config.parse(type);
    }
    return array;
  },
  'bits': function(config, number) {
    var output = 0;
    var i = 0;

    for (; i < number; i++) {
      // Read 8 more bits from the buffer, if needed.
      if (config.counter < 0x0 || config.bits === null) {
        config.bits = config.parse('uint8');
        config.counter = 0x7;
      }

      // Compute the bit value.
      output = (output << 1) + (config.bits & (1 << config.counter) ? 1 : 0);
      config.counter--;
    }

    return output;
  }
};


/**
 * @param {*} description
 * @param {Array=} param
 * @return {*}
 */
BinaryParser.prototype.parse = function(description, param) {
  var type = typeof description;

  if (type === 'function') {
    return description.apply(this.caller, [this.param].concat(param));
  }

  // Shortcut: 'string' == ['string']
  if (type === 'string') {
    description = [description];
  }

  if (description instanceof Array) {
    return this.parse(this.description[description[0]], description.slice(1));
  }

  if (type === 'object') {
    var output = {},
        value,
        key;

    for (key in description) {
      if (!description.hasOwnProperty(key)) {
        continue;
      }
      value = this.parse(description[key]);
      output[key] = value;
      this.param.output[key] = value;
    }

    return output;
  }

  throw new Error('Unknown description type ' + description);
};
