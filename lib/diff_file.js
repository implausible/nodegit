const {
  DiffFile,
} = require('../');

const {
  flags: proto_Flags,
  id: proto_Id,
  mode: proto_Mode,
  path: proto_Path,
  size: proto_Size,
} = DiffFile.prototype;

/**
 * Returns the file's flags
 * @return {Number}
 */
DiffFile.prototype.flags = proto_Flags;

/**
 * Returns the file's Oid
 * @return {Oid}
 */
DiffFile.prototype.id = proto_Id;

/**
 * Returns the file's mode
 * @return {Number}
 */
DiffFile.prototype.mode = proto_Mode;

/**
 * Returns the file's path
 * @return {String}
 */
DiffFile.prototype.path = proto_Path;

/**
 * Returns the file's size
 * @return {Number}
 */
DiffFile.prototype.size = proto_Size;
