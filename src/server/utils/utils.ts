'use strict';


/**
 * Given a DVD file name, returns the index following this model:
 *  * VIDEO_TS.(IFO|VOB) => 0
 *  * VTS_01_0.(IFO|VOB) => 1
 *  * VTS_02_0.(IFO|VOB) => 2
 *  * VTS_03_0.(IFO|VOB) => 3
 *
 * @param name A file name.
 * @return {number}
 */
export function getFileIndex(name: string): number {
  name = name.substr(0, 8);
  switch (name) {
    case 'VIDEO_TS':
      return 0;
      break;
    default:
      var arr = name.split('_');
      return parseInt(arr[1], 10);
  }
}
