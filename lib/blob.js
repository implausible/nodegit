const {
  Blob,
  TreeEntry,
  Utils: { lookupWrapper },
} = require('../');

/**
* Retrieves the blob pointed to by the oid
* @async
* @param {Repository} repo The repo that the blob lives in
* @param {String|Oid|Blob} id The blob to lookup
* @return {Blob}
*/
Blob.lookup = lookupWrapper(Blob);

/**
 * Retrieve the content of the Blob.
 *
 * @return {Buffer} Contents as a buffer.
 */
Blob.prototype.content = function() {
  return this.rawcontent().toBuffer(this.rawsize());
};

/**
 * Retrieve the Blob's type.
 *
 * @return {Number} The filemode of the blob.
 */
Blob.prototype.filemode = function() {
  return this.isBinary()
    ? TreeEntry.FILEMODE.EXECUTABLE
    : TreeEntry.FILEMODE.BLOB;
};

/**
 * Retrieve the Blob's content as String.
 *
 * @return {String} Contents as a string.
 */
Blob.prototype.toString = function() {
  return this.content().toString();
};
