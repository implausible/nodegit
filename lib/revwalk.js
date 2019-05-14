var NodeGit = require("../");
var Revwalk = NodeGit.Revwalk;

Object.defineProperty(Revwalk.prototype, "repo", {
  get: function () { return this.repository(); },
  configurable: true
});

var _sorting = Revwalk.prototype.sorting;
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
var fileHistoryWalk = Revwalk.prototype.fileHistoryWalk;
/**
 * @param {String} filePath
 * @param {Number} max_count
 * @async
 * @return {Array<historyEntry>}
 */
Revwalk.prototype.fileHistoryWalk = fileHistoryWalk;

/**
 * Get a number of commits.
 *
 * @async
 * @param  {Number} count (default: 10)
 * @return {Array<Commit>}
 */
Revwalk.prototype.getCommits = function(count) {
  count = count || 10;
  var promises = [];
  var walker = this;

  function walkCommitsCount(count) {
    if (count === 0) { return; }

    return walker.next().then(function(oid) {
      promises.push(walker.repo.getCommit(oid));
      return walkCommitsCount(count - 1);
    })
    .catch(function(error) {
      if (error.errno !== NodeGit.Error.CODE.ITEROVER) {
        throw error;
      }
    });
  }

  return walkCommitsCount(count).then(function() {
    return Promise.all(promises);
  });
};

/**
 * Walk the history grabbing commits until the checkFn called with the
 * current commit returns false.
 *
 * @async
 * @param  {Function} checkFn function returns false to stop walking
 * @return {Array}
 */
Revwalk.prototype.getCommitsUntil = function(checkFn) {
  var commits = [];
  var walker = this;

  function walkCommitsCb() {
    return walker.next().then(function(oid) {
      return walker.repo.getCommit(oid).then(function(commit) {
        commits.push(commit);
        if (checkFn(commit)) {
          return walkCommitsCb();
        }
      });
    })
    .catch(function(error) {
      if (error.errno !== NodeGit.Error.CODE.ITEROVER) {
        throw error;
      }
    });
  }

  return walkCommitsCb().then(function() {
    return commits;
  });
};

/**
 * Set the sort order for the revwalk. This function takes variable arguments
 * like `revwalk.sorting(NodeGit.RevWalk.Topological, NodeGit.RevWalk.Reverse).`
 *
 * @param {Number} sort
 */
Revwalk.prototype.sorting = function() {
  var sort = 0;

  for (var i = 0; i < arguments.length; i++) {
    sort |= arguments[i];
  }

  _sorting.call(this, sort);
};

/**
 * Walk the history from the given oid. The callback is invoked for each commit;
 * When the walk is over, the callback is invoked with `(null, null)`.
 *
 * @param  {Oid} oid
 * @param  {Function} callback
 */
Revwalk.prototype.walk = function(oid, callback) {
  var revwalk = this;

  this.push(oid);

  function walk() {
    revwalk.next().done(function(oid) {
      if (!oid) {
        if (typeof callback === "function") {
          return callback();
        }

        return;
      }

      revwalk.repo.getCommit(oid).then(function(commit) {
        if (typeof callback === "function") {
          callback(null, commit);
        }

        walk();
      });
    }, callback);
  }

  walk();
};

ng = require('@axosoft/nodegit');
safeGetTreeEntry = async (tree, filePath) => {
  try {
    return await tree.entryByPath(filePath);
  } catch {
    return null;
  }
};

compareTreeEntries = async (repo, currentTree, parentTree, filePath) => {
  const currentEntry = await safeGetTreeEntry(currentTree, filePath);
  const parentEntry = await safeGetTreeEntry(parentTree, filePath);

  if (!currentEntry && !parentEntry) {
    return { type: 'SAME', exist: false };
  }

  // The filePath was added
  if (currentEntry && !parentEntry) {
    const diff = await ng.Diff.treeToTree(repo, parentTree, currentTree);
    await diff.findSimilar();

    const numDeltas = diff.numDeltas();
    for (let i = 0; i < numDeltas; ++i) {
      const delta = diff.getDelta(i);
      if (delta.newFile().path() === filePath) {
        if (
          delta.status() === ng.Diff.DELTA.RENAMED
          || delta.oldFile().path() !== filePath
        ) {
          return {
            type: 'RENAMED',
            from: delta.oldFile().path()
          };
        }
        break;
      }
    }

    return { type: 'ADDED' };
  }

  // The filePath was deleted
  if (!currentEntry && parentEntry) {
    const diff = await ng.Diff.treeToTree(repo, parentTree, currentTree);
    await diff.findSimilar();

    const numDeltas = diff.numDeltas();
    for (let i = 0; i < numDeltas; ++i) {
      const delta = diff.getDelta(i);
      if (delta.oldFile().path() === filePath) {
        if (
          delta.status() === ng.Diff.DELTA.RENAMED
          || delta.newFile().path() !== filePath
        ) {
          return {
            type: 'RENAMED',
            to: delta.newFile().path()
          };
        }
        break;
      }
    }

    return { type: 'DELETED' };
  }


  if (
    currentEntry.sha() !== parentEntry.sha()
    || currentEntry.filemode() !== parentEntry.filemode()
  ) {
    return {
      type: 'MODIFIED'
    };
  }

  return { type: 'SAME', exist: true };
};

fileHistoryWalk = async (filePath) => {
  const repo = await ng.Repository.open(dev.reduxStore.getState().repo.repo.path());
  const headCommit = await repo.getHeadCommit();
  const sha = headCommit.sha();
  const history = [];
  const revwalk = repo.createRevWalk();
  revwalk.sorting(ng.Revwalk.SORT.TIME);
  revwalk.push(sha);

  try {
    let currentSha;
    while (currentSha = await revwalk.next()) {
      const currentCommit = await repo.getCommit(currentSha);
      const currentCommitTree = await currentCommit.getTree();
      const parentCount = currentCommit.parentcount();

      // Handle initial commit
      if (parentCount === 0) {
        if (await safeGetTreeEntry(currentCommitTree, filePath)) {
          history.push({
            commit: currentCommit,
            type: 'ADDED'
          });
        }
        continue;
      }

      // Simple parent lineage
      if (parentCount === 1) {
        const parentCommit = await repo.getCommit(currentCommit.parentId(0));
        const parentCommitTree = await parentCommit.getTree();
        const treeEntryDiff = await compareTreeEntries(repo, currentCommitTree, parentCommitTree, filePath);
        if (treeEntryDiff.type === 'SAME') { // No change occurred
          continue;
        }
        history.push({
          ...treeEntryDiff,
          commit: currentCommit
        });
        continue;
      }

      // Merge commits
      // - If the merge entry matches any of its parents,
      //      select the first matching parent and remove the rest from the revwalk
      // - If the merge entry does not match any of its parents,
      //      add the merge node to history and do not prune any branches from the revwalk

      let firstMatchingParentIndex = null;
      let fileExistsInCurrent = false;
      let fileExistsInSomeParent = false;
      for (let i = 0; i < parentCount; ++i) {
        const parentCommit = await repo.getCommit(currentCommit.parentId(i));
        const parentCommitTree = await parentCommit.getTree();
        const treeEntryDiff = await compareTreeEntries(repo, currentCommitTree, parentCommitTree, filePath);

        switch (treeEntryDiff.type) {
          case 'ADDED':
          case 'MODIFIED': {
            fileExistsInCurrent = true;
            break;
          }
          case 'DELETED': {
            fileExistsInSomeParent = true;
            break;
          }
          case 'RENAMED': {
            const { from, to } = treeEntryDiff;
            if (from) {
              fileExistsInCurrent = true;
            } else if (to) {
              fileExistsInSomeParent = true;
            }
            break;
          }
          case 'SAME': {
            if (treeEntryDiff.exists) {
              fileExistsInCurrent = true;
              fileExistsInSomeParent = true;
            }
            firstMatchingParentIndex = i;
            break;
          }
          default: {
            break;
          }
        }

        if (firstMatchingParentIndex !== null) {
          break;
        }
      }

      // Merge entry matches none of its parent entries
      if (firstMatchingParentIndex === null) {
        let mergeType;
        if (fileExistsInCurrent && fileExistsInSomeParent) {
          mergeType = 'MODIFIED';
        } else if (fileExistsInCurrent) {
          mergeType = 'ADDED';
        } else if (fileExistsInSomeParent) {
          mergeType = 'DELETED';
        } else {
          throw new Error('Merge entry should not match any of its parent entries.');
        }
        history.push({
          commit: currentCommit,
          isMerge: true,
          type: mergeType
        });
        continue;
      }

      // Merge entry matched a parent entry
      for (let i = 0; i < parentCount; ++i) {
        if (i === firstMatchingParentIndex) {
          continue;
        }

        revwalk.hide(currentcommit.parentId(i));
      }
    }
  } catch (e) {
    if (e.errno !== ng.Error.CODE.ITEROVER) {
      throw e;
    }
  }

  return history;
};

fileHistoryTest = async (filePath) => {
  const history = await fileHistoryWalk(filePath);
  console.log(history.map(({ commit }) => commit.sha()));
}
