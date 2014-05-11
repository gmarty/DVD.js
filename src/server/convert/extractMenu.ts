// Extract menu still frames.

'use strict';


import fs = require('fs');
import path = require('path');
import child_process = require('child_process');

import editMetadataFile = require('../../server/utils/editMetadataFile');

var spawn = child_process.spawn;

/**
 * The length of one Logical Block of a DVD.
 * From dvdread/index.ts.
 * @const
 */
var DVD_VIDEO_LB_LEN = 2048;

export = extractMenu;

/**
 * Extract menu still frames.
 * @todo Delete the temporary mpeg file after extraction.
 *
 * @param {string} dvdPath
 * @param {function} callback
 */
function extractMenu(dvdPath: string, callback) {
  process.stdout.write('\nExtracting menu:\n');

  var ifoPath = path.join(dvdPath, '/web', '/metadata.json');
  var filesList = require(ifoPath);

  var menuList = [];
  var pointer = 0;

  next(filesList[pointer].ifo);

  // There are better ways to do async...
  function next(ifoFile: string) {
    ifoFile = path.join(dvdPath, '../', ifoFile);
    var json = require(ifoFile);
    var inputFile = ifoFile
      .replace(/\/web\//, '/VIDEO_TS/')
      .replace(/\.json$/, '.VOB')
      .replace(/ /, '\ ');

    var vobPointer = 0;

    extractStillImage();

    function extractStillImage() {
      var vob = json.menu_c_adt.cell_adr_table[vobPointer];
      var start = vob.start_sector * DVD_VIDEO_LB_LEN;
      var end = vob.last_sector * DVD_VIDEO_LB_LEN;
      var outputFile = ifoFile
        .replace(/\/[^/]+\.json$/, '/stillFrame' + pointer + '-' + vobPointer + '.mpg');

      fs.readFile(inputFile, {flag: 'r'}, function(err, data) {
        if (err) {
          throw err;
        }

        var buffer = data.slice(start, end);

        fs.open(outputFile, 'w+', function(err, fd) {
          if (err) {
            throw err;
          }

          fs.write(fd, buffer, 0, buffer.length, null, function(err) {
            if (err) {
              throw err;
            }

            var imgFile = outputFile
              .replace(/\/[^/]+\.mpg$/, '/menu' + pointer + '-' + vobPointer + '.png');

            outputFile = outputFile.replace(' ', '\ ');
            imgFile = imgFile.replace(' ', '\ ');

            var cmd = [
              '-i', outputFile,
              '-frames', '1',
              '-f', 'image2', imgFile,
              '-y' // Overwrite by default.
            ];

            var ffmpeg = spawn('ffmpeg', cmd);

            ffmpeg.on('error', function(err) {
              console.error(err);
            });

            ffmpeg.on('close', function() {
              process.stdout.write('.');

              // Next iteration.
              vobPointer++;
              if (vobPointer < json.menu_c_adt.nr_of_vobs) {
                setTimeout(function() {
                  extractStillImage();
                }, 0);
              } else {
                //vobPointer = 0;
                pointer++;
                if (pointer < filesList.length) {
                  setTimeout(function() {
                    next(filesList[pointer].ifo);
                  }, 0);
                } else {
                  // At the end of all iterations.
                  // Save a metadata file containing the list of all IFO files.
                  //editMetadataFile(getWebName('metadata'), menuList, function() {
                  callback();
                  //});
                }
              }
            });
          });
        });
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
