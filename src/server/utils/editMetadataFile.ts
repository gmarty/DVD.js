// Create or append data to a metadata file formatted in JSON.

/// <reference path="../../references.ts" />
/// <reference path="../../declarations/lodash/lodash.d.ts" />

'use strict';


import fs = require('fs');
import path = require('path');
import _ = require('lodash');

export = editMetadataFile;

function editMetadataFile(file, value, callback) {
  var content: any = [];
  // We check if the file exists.
  fs.exists(file, function(exists) {
    if (exists) {
      content = require(file);
    }

    // Now, we append the data.
    content = _.merge(content, value);

    fs.writeFile(file, JSON.stringify(content), function(err) {
      if (err) {
        console.error(err);
      }

      process.stdout.write('.');

      callback();
    });
  });
}
