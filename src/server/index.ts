// Server for app.

'use strict';


import http = require('http');
import connect = require('connect');

var config = require('../../config/app.json');

/**
 * Start the server.
 */
function start() {
  // Static asset server.
  var app = connect()
    .use(connect.static('public/'))
    .use(connect.static(config.dvdPath));
  http.createServer(app).listen(config.staticServerPort);

  console.log('Server running at http://localhost:%d/', config.staticServerPort);
}

start();
