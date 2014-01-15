// Server for app.

'use strict';


import fs = require('fs');
import path = require('path');
import binaryjs = require('binaryjs');
import glob = require('glob');
import Stream = require('../utils/stream');
import decodePacket = require('../utils/decode_packet');
import utils = require('../utils');

var BinaryServer = binaryjs.BinaryServer;
var toHex = utils.toHex;

var dvdPath = 'C:/DVD/';

var availableDvds = getDVDList(dvdPath);

/**
 * The length of one Logical Block of a DVD.
 * From dvdread/index.ts.
 * @const
 */
var DVD_VIDEO_LB_LEN = 2048;

var server = BinaryServer({port: 9001});

server.on('connection', function(client) {
  console.log('connection');

  client.on('stream', function(stream, meta) {
    console.log('stream', meta);
    var parts = [];

    stream.on('data', function(data) {
      console.log('data');
      //parts = parts.push(data);

      // Validate input
      var dvd = meta.path;

      if (availableDvds.indexOf(dvd) === -1) {
        console.error('Requested DVD is not available.');
        return;
      }

      switch (meta.req) {
        case 'IFO':
          // Send all IFO files.
          var filePath = path.join(dvdPath, dvd, '/VIDEO_TS', '/*.IFO');

          glob(filePath, function(err, files) {
            if (err) {
              console.error(err);
            }

            // Then, we send the files.
            files.forEach(function(file) {
              console.log('File requested: %s', file);

              var name = path.basename(file);
              var ifoFile = fs.createReadStream(file);

              // We send the number of files with the data.
              client.send(ifoFile, {req: meta.req, path: dvd, name: name, type: 'binary', filesNumber: files.length});
            });
          });
          break;

        case 'NAV':
          // Extract NAV packets.
          var filePath = path.join(dvdPath, dvd, meta.file);

          fs.readFile(filePath, function(err, data) {
            if (err) {
              console.error(err);
            }

            var p = new Stream(data);
            p.seek(meta.sector * DVD_VIDEO_LB_LEN);
            var navPackets = decodePacket(p);

            if (!navPackets.pci || navPackets.pci.length === 0) {
              navPackets.pci = 'null';
            }
            if (!navPackets.dsi || navPackets.dsi.length === 0) {
              navPackets.dsi = 'null';
            }

            console.log(navPackets.pci);
            console.log(navPackets.dsi);

            client.send(navPackets.pci, {req: meta.req, path: dvd, name: 'pci', file: meta.file, type: 'binary', cb: meta.cb});
            client.send(navPackets.dsi, {req: meta.req, path: dvd, name: 'dsi', file: meta.file, type: 'binary', cb: meta.cb});
          });
          break;

        case 'VID':
          // Send a video chunk.
          var filePath = path.join(dvdPath, dvd, 'webm', meta.file + '.webm');

          // First, we need to size of the video.
          // @todo This should really come from a metadata file generated beforehand.
          fs.stat(filePath, function(err, stats) {
            if (err) {
              console.error(err);
            }

            var fileSize = stats.size;
            var vobuLength = Math.round(fileSize / meta.vobuNb); // Estimate the size of a VOBU.
            var position = vobuLength * meta.vobu;

            // Then we open the video file...
            // @todo Let's use streams here.
            fs.open(filePath, 'r', function(err, fd) {
              if (err) {
                console.error(err);
              }

              // ... to read just the portion we need.
              fs.read(fd, new Buffer(vobuLength), 0, vobuLength, position, function(err, bytesRead, buffer) {
                if (err) {
                  console.error(err);
                }

                client.send(buffer, {req: meta.req, cb: meta.cb});
              });
            });
          });
          break;

        default:
          console.error('Unknown instruction %s.', meta.req);
          break;
      }
    });

    stream.on('end', function() {
      console.log('end');
    });
  });
});

server.on('error', function() {
  console.log(arguments);
  console.error('Something went wrong.');
});

/**
 * Return the list of directory given a dir.
 * @todo Refactor to use asynchronous API.
 *
 * @param {string} dir
 * @returns {Array.<string>}
 */
function getDVDList(dir) {
  return fs.readdirSync(dir)
    .filter(function(file) {
      var stats = fs.statSync(path.normalize(dir, file));
      return stats.isDirectory();
    });
}
