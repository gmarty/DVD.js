// Create a JSON containing the list of available DVD.

'use strict';


import fs = require('fs');
import path = require('path');

import getDVDList = require('../utils/getDVDList');
var config = require('../../../config/app.json');

export = generateCatalogue;

function generateCatalogue(callback) {
  process.stdout.write('\nRegenerating the list of DVD:\n');

  getDVDList(config.dvdPath, function(availableDvds) {
    var metaPath = path.join(config.dvdPath, '/dvds.json');
    fs.writeFile(metaPath, JSON.stringify(availableDvds), function(err) {
      if (err) {
        console.error(err);
      }

      process.stdout.write('Done\n');

      callback();
    });
  });
}
