'use strict';


import path = require('path');

var config = require('../../../config/app.json');

/**
 * Given a DVD file name, returns the index following this model:
 *  * VIDEO_TS.(IFO|VOB) => 0
 *  * VTS_01_0.(IFO|VOB) => 1
 *  * VTS_02_0.(IFO|VOB) => 2
 *  * VTS_03_0.(IFO|VOB) => 3
 *
 * @param {string} name A file name.
 * @return {number}
 */
export function getFileIndex(name: string): number {
  return getFilePortion(name, 1);
}

/**
 * Given a DVD file name, returns the suffix following this model:
 *  * VIDEO_TS.(IFO|VOB) => 0
 *  * VTS_01_0.(IFO|VOB) => 0 (= menu)
 *  * VTS_01_1.(IFO|VOB) => 1
 *  * VTS_01_2.(IFO|VOB) => 2
 *
 * @param {string} name A file name.
 * @return {number}
 */
export function getFileSuffix(name: string): number {
  return getFilePortion(name, 2);
}

/**
 * Break a filename on `_` and return the index coerced to number.
 *
 * @param {string} name A file name.
 * @param {number} index The index of the portion to return.
 * @returns {number}
 */
function getFilePortion(name: string, index: number): number {
  name = path.basename(name); // Keep file name only.
  name = name.substr(0, 8);
  switch (name) {
    case 'VIDEO_TS':
      return 0;
      break;
    default:
      var arr = name.split('_');
      return parseInt(arr[index], 10);
  }
}

/**
 * Return the path to the web folder given a DVD disc name and a config object:
 *  * /home/user/path/to/disc/DSTD06151 => /home/user/dvd/web/DSTD06151
 *
 * @param {string} dvdPath
 */
export function getWebPath(dvdPath: string): string {
  var dvdFolderName = dvdPath.split(path.sep).pop();
  return path.join(config.webFolder, dvdFolderName);
}

/**
 * Convert a VOB file path to the web format through the following operations:
 *  * Prepend the web folder to the disc and VOB file name.
 *  * Replace the `.VOB` extension by `.webm`.
 *
 * @param {string} dvdPath
 * @return {string} A formatted title.
 */
export function convertVobPath(dvdPath: string): string {
  var fileName = dvdPath.split(path.sep).pop().replace(/\.VOB$/i, '.webm');
  // Extract DVD folder name: /path/to/DVDNAME/VIDEO_TS/VIDEO_TS.VOB => DVDNAME
  var dvdFolderName = dvdPath.split(path.sep).reverse()[2];

  return path.join(config.webFolder, dvdFolderName, fileName);
}
