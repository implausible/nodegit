const { deprecate } = require('util');
const {
  Error: NGError,
  Revwalk
} = require("../");

const {
  sorting: proto_Sorting
} = Revwalk.prototype;

Object.defineProperty(Revwalk.prototype, "repo", {
  get: function () { return this.repository(); },
  configurable: true
});

/**
 * @typedef historyEntry
 * @type {Object}
 * @property {Commit} commit the commit for this entry
 * @property {Number} status the status of the file in the commit
 * @property {String} newName the new name that is provided when status is
 *                            renamed
 * @property {String} oldName the old name that is provided when status is
 *                            renamed
 */

/**
 * @param {String} filePath
 * @param {Number} max_count
 * @async
 * @return {Array<historyEntry>}
 */
Revwalk.prototype.fileHistoryWalk = Revwalk.prototype.fileHistoryWalk;

/**
 * Get a number of commits.
 *
 * @async
 * @param  {Number} count (default: 10)
 * @return {Array<Commit>}
 */
Revwalk.prototype.getCommits = async function(count = 10) {
  const commits = [];
  for (let i = count; i > 0; i--) {
    try {
      const oid = await this.next();
      const commit = await this.repo.getCommit(oid);
      commits.push(commit);
    } catch (e) {
      if (e.errno === NGError.CODE.ITEROVER) {
        return commits;
      }
      throw e;
    }
  }

  return commits;
};

/**
 * Walk the history grabbing commits until the checkFn called with the
 * current commit returns false.
 *
 * @async
 * @param  {Function} checkFn function returns false to stop walking
 * @return {Array}
 */
Revwalk.prototype.getCommitsWhile = async function(checkFn) {
  const commits = [];

  let shouldWalk;
  do {
    try {
      const oid = await this.next();
      const commit = await this.repo.getCommit(oid);
      commits.push(commit);
      shouldWalk = checkFn(commit);
    } catch (e) {
      if (e.errno !== NGError.CODE.ITEROVER) {
        throw e;
      }
      shouldWalk = false;
    }
  } while (shouldWalk);

  return commits;
};

/**
 * Walk the history grabbing commits until the checkFn called with the
 * current commit returns false.
 *
 * @deprecated
 * @async
 * @param  {Function} checkFn function returns false to stop walking
 * @return {Array}
 */
Revwalk.prototype.getCommitsUntil = deprecate(Revwalk.prototype.getCommitsWhile);

/**
 * Set the sort order for the revwalk. This function takes variable arguments
 * like `revwalk.sorting(NodeGit.RevWalk.Topological, NodeGit.RevWalk.Reverse).`
 *
 * @param {Number} sort
 */
Revwalk.prototype.sorting = function(...args) {
  const sorting = args.reduce((_sorting, sortArg) => _sorting | sortArg, 0);
  return proto_Sorting.call(this, sorting);
};

/**
 * Walk the history from the given oid. The callback is invoked for each commit;
 * When the walk is over, the callback is invoked with `(null, null)`.
 *
 * @param  {Oid} oid
 * @param  {Function} callback
 */
Revwalk.prototype.walk = async function(oid, callback) {
  this.push(oid);

  let nextOid;
  try {
    while (nextOid = await this.next()) {
      try {
        const commit = await this.repo.getCommit(nextOid);
        callback(null, commit);
      } catch (e) {
        callback(e);
      }
    }
  } catch (e) {
    callback(e);
  }
};
