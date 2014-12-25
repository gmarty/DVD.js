'use strict';


import ifoTypes = require('../dvdread/ifo_types');
import dvdTypes = require('../dvdnav/dvd_types');
import ifoRead = require('../dvdread/ifo_read');
import navRead = require('../dvdread/nav_read');
import utils = require('../utils');

var ifo_handle_t = ifoTypes.ifo_handle_t;
var dvd_read_domain_t = dvdTypes.dvd_read_domain_t;
var dvd_file_t = dvdTypes.dvd_file_t;
var sprintf = utils.sprintf;

/**
 * The DVD access interface.
 *
 * This file contains the functions that form the interface to to
 * reading files located on a DVD.
 */

/** @const */ var TITLES_MAX = 9;

export = dvd_reader;

/**
 * Opaque type that is used as a handle for one instance of an opened DVD.
 *
 * @constructor
 */
function dvd_reader() {
  // Basic information.
  //this.isImageFile = null;

  // Hack for keeping track of the css status.
  // 0: no css, 1: perhaps (need init of keys), 2: have done init
  //this.css_state = null;
  //this.css_title = null; // Last title that we have called dvdinput_title for.

  // Information required for an image file.
  //this.dev = dvd_input_t();

  // Information required for a directory path drive.
  this.path_root = null;

  // Filesystem cache
  //this.udfcache_level = null; // 0 - turned off, 1 - on
  //this.udfcache = null;

  // An array of ifo_handle_t().
  this.files = [];
  //this.filesNumber = 0; // The number of IFO files in the DVD. Used for async purpose.
}

/**
 * Load a single JSON file.
 * See http://mathiasbynens.be/notes/xhr-responsetype-json
 * @todo Use promises here.
 * @todo Implement a mechanism for loading multiple files, then execute callback.
 *
 * @param {string} url
 * @param {function=} successHandler
 * @param {function=} errorHandler
 */
dvd_reader.prototype.loadJSON = function(url, successHandler, errorHandler) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'json';
  xhr.timeout = 3000;
  xhr.overrideMimeType && xhr.overrideMimeType('application/json');
  xhr.setRequestHeader('Accept', 'application/json, text/javascript, */*; q=0.01');
  xhr.addEventListener('load', function(event) {
    var status = (<XMLHttpRequest>event.target).status;
    if (status === 200) {
      successHandler && successHandler((<XMLHttpRequest>event.target).response);
    } else {
      errorHandler && errorHandler(status);
    }
  }, false);
  xhr.send();
};

/**
 * Request the list of available DVD from the server, then execute a callback function.
 * @todo Integrate gracefully into the rest of the API to avoid instantiate BinaryClient twice.
 *
 * @param {Function} callback
 */
dvd_reader.prototype.getDVDList = function(callback) {
  this.loadJSON('/metadata.json',
    function(dvds) {
      callback(dvds);
    }, function(status) {
      console.error('Can\'t retrieve the list of DVD (status code %s)', status);
    });
};

/**
 * Opens a block device of a DVD-ROM file, or an image file, or a directory
 * name for a mounted DVD or HD copy of a DVD.
 *
 * If the given file is a block device, or is the mountpoint for a block
 * device, then that device is used for CSS authentication using libdvdcss.
 * If no device is available, then no CSS authentication is performed,
 * and we hope that the image is decrypted.
 *
 * If the path given is a directory, then the files in that directory may be
 * in any one of these formats:
 *
 *   path/VIDEO_TS/VTS_01_1.VOB
 *   path/video_ts/vts_01_1.vob
 *   path/VTS_01_1.VOB
 *   path/vts_01_1.vob
 *
 * @param {string} path Specifies the the device, file or directory to be used.
 * @param {Function} cb The callback function executed at the end.
 */
dvd_reader.prototype.open = function(path, cb) {
  var self = this;

  this.path = path;

  // First, we load the metadata.json file...
  this.loadJSON('/' + this.path + '/web/metadata.json',
    function(metadata) {
      // ... then, we load each IFO as a JSON file.
      // Would be nice not to depend on jQuery.
      var deferreds = metadata.ifo.map(function(ifoFile) {
        return $.ajax({
          dataType: 'json',
          url: ifoFile,
          timeout: 3000,
          success: function(ifoFile) {
            self.files.push(ifoFile);
          }
        });
      });

      $.when.apply(null, deferreds).then(function() {
        cb.call();
      });
    });
};

dvd_reader.prototype.read_cache_block = function(file, type, sector, block_count, callback) {
  switch (type) {
    case 'NAV':
      this.loadJSON('/' + this.path + '/web/VTS_01_1.VOB-' + utils.toHex(sector) + '.json',
        function(navPacket) {
          callback(navPacket.pci, navPacket.dsi);
        },
        function(status) {
          console.error('Error loading file: status %s.', status);
        });
      break;

    case 'VID':
      setTimeout(callback, 0);
      break;

    default:
      console.error('Unknown instruction %s.', type);
      break;
  }
};

/**
 * Returns a File object from a File object collection.
 *
 * @param {string} filename
 * @return {?ifo_handle_t}
 */
dvd_reader.prototype.openFilePath = function(filename) {
  for (var i = 0, len = this.files.length; i < len; i++) {
    if ('/VIDEO_TS/' + this.files[i].file.file.name == filename) {
      /*dvd_file.title_sizes[0] = fileinfo.st_size / DVD_VIDEO_LB_LEN;
       dvd_file.title_devs[0] = dev;
       dvd_file.filesize = dvd_file.title_sizes[0];*/
      return this.files[i];
    }
  }

  var name = filename.split('/').pop();
  var file = new dvd_file_t();
  file.file = {
    name: name,
    size: 0
  };
  //file.path = filename;
  this.files.push(file);

  return file;

  //throw new Error(sprintf("Can't find file %s", filename));
};


/**
 * @param {number} title
 * @param {number} menu
 * @return {string}
 */
dvd_reader.prototype.openVOBPath = function(title, menu) {
  var filename = '';
  var full_path = '';
  var fileinfo;
  var dvd_file = new dvd_file_t();
  var i;

  if (menu) {
    if (title == 0) {
      filename = '/VIDEO_TS/VIDEO_TS.VOB';
    } else {
      filename = sprintf('/VIDEO_TS/VTS_%02i_0.VOB', title);
    }

    // In the prototype, we just return the file path for VOB files.
    // @todo Isolate this in another function.
    return filename;
    //return DVDOpenFilePath(dvd, filename);

    /*dvd_file.title_sizes[0] = fileinfo.st_size / DVD_VIDEO_LB_LEN;
     dvd_file.title_devs[0] = dev;
     dvdinput_title(dvd_file.title_devs[0], 0);
     dvd_file.filesize = dvd_file.title_sizes[0];*/
  } else {
    // @todo fixme Quick and dirty fix.
    //for (i = 0; i < TITLES_MAX; ++i) {
    i = 0;
    filename = sprintf('/VIDEO_TS/VTS_%02i_%i.VOB', title, i + 1);
    //dvd_file[i] = this.openFilePath(filename);
    return filename;

    /*dvd_file.title_sizes[i] = fileinfo.st_size / DVD_VIDEO_LB_LEN;
     dvd_file.title_devs[i] = dvdinput_open(full_path);
     dvdinput_title(dvd_file.title_devs[i], 0);
     dvd_file.filesize += dvd_file.title_sizes[i];*/
    //}
    if (!dvd_file[0]) {
      return null;
    }
  }

  return dvd_file;
};


/**
 * @param {number} titlenum
 * @param {number} domain
 * @return {?ifo_handle_t|string}
 */
dvd_reader.prototype.openFile = function(titlenum, domain) {
  /** @type {string} */ var filename = '';

  // Check arguments.
  if (titlenum < 0) {
    return null;
  }

  switch (domain) {
    case dvd_read_domain_t.DVD_READ_INFO_FILE:
      if (titlenum == 0) {
        filename = sprintf('/VIDEO_TS/VIDEO_TS.IFO');
      } else {
        filename = sprintf('/VIDEO_TS/VTS_%02i_0.IFO', titlenum);
      }
      break;
    case dvd_read_domain_t.DVD_READ_INFO_BACKUP_FILE:
      if (titlenum == 0) {
        filename = sprintf('/VIDEO_TS/VIDEO_TS.BUP');
      } else {
        filename = sprintf('/VIDEO_TS/VTS_%02i_0.BUP', titlenum);
      }
      break;
    case dvd_read_domain_t.DVD_READ_MENU_VOBS:
      return this.openVOBPath(titlenum, 1);
      break;
    case dvd_read_domain_t.DVD_READ_TITLE_VOBS:
      if (titlenum == 0) {
        return null;
      }
      return this.openVOBPath(titlenum, 0);
      break;
    default:
      console.error('jsdvdnav: Invalid domain for file open.');
      return null;
      break;
  }

  return this.openFilePath(filename);
};


/**
 * @param {dvd_file_t} dvd_file.
 */
dvd_reader.prototype.closeFile = function(dvd_file) {
  dvd_file = null;
};
