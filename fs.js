// This module implements the js-git fs interface for node.js
// The interface is documented at:
//
//   https://github.com/creationix/js-git/blob/master/specs/fs.md
//

var fs = require('fs');
var pathJoin = require('path').join;
var pathResolve = require('path').resolve;

module.exports = exports = chroot;
exports.stat = stat;
exports.read = read;
exports.write = write;
exports.readStream = readStream;
exports.writeStream = writeStream;
exports.unlink = unlink;
exports.readlink = readlink;
exports.symlink = symlink;
exports.readdir = readdir;
exports.rmdir = rmdir;
exports.mkdir = mkdir;
exports.rename = rename;

function chroot(root) {
  root = pathResolve(process.cwd(), root);
  var exports = wrap(chroot);
  exports.root = root;
  exports.stat = wrap(stat);
  exports.read = wrap(read);
  exports.write = wrap(write);
  exports.readStream = wrap(readStream);
  exports.writeStream = wrap(writeStream);
  exports.unlink = wrap(unlink);
  exports.readlink = wrap(readlink);
  exports.symlink = wrap(symlink);
  exports.readdir = wrap(readdir);
  exports.rmdir = wrap(rmdir);
  exports.mkdir = wrap(mkdir);
  exports.rename = wrap(rename, true);
  return exports;

  function wrap(fn, two) {
    return function () {
      arguments[0] = pathJoin(root, pathJoin("/", arguments[0]));
      if (two) arguments[1] = pathJoin(root, pathJoin("/", arguments[1]));
      return fn.apply(this, arguments);
    };
  }
}

// Given a path, return a continuable for the stat object.
function stat(path) {
  return function (callback) {
    fs.stat(path, function (err, stat) {
      if (err) return callback(err);
      var ctime = stat.ctime / 1000;
      var cseconds = Math.floor(ctime);
      var mtime = stat.mtime / 1000;
      var mseconds = Math.floor(mtime);
      callback(null, {
        ctime: [cseconds, Math.floor((ctime - cseconds) * 1000000000)],
        mtime: [mseconds, Math.floor((mtime - mseconds) * 1000000000)],
        dev: stat.dev,
        ino: stat.ino,
        mode: stat.mode,
        uid: stat.uid,
        gid: stat.gid,
        size: stat.size
      });
    });
  };
}

function read(path, encoding) {
  return function (callback) {
    fs.readFile(path, encoding, callback);
  };
}

function write(path, value, encoding) {
  return function (callback) {
    fs.writeFile(path, value, encoding, callback);
  };
}

// Given a path and options return a stream source of the file.
// options.start the start offset in bytes
// options.end the offset of the last byte to read
function readStream(path, options) {
  options = options || {};
  var position = options.start;
  var fd, locked;
  var dataQueue = [];
  var readQueue = [];

  function finish(err) {
    locked = true;
    if (fd) {
      fs.close(fd, function () {
        flush(err);
      });
    }
    else flush(err);
  }

  function flush(err) {
    dataQueue.length = 0;
    while (readQueue.length) {
      readQueue.shift()(err);
    }
  }

  function start() {
    locked = true;
    fs.open(path, "r", function (err, result) {
      locked = false;
      if (err) dataQueue.push([err]);
      fd = result;
      check();
    });
  }

  function check() {
    while (dataQueue.length && readQueue.length) {
      var item = dataQueue.shift();
      if (item[1] === undefined) {
        return finish(item[0]);
      }
      readQueue.shift().apply(null, item);
    }
    if (locked || !readQueue.length) return;
    if (!fd) {
      return start();
    }
    var length = 8192;
    if (typeof position === 'number' && typeof options.end === 'number') {
      length = Math.min(length, options.end - position);
      if (!length) {
        dataQueue.push([]);
        return check();
      }
    }
    var buffer = new Buffer(length);
    locked = true;
    fs.read(fd, buffer, 0, length, position, onRead);
  }

  function onRead(err, bytesRead, buffer) {
    locked = false;
    if (err) {
      dataQueue.push([err]);
      return check();
    }
    if (!bytesRead) {
      dataQueue.push([]);
      return check();
    }
    if (typeof position === 'number') position += bytesRead;
    if (bytesRead < buffer.length) {
      dataQueue.push([null, buffer.slice(0, bytesRead)]);
    }
    else {
      dataQueue.push([null, buffer]);
    }
    check();
  }

  return function (close, callback) {
    readQueue.push(callback);
    if (close) {
      finish(close === true ? null : close);
    }
    else {
      check();
    }
  };

}

function writeStream(path, options) {
  options = options || {};
  var dataQueue = [];
  var read, fd, reading, writing;
  var callback;

  function onRead() {
    reading = false;
    dataQueue.push(arguments);
    check();
  }

  function onOpen(err, result) {
    writing = false;
    // If we fail opening the target file, cancel the stream.
    if (err) return read(err, onRead);
    fd = result;
    check();
  }

  function onWrite(err, bytesWritten, buffer) {
    writing = false;
    if (err) return read(err, onRead);
    if (bytesWritten < buffer.length) {
      var slice = buffer.slice(bytesWritten);
      writing = true;
      fs.write(fd, slice, 0, slice.length, null, onWrite);
    }
    else {
      check();
    }
  }

  function check() {
    if (!writing && dataQueue.length) {
      var next = dataQueue.shift();
      var err = next[0];
      var item = next[1];
      if (item === undefined) {
        if (fd) return fs.close(fd, function () {
          callback(err);
        });
        return callback(err);
      }
      writing = true;
      fs.write(fd, item, 0, item.length, null, onWrite);
    }
    if (!reading && !dataQueue.length) {
      reading = true;
      read(null, onRead);
    }
  }

  return function (source) {
    read = source;
    return function (cb) {
      callback = cb;
      writing = true;
      fs.open(path, "w", options.mode, onOpen);
      reading = true;
      read(null, onRead);
    };
  };
}

function unlink(path) {
  return function (callback) {
    fs.unlink(path, callback);
  };
}

function readlink(path) {
  return function (callback) {
    fs.readlink(path, callback);
  };
}

function symlink(path, value) {
  return function (callback) {
    fs.symlink(path, value, callback);
  };
}

function readdir(path) {
  var files = null;
  var error = null;
  var reading = false;
  var offset = 0;
  var readQueue = [];

  function check() {
    while (readQueue.length && (files || error)) {
      var callback = readQueue.shift();
      if (error) callback(error);
      else callback(null, files[offset++]);
    }
    if (!reading && readQueue.length) {
      reading = true;
      fs.readdir(path, onRead);
    }
  }

  function onRead(err, result) {
    reading = false;
    error = err;
    files = result;
    check();
  }

  return function (close, callback) {
    if (close) return callback(close === true ? null : close);
    readQueue.push(callback);
    check();
  };
}

function rmdir(path) {
  return function (callback) {
    fs.rmdir(path, callback);
  };
}

function mkdir(path) {
  return function (callback) {
    fs.mkdir(path, callback);
  };
}

function rename(source, target) {
  return function (callback) {
    fs.rename(source, target, callback);
  };
}