// Convert video to webm format.

/// <reference path="../../references.ts" />
/// <reference path="../../declarations/lodash/lodash.d.ts" />

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');
import child_process = require('child_process');
import _ = require('lodash');

import serverUtils = require('../../server/utils/index');
import editMetadataFile = require('../../server/utils/editMetadataFile');
import utils = require('../../utils');

var spawn = child_process.spawn;
var getFileIndex = serverUtils.getFileIndex;
var getFileSuffix = serverUtils.getFileSuffix;

export = encodeVideo;

/**
 * Encode VOB files from a folder to webm.
 * @see https://trac.ffmpeg.org/wiki/vpxEncodingGuide
 * @see https://sites.google.com/a/webmproject.org/wiki/ffmpeg
 *
 * @todo At the end, delete the ffmpeg2pass-0.log file.
 * @todo Add key frames at chapter beginnings.
 * @todo Check for multiaudio/multiangle video and convert video and sound separately.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function encodeVideo(dvdPath: string, callback) {
  process.stdout.write('\nEncoding VOB files:\n');

  var vobPath = path.join(dvdPath, '/VIDEO_TS', '/*.VOB');
  glob(vobPath, function(err, vobFilesList) {
    if (err) {
      console.error(err);
    }

    // Group by video (e.g. All VTS_01_xx.VOB together).
    var vobFilesGrouped = _.groupBy(vobFilesList, function(vobFile) {
      return vobFile.replace(/_[1-9]\.VOB/i, '.VOB');
    });

    // Retain the values only.
    var vobFiles = _.values(vobFilesGrouped);

    // Sort the files.
    vobFiles = _.forEach(vobFiles, function(vobFile) {
      return vobFile.sort(function(a, b) {
        return a - b;
      });
    });

    var dvdName = dvdPath.split(path.sep).pop();
    var filesList = [];
    var pointer = 0;

    next(vobFiles[pointer]);

    // There are better ways to do async...
    function next(vobFile) {
      var output = utils.convertVobPath(vobFile[0]);
      var prefix = path.join(vobFile[0].replace(/\/VIDEO_TS\/.+/i, '/web/'), '/ffmpeg2pass');
      var input = '';
      var index = getFileIndex(vobFile[0]);

      // Menu and video are optional. We use arrays here as we can then simply
      // iterate in the template without the need of a heavier logic.
      if (filesList[index] === undefined) {
        filesList[index] = {};
        filesList[index].index = [];
        filesList[index].video = [];
      }
      if (getFileSuffix(vobFile[0]) === 0) {
        filesList[index].index.push('/' + dvdName + '/web/' + path.basename(output));
      } else {
        filesList[index].video.push('/' + dvdName + '/web/' + path.basename(output));
      }

      if (vobFile.length === 1) {
        input = path.normalize(vobFile[0]);
      } else {
        input = 'concat:' + vobFile.map(function(file) {
          return path.normalize(file);
        }).join('|');
      }

      input = input.replace(' ', '\ ');
      prefix = prefix.replace(' ', '\ ');
      output = output.replace(' ', '\ ');

      var pass1Cmd = [
        '-i', input,
        '-pass', '1',
        '-passlogfile', prefix,
        // Video
        '-c:v', 'libvpx',
        '-b:v', '1000k',
        // Audio
        '-c:a', 'libvorbis',
        '-b:a', '128k',
        // @todo Read from source.
        '-r', '30/1.001',
        // libvpx options
        '-cpu-used', '0',
        '-lag-in-frames', '16',
        '-quality', 'best',
        '-qmin', '0',
        '-qmax', '51',
        // ffmpeg options
        '-bufsize', '500k',
        '-threads', '16',
        '-vf', 'yadif=1:1:1', // Deinterlace
        '-an', // Disable audio for pass 1.
        '-f', 'rawvideo',
        '-y', // Overwrite by default.
        'NUL' // /dev/null
      ];

      var pass2Cmd = [
        '-i', input,
        '-pass', '2',
        '-passlogfile', prefix,
        // Video
        '-c:v', 'libvpx',
        '-b:v', '1000k',
        // Audio
        '-c:a', 'libvorbis',
        '-b:a', '128k',
        // @todo Read from source.
        '-r', '30/1.001',
        // libvpx options
        '-cpu-used', '0',
        '-lag-in-frames', '16',
        '-quality', 'best',
        '-qmin', '0',
        '-qmax', '51',
        // libvpx options for pass 2
        '-auto-alt-ref', '1',
        '-maxrate', '1000k',  // pass 2
        '-bufsize', '500k',
        '-threads', '16',
        '-vf', 'yadif=1:1:1', // Deinterlace
        '-y', // Overwrite by default.
        output
      ];

      console.log(pass1Cmd.join(' '));
      console.log(pass2Cmd.join(' '));

      var pass1 = spawn('ffmpeg', pass1Cmd);

      pass1.stdout.on('data', function(data) {
        process.stdout.write(data);
      });

      pass1.stderr.on('data', function(data) {
        process.stderr.write(data);
      });

      pass1.on('error', function(err) {
        console.error(err);
      });

      pass1.on('close', function() {
        var pass2 = spawn('ffmpeg', pass2Cmd);

        pass2.stdout.on('data', function(data) {
          process.stdout.write(data);
        });

        pass2.stderr.on('data', function(data) {
          process.stderr.write(data);
        });

        pass2.on('error', function(err) {
          console.error(err);
        });

        pass2.on('close', function() {
          // Next iteration.
          pointer++;
          if (pointer < vobFiles.length) {
            setTimeout(function() {
              next(vobFiles[pointer]);
            }, 0);
          } else {
            // At the end of all iterations.
            // Save a metadata file containing the list of all IFO files.
            editMetadataFile(getWebName('metadata'), filesList, function() {
              callback();
            });
          }
        });
      });
    }
  });

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
 * @param name A file name.
 * @return {string}
 */
function getJsonFileName(name: string): string {
  return name.replace(/\.IFO$/i, '') + '.json';
}
