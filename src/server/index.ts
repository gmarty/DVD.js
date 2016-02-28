// Server content and advertise a service on the local network.

'use strict';


import http = require('http');
import connect = require('connect');
import cors = require('cors');
const mdns = require('mdns-js');

var config = require('../../config/app.json');

/**
 * Start the server.
 */
function startServer() {
  // Static asset server.
  var app = connect()
    .use(cors({origin: true}))
    .use(connect.static('public/'))
    .use(connect.static(config.webFolder));
  http.createServer(app).listen(config.staticServerPort);

  console.log('Server running at http://localhost:%d/', config.staticServerPort);
}

/**
 * Advertise the service.
 */
function advertiseService() {
  var service = mdns.createAdvertisement(mdns.tcp('_http'), 9876, {
    name: '_dvd_server'
  });

  service.start();
}

startServer();
advertiseService();
