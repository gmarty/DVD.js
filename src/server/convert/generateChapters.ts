// Generate WebVTT files with video chapters.

/// <reference path="../../references.ts" />

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');

import serverUtils = require('../../server/utils/index');
import editMetadataFile = require('../../server/utils/editMetadataFile');
import utils = require('../../utils');

var getFileIndex = serverUtils.getFileIndex;
var sprintf = utils.sprintf;

export = generateChapters;

/**
 * Generate WebVTT files with video chapters.
 * @todo Create title cues overlapping chapters cues:
 *  * Title 1
 *    * Chapter 1
 *    * Chapter 2
 *    * Chapter 3
 *  * Title 2
 *    * Chapter 1
 *    * Chapter 2
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function generateChapters(dvdPath: string, callback) {
  process.stdout.write('\nGenerating chapter files:\n');

  var ifoPath = path.join(dvdPath, '/web', '/metadata.json');
  var filesList = require(ifoPath);

  var dvdName = dvdPath.split(path.sep).pop();
  var vttFilesList = [];
  var pointer = 0;

  // Filter out menu IFO files.
  filesList = filesList.filter(function(ifoFile) {
    return !ifoFile.ifo.match(/VIDEO_TS\.json$/) && !ifoFile.ifo.match(/VTS_\d{1,2}_0.IFO\.json$/);
  });

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    var name = path.basename(ifoFile);
    var json = require(path.join(dvdPath, '../', ifoFile));

    var vttFile = 0;
    var cues = [];
    var startTime = 0;
    var endTime = 0;

    json.vts_pgcit.pgci_srp.forEach(function(title, titleNum) {
      title.pgc.cell_playback.forEach(function(chapter, chapterNum) {
        if (chapter.first_sector === 0 && cues.length > 0) {
          saveWebVTTFile(cues);

          cues = [];
          startTime = 0;
        }

        endTime = startTime + timeToNumber(chapter.playback_time);

        cues.push({
          title: titleNum + 1, // titleNum and chapterNum are 0-based index.
          chapter: chapterNum + 1,
          start: timeToWebVTTTimestamp(startTime),
          end: timeToWebVTTTimestamp(endTime)
        });

        startTime = endTime;
      });
    });

    saveWebVTTFile(cues);

    function saveWebVTTFile(cues) {
      var fileName = getVTTFilename(name, vttFile);
      var index = getFileIndex(name);
      var content = [
        'WEBVTT',
        ''
      ];

      cues.forEach(function(cue) {
        content.push(cue.start + ' --> ' + cue.end);
        content.push('Title ' + cue.title + ' chapter ' + cue.chapter);
        content.push('');
      });

      if (!vttFilesList[index]) {
        vttFilesList[index] = {};
        vttFilesList[index].vtt = [];
      }
      vttFilesList[index].vtt.push('/' + dvdName + '/web/' + fileName);
      fs.writeFile(path.join(dvdPath, '/web/', fileName), content.join('\n'), function(err) {
        if (err) {
          console.error(err);
        }

        process.stdout.write('.');
      });

      vttFile++;
    }

    // Next iteration.
    pointer++;
    if (pointer < filesList.length) {
      setTimeout(function() {
        next(filesList[pointer].ifo);
      }, 0);
    } else {
      // At the end of all iterations.
      // Save a metadata file containing the list of all IFO files.
      editMetadataFile(getWebName('metadata'), vttFilesList, function() {
        callback();
      });
    }
  }

  /**
   * Return the file path for the web given a file.
   * Used for naming both the IFO files and the metadata file.
   *
   * @param name A file name.
   * @return {string}
   */
  function getWebName(name: string): string {
    return path.join(dvdPath, '/web/', getJsonFileName(name));
  }
}

/**
 * Transform the file name of a JSON file.
 *
 * @param {string} name A file name.
 * @return {string}
 */
function getJsonFileName(name: string): string {
  return name.replace(/\.IFO$/i, '') + '.json';
}

/**
 * Return the file path for the web given a file.
 *
 * @param {string} name A file name.
 * @param {number} vttFile The number of the VTT file (A IFO file can result in several VTT files).
 * @return {string}
 */
function getVTTFilename(name: string, vttFile: number): string {
  return name.replace(/\_0.json$/i, '') + '-' + vttFile + '.vtt';
}

function timeToWebVTTTimestamp(time) {
  var hours = Math.floor(time / 60 / 60);
  var minutes = Math.floor((time - (hours * 60 * 60)) / 60);
  var seconds = Math.floor(time - (hours * 60 * 60) - (minutes * 60));
  var secondsFrac = (time - Math.floor(time)) * 1000;

  return sprintf('%02d:%02d:%02d.%03d', hours, minutes, seconds, secondsFrac);
}

function timeToNumber(dtime) {
  var secondsFrac = parseInt((dtime.frame_u & 0x3F).toString(16), 10);
  switch ((dtime.frame_u & 0xc0) >> 6) {
    case 1:
      secondsFrac /= 25;
      break;
    case 3:
      secondsFrac /= 30 / 1.001; // 29.97
      break;
    default:
      if (dtime.hour === 0 && dtime.minute === 0 && dtime.second === 0 && dtime.frame_u === 0) {
        return 0;
      }
      break;
  }

  return (parseInt((dtime.hour).toString(16), 10) * 60 * 60) +
    (parseInt((dtime.minute).toString(16), 10) * 60) +
    parseInt((dtime.second).toString(16), 10) +
    secondsFrac;
}
