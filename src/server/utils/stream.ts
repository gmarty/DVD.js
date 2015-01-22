///<reference path='../../references.ts'/>

'use strict';


/**
 * Wrapper around Node.js Buffer. The code is ported for browsers, but not used/tested.
 *
 * The client and `read...` API are not used at the moment.
 */
class Stream {
  private pos: number = 0;
  private client: boolean = false;
  private view: DataView;

  constructor(buffer: ArrayBuffer);
  constructor(buffer: Buffer);
  constructor(private buffer: any) {
    if (buffer instanceof ArrayBuffer) {
      // Node.js
      this.client = true;
      this.view = new DataView(buffer);
    }
  }

  get position() {
    return this.pos;
  }

  seek(pos) {
    this.pos = pos;
  }

  forward(offset) {
    this.pos += offset;
  }

  // The `get...` won't affect the position of the pointer.
  getUint8(addr) {
    if (this.client) {
      return this.view.getUint8(this.pos + addr);
    } else {
      return this.buffer.readUInt8(this.pos + addr);
    }
  }

  getUint16(addr) {
    if (this.client) {
      return this.view.getUint16(this.pos + addr, false);
    } else {
      return this.buffer.readUInt16BE(this.pos + addr);
    }
  }

  getUint32(addr) {
    if (this.client) {
      return this.view.getUint32(this.pos + addr, false);
    } else {
      return this.buffer.readUInt32BE(this.pos + addr);
    }
  }

  // The `read...` methods increase the pointer.
  readUint8() {
    var value: number;
    if (this.client) {
      value = this.view.getUint8(this.pos);
    } else {
      value = this.buffer.readUInt8(this.pos);
    }

    this.pos++;
    return value;
  }

  readUint16() {
    var value: number;
    if (this.client) {
      value = this.view.getUint16(this.pos, false);
    } else {
      value = this.buffer.readUInt16BE(this.pos);
    }

    this.pos += 2;
    return value;
  }

  readUint32() {
    var value: number;
    if (this.client) {
      value = this.view.getUint32(this.pos, false);
    } else {
      value = this.buffer.readUInt32BE(this.pos);
    }

    this.pos += 4;
    return value;
  }

  readBits(bits) {
    //@todo Implement a bit reader.
  }

  slice(start, end) {
    // This API is browsers and Node.js.
    return this.buffer.slice(start, end);
  }
}

export = Stream;
