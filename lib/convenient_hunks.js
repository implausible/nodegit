const {
  ConvenientHunk,
} = require('../');

const {
  header: proto_Header,
  headerLen: proto_HeaderLen,
  lines: proto_Lines,
  newLines: proto_NewLines,
  newStart: proto_NewStart,
  oldLines: proto_OldLines,
  oldStart: proto_OldStart,
  size: proto_Size,
} = ConvenientHunk.prototype;

/**
  * Diff header string that represents the context of this hunk
  * of the diff. Something like `@@ -169,14 +167,12 @@ ...`
  * @return {String}
  */
ConvenientHunk.prototype.header = proto_Header;

/**
 * The length of the header
 * @return {Number}
 */
ConvenientHunk.prototype.headerLen = proto_HeaderLen;

/**
 * The lines in this hunk
 * @async
 * @return {Array<DiffLine>}
 */
ConvenientHunk.prototype.lines = proto_Lines;

/**
 * The number of new lines in the hunk
 * @return {Number}
 */
ConvenientHunk.prototype.newLines = proto_NewLines;

/**
 * The starting offset of the first new line in the file
 * @return {Number}
 */
ConvenientHunk.prototype.newStart = proto_NewStart;

/**
 * The number of old lines in the hunk
 * @return {Number}
 */
ConvenientHunk.prototype.oldLines = proto_OldLines;

/**
 * The starting offset of the first old line in the file
 * @return {Number}
 */
ConvenientHunk.prototype.oldStart = proto_OldStart;

/**
 * Number of lines in this hunk
 * @return {Number}
 */
ConvenientHunk.prototype.size = proto_Size;
