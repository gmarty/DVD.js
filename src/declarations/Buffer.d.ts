declare var Buffer: {
  new (str: string, encoding?: string): NodeBuffer;
  new (size: number): NodeBuffer;
  new (array: any[]): NodeBuffer;
  prototype: NodeBuffer;
  isBuffer(obj: any): boolean;
  byteLength(string: string, encoding?: string): number;
  concat(list: NodeBuffer[], totalLength?: number): NodeBuffer;
};

// Buffer class
interface NodeBuffer {
  [index: number]: number;
  write(string: string, offset?: number, length?: number, encoding?: string): number;
  toString(encoding?: string, start?: number, end?: number): string;
  length: number;
  copy(targetBuffer: NodeBuffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): void;
  slice(start?: number, end?: number): NodeBuffer;
  readUInt8(offset: number, noAsset?: boolean): number;
  readUInt16LE(offset: number, noAssert?: boolean): number;
  readUInt16BE(offset: number, noAssert?: boolean): number;
  readUInt32LE(offset: number, noAssert?: boolean): number;
  readUInt32BE(offset: number, noAssert?: boolean): number;
  readInt8(offset: number, noAssert?: boolean): number;
  readInt16LE(offset: number, noAssert?: boolean): number;
  readInt16BE(offset: number, noAssert?: boolean): number;
  readInt32LE(offset: number, noAssert?: boolean): number;
  readInt32BE(offset: number, noAssert?: boolean): number;
  readFloatLE(offset: number, noAssert?: boolean): number;
  readFloatBE(offset: number, noAssert?: boolean): number;
  readDoubleLE(offset: number, noAssert?: boolean): number;
  readDoubleBE(offset: number, noAssert?: boolean): number;
  writeUInt8(value: number, offset: number, noAssert?: boolean): void;
  writeUInt16LE(value: number, offset: number, noAssert?: boolean): void;
  writeUInt16BE(value: number, offset: number, noAssert?: boolean): void;
  writeUInt32LE(value: number, offset: number, noAssert?: boolean): void;
  writeUInt32BE(value: number, offset: number, noAssert?: boolean): void;
  writeInt8(value: number, offset: number, noAssert?: boolean): void;
  writeInt16LE(value: number, offset: number, noAssert?: boolean): void;
  writeInt16BE(value: number, offset: number, noAssert?: boolean): void;
  writeInt32LE(value: number, offset: number, noAssert?: boolean): void;
  writeInt32BE(value: number, offset: number, noAssert?: boolean): void;
  writeFloatLE(value: number, offset: number, noAssert?: boolean): void;
  writeFloatBE(value: number, offset: number, noAssert?: boolean): void;
  writeDoubleLE(value: number, offset: number, noAssert?: boolean): void;
  writeDoubleBE(value: number, offset: number, noAssert?: boolean): void;
  fill(value: any, offset?: number, end?: number): void;
  INSPECT_MAX_BYTES: number;
}
