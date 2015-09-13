// Server for app.

'use strict';


import http = require('http');
import connect = require('connect');
import cors = require('cors');

var config = require('../../config/app.json');

/**
 * Start the server.
 */
function start() {
  // Static asset server.
  var app = connect()
    .use(connect.static('public/'))
    .use(connect.static(config.webFolder))
    .use(cors({origin: false}));
  http.createServer(app).listen(config.staticServerPort);

  console.log('Server running at http://localhost:%d/', config.staticServerPort);
}

start();
