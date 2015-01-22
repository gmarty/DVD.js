// Decode packet function.

'use strict';


import utils = require('../../utils');
import Stream = require('./stream');

var toHex = utils.toHex;

/**
 * Returns 1 if block contains NAV packet, 0 otherwise.
 * Processes said NAV packet if present.
 *
 * Most of the code in here is copied from xine's MPEG demuxer
 * so any bugs which are found in that should be corrected here also.
 *
 * @param {Stream} p
 * @return {Object}
 */
function decodePacket(p: Stream) {
  //console.log('p.position', toHex(p.position));

  var packets = {
    pci: null,
    dsi: null
  };
  var packetLength = 0;

  var streamID = p.getUint8(0x03);
  if (streamID === 0xBA) { // Program stream pack header
    var isMpeg1 = (p.getUint8(0x04) & 0x40) === 0;
    if (isMpeg1) {
      p.forward(0x0C);
    } else { // mpeg2
      packetLength = p.getUint8(0x0D) & 0x07;
      p.forward(0x0E + packetLength);
    }
  }

  streamID = p.getUint8(0x03);
  if (streamID === 0xBB) { // Program stream system header
    packetLength = p.getUint16(0x04);
    p.forward(0x06 + packetLength);
  }

  // We should now have a PES packet here.
  if (p.getUint8(0x00) !== 0x00 || p.getUint8(0x01) !== 0x00 || (p.getUint8(0x02) !== 0x01)) {
    console.error('jsdvdnav: demux error at %s! %s %s %s (should be 0x00 0x00 0x01)',
      toHex(p.position), toHex(p.getUint8(0x00)), toHex(p.getUint8(0x01)), toHex(p.getUint8(0x02)));
    return packets;
  }

  streamID = p.getUint8(0x03);
  if (streamID === 0xBF) { // Private stream 2
    // PCI
    packetLength = p.getUint16(0x04);
    p.forward(0x06);

    if (p.getUint8(0x00) === 0x00) {
      //console.log('PCI: %s -> %s', toHex(p.position + 1), toHex(p.position + 1 + packetLength));
      packets.pci = p.slice(p.position + 1, p.position + 1 + packetLength);
    }

    p.forward(packetLength);

    // DSI
    packetLength = p.getUint16(0x04);
    p.forward(0x06);

    if (p.getUint8(0x00) === 0x01) {
      //console.log('DSI: %s -> %s', toHex(p.position + 1), toHex(p.position + 1 + packetLength));
      packets.dsi = p.slice(p.position + 1, p.position + 1 + packetLength);
    }
  }

  return packets;
}

export = decodePacket;
