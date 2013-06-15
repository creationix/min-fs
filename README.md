min-fs
======

A node.js implementation of the min-stream and continuable based fs interface for js-git.

## File System Interface

This module implements the following functions from the fs interface which is described in detail at <https://github.com/creationix/js-git/blob/master/specs/fs.md>

- stat(path) -> continuable<stat>
- read(path, [encoding]) -> continuable<value>
- write(path, value, [encoding]) -> continuable
- readStream(path, [options]) -> source<binary>
- writeStream(path, [options]) -> sink<binary>
- unlink(path) -> continuable
- readlink(path) -> continuable<target>
- symlink(path, target) -> continuable
- readdir(path) -> source<name>
- rmdir(path) -> continuable
- mkdir(path) -> continuable
- rename(path, target) -> continuable

```js
var fs = require('min-fs');

// Streaming copy a file

// Set up a source, the file isn't actually opened till the stream is read from.
var source = fs.readStream("input.txt");

// Set up a sink.  The file isn't actually opened yet.
var sink = fs.writeStream("copy.txt");

// Hook the source to the sink, but still don't create either file or start moving yet.
var continuable = sink(source);

// Now, create both files and stream the contents.  If there is a problem it will be reported here.
// Otherwise the continuable will resolve with no error when done streaming.
continuable(function (err) {
  if (err) throw err;
  console.log("Done Streaming");
});
```

You don't have to store all the steps into variables, so you can simply chain the calls.

Also if you're in an ES6 generator using [gen-run](https://github.com/creationix/gen-run), then consuming the continuable is even easier.

```js
var run = require('gen-run');
var fs = require('min-fs');

function* copy(source, dest) {
  yield fs.writeStream(dest)(fs.readStream(source));
}

run(function* () {
  yield* copy("input.txt", "copy.txt");
});
```


## chroot(root) -> fs

In addition to the exports object implementing the fs interface with respect to the filesystem root, you can also create a fs instance that is chrooted to some directory.

```js
var fs = require('min-fs')("/home/tim/Code/js-git/.git");

// read the first chunk in the staging area's index.
fs.readStream("/index")(null, console.log);
```
