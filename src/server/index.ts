// Server for app.

'use strict';


import http = require('http');
import fs = require('fs');
import path = require('path');
import connect = require('connect');
import binaryjs = require('binaryjs');
import glob = require('glob');
import getDVDList = require('../utils/dvd_list');
import Stream = require('../utils/stream');
import decodePacket = require('../utils/decode_packet');
import utils = require('../utils');

// Configuration
var dvdPath = 'C:/DVD/';
var staticServerPort = 3000;
var wsServerPort = 9001;

// Start the server once we get the list of DVD.
getDVDList(dvdPath, start);

/**
 * Start the servers.
 *
 * @param {Array.<string>} availableDvds
 */
function start(availableDvds) {
  // Static asset server.
  var app = connect()
    .use(connect.static('public/'));
  http.createServer(app).listen(staticServerPort);

  console.log('Server running at http://localhost:3000/');

  // WebSockets server.
  var server = binaryjs.BinaryServer({port: wsServerPort});

  server.on('connection', function(client) {
    console.log('connection');

    /**
     * The length of one Logical Block of a DVD.
     * From dvdread/index.ts.
     * @const
     */
    var DVD_VIDEO_LB_LEN = 2048;

    client.on('stream', function(stream, meta) {
      console.log('stream', meta);
      var parts = [];

      stream.on('data', function(data) {
        console.log('data');
        //parts = parts.push(data);

        // Validate input if a DVD path is specified.
        if (meta.path) {
          var dvd = meta.path;

          if (availableDvds.indexOf(dvd) === -1) {
            console.error('Requested DVD is not available.');
            return;
          }
        }

        switch (meta.req) {
          case 'DVD':
            // Send the list of DVD.
            client.send(availableDvds, {
              req: meta.req
            });
            break;

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
                client.send(ifoFile, {
                  req: meta.req,
                  path: dvd,
                  name: name,
                  type: 'binary',
                  filesNumber: files.length
                });
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

              client.send(navPackets.pci, {
                req: meta.req,
                path: dvd,
                name: 'pci',
                file: meta.file,
                type: 'binary',
                cb: meta.cb
              });
              client.send(navPackets.dsi, {
                req: meta.req,
                path: dvd,
                name: 'dsi',
                file: meta.file,
                type: 'binary',
                cb: meta.cb
              });
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

                  client.send(buffer, {
                    req: meta.req,
                    cb: meta.cb
                  });
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
}
