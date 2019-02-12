const {
  ConvenientPatch
} = require("../");

const {
  hunks: proto_Hunks,
  isAdded: proto_IsAdded,
  isConflicted: proto_IsConflicted,
  isCopied: proto_IsCopied,
  isDeleted: proto_IsDeleted,
  isIgnored: proto_IsIgnored,
  isModified: proto_IsModified,
  isRenamed: proto_IsRenamed,
  isTypeChange: proto_IsTypeChange,
  isUnmodified: proto_IsUnmodified,
  isUnreadable: proto_IsUnreadable,
  isUntracked: proto_IsUntracked,
  lineStats: proto_LineStats,
  newFile: proto_NewFile,
  oldFile: proto_OldFile,
  size: proto_Size,
  status: proto_Status
} = ConvenientPatch.prototype;

/**
 * The hunks in this patch
 * @async
 * @return {Array<ConvenientHunk>}  a promise that resolves to an array of
 *                                      ConvenientHunks
 */
ConvenientPatch.prototype.hunks = proto_Hunks;

/**
 * Is this an added patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isAdded = proto_IsAdded;

/**
 * Is this a conflicted patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isConflicted = proto_IsConflicted;

/**
 * Is this a copied patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isCopied = proto_IsCopied;

/**
 * Is this a deleted patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isDeleted = proto_IsDeleted;

/**
 * Is this an ignored patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isIgnored = proto_IsIgnored;

/**
 * Is this an modified patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isModified = proto_IsModified;

/**
 * Is this a renamed patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isRenamed = proto_IsRenamed;

/**
 * Is this a type change?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isTypeChange = proto_IsTypeChange;

/**
 * Is this an unmodified patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isUnmodified = proto_IsUnmodified;

/**
 * Is this an undreadable patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isUnreadable = proto_IsUnreadable;

/**
 * Is this an untracked patch?
 * @return {Boolean}
 */
ConvenientPatch.prototype.isUntracked = proto_IsUntracked;

/**
 * @typedef lineStats
 * @type {Object}
 * @property {number} total_context # of contexts in the patch
 * @property {number} total_additions # of lines added in the patch
 * @property {number} total_deletions # of lines deleted in the patch
 */
/**
 * The line statistics of this patch (#contexts, #added, #deleted)
 * @return {lineStats}
 */
ConvenientPatch.prototype.lineStats = proto_LineStats;

/**
 * New attributes of the file
 * @return {DiffFile}
 */
ConvenientPatch.prototype.newFile = proto_NewFile;

/**
 * Old attributes of the file
 * @return {DiffFile}
 */
ConvenientPatch.prototype.oldFile = proto_OldFile;

/**
 * The number of hunks in this patch
 * @return {Number}
 */
ConvenientPatch.prototype.size = proto_Size;

/**
 * The status of this patch (unmodified, added, deleted)
 * @return {Number}
 */
ConvenientPatch.prototype.status = proto_Status;
