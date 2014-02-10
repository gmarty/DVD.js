// Convert video to webm format.

'use strict';


import fs = require('fs');
import path = require('path');
import glob = require('glob');
import child_process = require('child_process');
import _ = require('lodash');

import utils = require('../../utils');

var spawn = child_process.spawn;

export = encodeVideo;

/**
 * Encode VOB files from a folder to webm.
 *
 * @param {string} dvdPath
 */
function encodeVideo(dvdPath: string) {
  process.stdout.write('\nEncode VOB files:\n');

  var vobPath = path.join(dvdPath, '/VIDEO_TS', '/*.VOB');
  glob(vobPath, function(err, vobFiles) {
    if (err) {
      console.error(err);
    }

    // Group by video (e.g. All VTS_01_xx.VOB together).
    vobFiles = _.groupBy(vobFiles, function(vobFile) {
      return vobFile.replace(/_[1-9]\.VOB/i, '.VOB');
    });

    // Retain the values only.
    vobFiles = _.values(vobFiles);

    // Sort the files.
    vobFiles = _.forEach(vobFiles, function(vobFile) {
      return vobFile.sort(function(a, b) {
        return a - b;
      });
    });

    var pointer = 0;

    next(vobFiles[pointer]);

    // There are better ways to do async...
    function next(vobFile) {
      var dst = utils.convertVobPath(vobFile[0]);
      var prefix = path.join(vobFile[0].replace(/\/VIDEO_TS\/.+/i, '/web/'), '/ffmpeg2pass');
      var inputFiles = [];

      vobFile.forEach(function(file) {
        inputFiles.push('-i');
        inputFiles.push(path.normalize(file));
      });

      var pass1Cmd = inputFiles.concat([
        '-pass', '1',
        '-passlogfile', prefix,
        // Video
        '-c:v', 'libvpx',
        '-b:v', '500k',
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
        '-vf', 'yadif=1:1:0', // Deinterlace
        '-an', // Disable audio for pass 1.
        '-f', 'rawvideo',
        '-y', // Overwrite by default.
        'NUL'
      ]); // /dev/null

      var pass2Cmd = inputFiles.concat([
        '-pass', '2',
        '-passlogfile', prefix,
        // Video
        '-c:v', 'libvpx',
        '-b:v', '500k',
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
        '-maxrate', '500k',  // pass 2
        '-bufsize', '500k',
        '-threads', '16',
        '-vf', 'yadif=1:1:0', // Deinterlace
        '-y', // Overwrite by default.
        dst
      ]);

      console.log(pass1Cmd);
      console.log(pass2Cmd);

      var pass1 = spawn('ffmpeg', pass1Cmd);

      pass1.stdout.on('data', function(data) {
        process.stdout.write(data);
      });

      pass1.stderr.on('data', function(data) {
        process.stderr.write(data);
      });

      pass1.on('close', function() {
        var pass2 = spawn('ffmpeg', pass2Cmd);

        pass2.stdout.on('data', function(data) {
          process.stdout.write(data);
        });

        pass2.stderr.on('data', function(data) {
          process.stderr.write(data);
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
            console.log('That\'s all folks!')
          }
        });
      });
    }
  });
}
