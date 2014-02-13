// Create a JSON containing the list of available DVD.

'use strict';


import fs = require('fs');
import path = require('path');

import getDVDList = require('../../utils/dvd_list');
import config = require('../../../config/config.json');

export = generateCatalogue;

function generateCatalogue(callback) {
  process.stdout.write('\nRegenerating the list of DVD:\n');

  getDVDList(config.dvdPath, function(availableDvds) {
    var metaPath = path.join(config.dvdPath, '/metadata.json');
    fs.writeFile(metaPath, JSON.stringify(availableDvds), function(err) {
      if (err) {
        console.error(err);
      }

      process.stdout.write('Done');

      callback();
    });
  });
}
