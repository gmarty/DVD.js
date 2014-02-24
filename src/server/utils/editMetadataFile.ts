// Create or append data to a metadata file formatted in JSON.

'use strict';


import fs = require('fs');
import path = require('path');

export = editMetadataFile;

function editMetadataFile(file, key, value, callback) {
  var content = {};
  // We check if the file exists.
  fs.exists(file, function(exists) {
    if (exists) {
      content = require(file);
    }

    // Now, we append the data.
    content[key] = value;

    fs.writeFile(file, JSON.stringify(content), function(err) {
      if (err) {
        console.error(err);
      }

      process.stdout.write('.');

      callback();
    });
  });
}
