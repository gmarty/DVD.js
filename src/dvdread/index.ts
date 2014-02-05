///<reference path='../declarations/BinaryClient.d.ts'/>
///<reference path='../declarations/jDataView.d.ts'/>

'use strict';


import navRead = require('../dvdread/nav_read');
import utils = require('../utils');

var sprintf = utils.sprintf;

/**
 * The DVD access interface.
 *
 * This file contains the functions that form the interface to to
 * reading files located on a DVD.
 */

/**
 * The current version.
 * @const
 */
export var DVDREAD_VERSION = 904;

/**
 * The length of one Logical Block of a DVD.
 * @const
 */
export var DVD_VIDEO_LB_LEN = 2048;

/** @const */ var TITLES_MAX = 9;

/** @const */ var cBlue = 'color: #4AF;';
/** @const */ var cPink = 'color: #F48;';

/**
 * Public type that is used to provide statistics on a handle.
 */
export function dvd_stat_t() {
  return {
    size: 'off_t',                    // Total size of file in bytes
    nr_parts: 0,                      // Number of file parts
    parts_size: ['array', 'off_t', 9] // Size of each part in bytes
  };
}

/**
 *
 */
export enum dvd_read_domain_t {
  DVD_READ_INFO_FILE,        // VIDEO_TS.IFO  or VTS_XX_0.IFO (title)
  DVD_READ_INFO_BACKUP_FILE, // VIDEO_TS.BUP  or VTS_XX_0.BUP (title)
  DVD_READ_MENU_VOBS,        // VIDEO_TS.VOB  or VTS_XX_0.VOB (title)
  DVD_READ_TITLE_VOBS        // VTS_XX_[1-9].VOB (title). All files in the title set are opened and read as a single file.
}


/**
 * Opaque type that is used as a handle for one instance of an opened DVD.
 *
 * @constructor
 */
export function dvd_reader() {
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

  // An array of dvd_file_t().
  this.files = [];
  //this.filesNumber = 0; // The number of IFO files in the DVD. Used for async purpose.
}

/**
 * A pool of callbacks to be executed after asynchronous actions.
 * @private
 */
var cbPool = Object.create(null);


/**
 * Opaque type for a file read handle, much like a normal fd or FILE *.
 *
 * @constructor
 */
export function dvd_file_t() {
  // Basic information.
  //this.dvd = dvd_reader_t(); -> Better avoid recursion. The relation is inverted here.

  // Hack for selecting the right css title.
  //this.css_title = null;

  // Information required for an image file.
  //this.lb_start = null;
  //this.seek_pos = null;
  this.file = null; // File type
  this.view = null; // jDataView

  // Information required for a directory path drive.
  //this.title_sizes = new Array(TITLES_MAX);
  //this.title_devs = new Array(TITLES_MAX); // Array of dvd_input_t().

  // Calculated at open-time, size in blocks.
  //this.filesize = null; // ssize_t()

  this.path = '';
}

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
 * @return If successful a a read handle is returned. Otherwise 0 is returned.
 */
dvd_reader.prototype.open = function(path, cb) {
  var self = this;
  var client = new BinaryClient('ws://localhost:9001');
  this.client = client;

  this.path = path;

  client.on('open', function() {
    console.log('%cConnection established.', cBlue);
    console.log('%cRequesting IFO files.', cPink);
    client.send('', {req: 'IFO', path: path});
  });

  client.on('stream', function(stream, meta) {
    //console.log('BinaryClient: stream', stream, meta);
    var parts = [];

    stream.on('data', function(data) {
      //console.log('BinaryClient: data');
      /*console.dir(meta);
       console.dir(data);*/

      switch (meta.req) {
        case 'IFO':
        case 'NAV':
        case 'VID':
          parts.push(data);
          break;

        default:
          console.error('Unknown instruction %s.', meta.req);
          break;
      }
    });

    stream.on('end', function() {
      //console.log('BinaryClient: end');
      /*console.dir(stream);
       console.dir(meta);
       console.dir(parts);*/

      switch (meta.req) {
        case 'IFO':
          var data = utils.concatBuffer(parts);

          var ifoFile = new dvd_file_t();
          ifoFile.file = {
            name: meta.name,
            size: data.byteLength
          };
          ifoFile.view = new jDataView(data, undefined, undefined, false);
          self.files.push(ifoFile);

          // Check if we have received all the files. If so, execute callback.
          if (meta.filesNumber != 0 && meta.filesNumber == self.files.length) {
            console.log('%cAll IFO files received.', cBlue);
            cb.call(); // Move where appropriate.
          }
          break;

        case 'NAV':
          var cbId = meta.cb;

          if (cbId === undefined || cbPool[cbId] === undefined) {
            console.error('NAV packet received with invalid callback hash.');
          }

          var data = utils.concatBuffer(parts);

          switch (meta.name) {
            case 'pci':
            case 'dsi':
              if (data === 'null') {
                data = undefined;
              }
              cbPool[cbId][meta.name] = data;
              cbPool[cbId][meta.name + 'Loaded'] = true;
              break;
            default:
              console.error('Unknown NAV packet type %s', meta.name);
              break;
          }

          if (cbPool[cbId].pciLoaded && cbPool[cbId].dsiLoaded) {
            var pci = navRead.PCI(cbPool[cbId].pci);
            var dsi = navRead.DSI(cbPool[cbId].dsi);

            cbPool[cbId].cb(pci, dsi);
            delete cbPool[cbId];
          }
          break;

        case 'VID':
          var cbId = meta.cb;

          if (cbId === undefined || cbPool[cbId] === undefined) {
            console.error('NAV packet received with invalid callback hash.');
          }

          var data = utils.concatBuffer(parts);

          cbPool[cbId].cb(data);
          delete cbPool[cbId];
          break;

        default:
          console.error('Unknown instruction %s.', meta.req);
          break;
      }
    });
  });

  client.on('close', function() {
    //console.log('%cConnection closed.', cBlue);
  });

  client.on('error', function(err) {
    console.error('BinaryClient: An error occurred. Is the server even running?');
  });
};

dvd_reader.prototype.read_cache_block = function(file, type, sector, block_count, cb) {
  //console.log('%cdvd_reader#read_cache_block()', 'color: green;', file, sector, block_count);

  // @todo Find a polyfill of the ES6 method to generate unique IDs.
  var cbId = btoa('' + performance.now()); // Generate a unique key for the callback.

  switch (type) {
    case 'NAV':
      cbPool[cbId] = {
        cb: cb,
        pci: null,
        dsi: null,
        pciLoaded: false,
        dsiLoaded: false
      };

      this.client.send('', {req: 'NAV', path: this.path, file: file, sector: sector, block_count: block_count, cb: cbId});
      break;

    case 'VID':
      cbPool[cbId] = {
        cb: cb
      };

      var vobu = sector;        // The requested VOBU.
      var vobuNb = block_count; // Total number of VOBU.

      this.client.send('', {req: 'VID', path: this.path, file: file, vobu: vobu, vobuNb: vobuNb, cb: cbId});
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
 * @return {?dvd_file_t}
 */
dvd_reader.prototype.openFilePath = function(filename) {
  for (var i = 0, len = this.files.length; i < len; i++) {
    if ('/VIDEO_TS/' + this.files[i].file.name == filename) {
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
 * @return {?dvd_file_t}
 */
dvd_reader.prototype.openVOBPath = function(title, menu) {
  var filename = '';
  var full_path = '';
  var fileinfo;
  var dvd_file = new dvd_file_t();
  var i;

  /*dvd_file.dvd = dvd;
   dvd_file.css_title = title << 1 | menu; // Hack
   dvd_file.lb_start = 0;
   dvd_file.seek_pos = 0;
   memset(dvd_file.title_sizes, 0, sizeof(dvd_file.title_sizes));
   memset(dvd_file.title_devs, 0, sizeof(dvd_file.title_devs));
   dvd_file.filesize = 0;*/

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
 * Function passed as reference.
 * @param {number} titlenum
 * @param {number} domain
 * @return {?dvd_file_t}
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
      console.error('libdvdread: Invalid domain for file open.');
      return null;
      break;
  }

  return this.openFilePath(filename);
};


/**
 * @param {dvd_file_t} dvd_file (passed as reference).
 */
dvd_reader.prototype.closeFile = function(dvd_file) {
  dvd_file = null;
};
