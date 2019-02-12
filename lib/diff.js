const {
  Diff,
  DiffFindOptions,
  DiffOptions,
  Patch,
  Utils: {
    normalizeOptions
  }
} = require("../");

const {
  blobToBuffer: static_BlobToBuffer,
  indexToWorkdir: static_IndexToWorkdir,
  treeToIndex: static_TreeToIndex,
  treeToTree: static_TreeToTree,
  treeToWorkdir: static_TreeToWorkdir,
  treeToWorkdirWithIndex: static_TreeToWorkdirWithIndex
} = Diff;

const {
  findSimilar: proto_FindSimilar
} = Diff.prototype;

/**
 * Directly run a diff between a blob and a buffer.
 * @async
 * @param {Blob} old_blob Blob for old side of diff, or NULL for empty blob
 * @param {String} old_as_path Treat old blob as if it had this filename;
 * can be NULL
 * @param {String} buffer Raw data for new side of diff, or NULL for empty
 * @param {String} buffer_as_path Treat buffer as if it had this filename;
 * can be NULL
 * @param {DiffOptions} opts Options for diff, or NULL for default options
 * @param {Function} file_cb Callback for "file"; made once if there is a diff;
 * can be NULL
 * @param {Function} binary_cb Callback for binary files; can be NULL
 * @param {Function} hunk_cb Callback for each hunk in diff; can be NULL
 * @param {Function} line_cb Callback for each line in diff; can be NULL
 */
Diff.blobToBuffer = (
  oldBlob,
  oldAsPath,
  buffer,
  bufferAsPath,
  options,
  fileCb,
  binaryCb,
  hunkCb,
  lineCb
) => {
  let bufferText;
  let bufferLength;

  if (buffer instanceof Buffer) {
    bufferText = buffer.toString("utf8");
    bufferLength = Buffer.byteLength(buffer, "utf8");
  } else {
    bufferText = buffer;
    bufferLength = !buffer ? 0 : Buffer.byteLength(buffer, "utf8");
  }

  return static_BlobToBuffer(
    oldBlob,
    oldAsPath,
    bufferText,
    bufferLength,
    bufferAsPath,
    normalizeOptions(options, DiffOptions),
    fileCb,
    binaryCb,
    hunkCb,
    lineCb,
    null
  );
};

// Override Diff.indexToWorkdir to normalize opts
Diff.indexToWorkdir = (repo, index, options) =>
  static_IndexToWorkdir(repo, index, normalizeOptions(options, DiffOptions));

// Override Diff.treeToIndex to normalize opts
Diff.treeToIndex = (repo, tree, index, options) =>
  static_TreeToIndex(repo, tree, index, normalizeOptions(options, DiffOptions));

// Override Diff.treeToTree to normalize opts
Diff.treeToTree = (repo, fromTree, toTree, options) =>
  static_TreeToTree(repo, fromTree, toTree, normalizeOptions(options, DiffOptions));

// Override Diff.treeToWorkdir to normalize opts
Diff.treeToWorkdir = (repo, tree, options) =>
  static_TreeToWorkdir(repo, tree, normalizeOptions(options, DiffOptions));

// Override Diff.treeToWorkdir to normalize opts
Diff.treeToWorkdirWithIndex = (repo, tree, options) =>
  static_TreeToWorkdirWithIndex(repo, tree, normalizeOptions(options, DiffOptions));

// Override Diff.findSimilar to normalize opts
Diff.prototype.findSimilar = function(options) {
  return proto_FindSimilar.call(this, normalizeOptions(options, DiffFindOptions));
};

/**
 * Retrieve patches in this difflist
 *
 * @async
 * @return {Array<ConvenientPatch>} a promise that resolves to an array of
 *                                      ConvenientPatches
 */
Diff.prototype.patches = function() {
  return Patch.convenientFromDiff(this);
};
