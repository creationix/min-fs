min-fs
======

A node.js implementation of the min-stream and continuable based fs interface for js-git.

## File System Interface

This module implements the following functions from the fs interface which is described in detail at <https://github.com/creationix/js-git/blob/master/specs/fs.md>

- stat(path) -> continuable<stat>
- read(path) -> source<binary>
- write(path) -> sink<binary>
- unlink(path) -> continuable
- readlink(path) -> continuable<target>
- symlink(path, target) -> continuable
- readdir(path) -> source<name>
- rmdir(path) -> continuable
- mkdir(path) -> continuable

```js
var fs = require('min-fs');

// Streaming copy a file

// Set up a source, the file isn't actually opened till the stream is read from.
var source = fs.read("input.txt");

// Set up a sink.  The file isn't actually opened yet.
var sink = fs.write("copy.txt");

// Hook the source to the sink, but still don't create either file or start moving yet.
var continuable = sink(source);

// Now, create both files and stream the contents.  If there is a problem it will be reported here.
// Otherwise the continuable will resolve with no error when done streaming.
continuable(function (err) {
  if (err) throw err;
  console.log("Done Streaming");
});
```

## chroot(root) -> fs

In addition to the exports object implementing the fs interface with respect to the filesystem root, you can also create a fs instance that is chrooted to some directory.

```js
var fs = require('min-fs')("/home/tim/Code/js-git/.git");

// read the first chunk in the staging area's index.
fs.read("/index")(null, console.log);
```
