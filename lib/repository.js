const fse = require("fs-extra");
const fp = require("lodash/fp");
const path = require("path");
const {
  AnnotatedCommit,
  Blob,
  Branch,
  Checkout,
  Commit,
  Diff,
  Error: NGError,
  Filter,
  FilterList,
  Merge,
  MergeOptions,
  Rebase,
  Reference,
  Remote,
  Repository,
  RepositoryInitOptions,
  Revwalk,
  Signature,
  Status,
  StatusFile,
  StatusList,
  Submodule,
  Tag,
  Tree,
  TreeBuilder,
  Utils: {
    normalizeOptions,
    shallowClone
  }
} = require("../");

const {
  discover: static_Discover,
  initExt: static_InitExt
} = Repository;

const {
  fetchheadForeach: proto_FetchheadForeach,
  mergeheadForeach: proto_MergeheadForeach
} = Repository.prototype;

const applySelectedLinesToTarget = async (
  originalContent,
  newLines,
  pathHunks,
  isStaged,
  reverse
) => {
  // 43: ascii code for '+'
  // 45: ascii code for '-'
  const lineTypes = {
    ADDED: !reverse ? 43 : 45,
    DELETED: !reverse ? 45 : 43
  };
  const oldLines = originalContent.toString().split("\n");
  let newContent = "";
  let oldIndex = 0;


  // if no selected lines were sent, return the original content
  if (!newLines || newLines.length === 0) {
    return originalContent;
  }

  const lineEqualsFirstNewLine = (hunkLine) =>
    hunkLine.oldLineno() === newLines[0].oldLineno()
    && hunkLine.newLineno() === newLines[0].newLineno()


  const processSelectedLine = (hunkLine) => {
    // if this hunk line is a selected line find the selected line
    const newLine = newLines.filter((nLine) =>
      hunkLine.oldLineno() === nLine.oldLineno()
      && hunkLine.newLineno() === nLine.newLineno()
    );

    if (hunkLine.content().indexOf("\\ No newline at end of file") !== -1) {
      return false;
    }

    // determine what to add to the new content
    if (
      (isStaged && newLine && newLine.length > 0)
      || (!isStaged && (!newLine || newLine.length === 0))
    ) {
      if (hunkLine.origin() !== lineTypes.ADDED) {
        newContent += hunkLine.content();
      }
      if (
        (isStaged && hunkLine.origin() !== lineTypes.DELETED)
        || (!isStaged && hunkLine.origin() !== lineTypes.ADDED)
      ) {
        oldIndex++;
      }
    } else {
      switch (hunkLine.origin()) {
        case lineTypes.ADDED:
          newContent += hunkLine.content();
          if (isStaged) {
            oldIndex++;
          }
          break;
        case lineTypes.DELETED:
          if (!isStaged) {
            oldIndex++;
          }
          break;
        default:
          newContent += oldLines[oldIndex++];
          if (oldIndex < oldLines.length) {
            newContent += "\n";
          }
          break;
      }
    }
  };

  const results = await Promise.all(pathHunks.map(
    (pathHunk) => pathHunk.lines()
  ));

  for (let i = 0; i < results.length && newContent.length < 1; i++) {
    const hunkStart = isStaged || reverse
      ? pathHunks[i].newStart()
      : pathHunks[i].oldStart();
    const lines = results[i];

    if (lines.filter(lineEqualsFirstNewLine).length > 0) {
      // add content that is before the hunk
      while (hunkStart > (oldIndex + 1)) {
        newContent += oldLines[oldIndex++] + "\n";
      }

      // modify the lines of the hunk according to the selection
      lines.forEach(processSelectedLine);

      // add the rest of the file
      while (oldLines.length > oldIndex) {
        newContent += oldLines[oldIndex++]
          + (oldLines.length > oldIndex ? "\n" : "");
      }
    }
  }

  return newContent;
}

const getPathHunks = async (repo, index, filePath, isStaged, additionalDiffOptions) => {
  let diff;
  if (isStaged) {
    const diffOptions = additionalDiffOptions
      ? { flags: additionalDiffOptions }
      : undefined;
    const commit = await repo.getHeadCommit();
    const tree = await commit.getTree();
    diff = await Diff.treeToIndex(repo, tree, index, diffOptions);
  } else {
    const diffOptions = {
      flags: Diff.OPTION.SHOW_UNTRACKED_CONTENT
        | Diff.OPTION.RECURSE_UNTRACKED_DIRS
        | (additionalDiffOptions || 0)
    };
    diff = await Diff.indexToWorkdir(repo, index, diffOptions);
  }

  const status = await Status.file(repo, filePath);
  if (
    !(status & Status.STATUS.WT_MODIFIED)
    && !(status & Status.STATUS.INDEX_MODIFIED)
  ) {
    throw new Error("Selected staging is only available on modified files.");
  }

  const patches = await diff.patches();
  const pathPatch = patches.filter((patch) =>
    patch.newFile().path() === filePath
  );

  if (pathPatch.length !== 1) {
    throw new Error("No differences found for this file.");
  }

  return pathPatch[0].hunks();
}

const getReflogMessageForCommit = (commit) => {
  const parentCount = commit.parentcount();

  let commitType;
  if (parentCount >= 2) {
    commitType = " (merge)";
  } else if (parentCount == 0) {
    commitType = " (initial)";
  } else {
    commitType = "";
  }

  return `commit${commitType}: ${commit.summary()}`;
};

/**
 * Goes through a rebase's rebase operations and commits them if there are
 * no merge conflicts
 *
 * @param {Repository}  repository    The repository that the rebase is being
 *                                    performed in
 * @param {Rebase}      rebase        The current rebase being performed
 * @param {Signature}   signature     Identity of the one performing the rebase
 * @param {Function}    beforeNextFn  Callback to be called before each
 *                                    invocation of next(). If the callback
 *                                    returns a promise, the next() will be
 *                                    called when the promise resolves.
 * @param {Function}   beforeFinishFn Callback called before the invocation
 *                                    of finish(). If the callback returns a
 *                                    promise, finish() will be called when the
 *                                    promise resolves. This callback will be
 *                                    provided a detailed overview of the rebase
 * @return {Int|Index} An error code for an unsuccesful rebase or an index for
 *                     a rebase with conflicts
 */
const performRebase = async (
  repository,
  rebase,
  signature,
  beforeNextFn,
  beforeFinishFn
) => {
  /* In the case of FF merges and a beforeFinishFn, this will fail
   * when looking for 'rewritten' so we need to handle that case.
   */
  const readRebaseMetadataFile = async (fileName, continueOnError) => {
    try {
      const metadataContents = await fse.readFile(
        path.join(repository.path(), "rebase-merge", fileName),
        { encoding: "utf8" }
      );

      return metadataContents.trim();
    } catch (error) {
      if (continueOnError) {
        return null;
      }

      throw error;
    }
  };

  const calcHeadName = (input) =>
    input.replace(/refs\/heads\/(.*)/, "$1");

  if (beforeNextFn) {
    await beforeNextFn(rebase);
  }

  try {
    await rebase.next();
  } catch (error) {
    if (!error || error.errno !== NGError.CODE.ITEROVER) {
      throw error;
    }

    const calcRewritten = (rewritten) => rewritten
      ? rewritten.split("\n").map((s) => s.split(" "))
      : null;

    if (beforeFinishFn) {
      const [
        ontoName,
        ontoSha,
        originalHeadName,
        originalHeadSha,
        rewritten
      ] = await Promise.all([
        readRebaseMetadataFile("onto_name"),
        readRebaseMetadataFile("onto"),
        readRebaseMetadataFile("head-name").then(calcHeadName),
        readRebaseMetadataFile("orig-head"),
        readRebaseMetadataFile("rewritten", true)
      ]);

      const calcRewritten = (rewritten) => rewritten
        ? rewritten.split("\n").map((s) => s.split(" "))
        : null;

      await beforeFinishFn({
        ontoName,
        ontoSha,
        originalHeadName,
        originalHeadSha,
        rebase,
        rewritten: calcRewritten(rewritten)
      });
    }

    return rebase.finish(signature);
  }

  const index = await repository.refreshIndex();
  if (index.hasConflicts()) {
    throw index;
  }

  await rebase.commit(null, signature);

  return performRebase(
    repository,
    rebase,
    signature,
    beforeNextFn,
    beforeFinishFn
  );
};

/**
 * Creates a branch with the passed in name pointing to the commit
 *
 * @async
 * @param {String} startPath The base path where the lookup starts.
 * @param {Number} acrossFs If non-zero, then the lookup will not stop when a
                            filesystem device change is detected while exploring
                            parent directories.
 * @param {String} ceilingDirs A list of absolute symbolic link free paths.
                              the search will stop if any of these paths
                              are hit. This may be set to null
 * @return {String} Path of the git repository
 */
Repository.discover = async (startPath, acrossFs, ceilingDirs) => {
  const foundPath = await static_Discover(startPath, acrossFs, ceilingDirs);
  return path.resolve(foundPath);
};

Repository.initExt = (repoPath, options) =>
  static_InitExt(repoPath, normalizeOptions(options, RepositoryInitOptions));


Repository.getReferences = async (repo, type, refNamesOnly) => {
  const refList = await Reference.list(repo);
  const listOfMaybeRefs = await Promise.all(refList.map(async (refName) => {
    const ref = await Reference.lookup(repo, refName);

    if (type === Reference.TYPE.LISTALL || ref.type() === type) {
      if (refNamesOnly) {
        return refName;
      }
    }

    if (ref.isSymbolic()) {
      try {
        const resolvedRef = await ref.resolve();
        resolvedRef.repo = repo;
        return resolvedRef;
      } catch (error) {
        // If we can't resolve the ref then just ignore it.
        return null;
      }
    }

    return ref;
  }));

  // Only return refs that were not nullified by resolution.
  return listOfMaybeRefs.filter(a => a);
};

/**
 * This will set the HEAD to point to the local branch and then attempt
 * to update the index and working tree to match the content of the
 * latest commit on that branch
 *
 * @async
 * @param {String|Reference} branch the branch to checkout
 * @param {Object|CheckoutOptions} opts the options to use for the checkout
 */
Repository.prototype.checkoutBranch = async function(branch, options) {
  const ref = await this.getReference(branch);
  if (!ref.isBranch()) {
    return false;
  }

  return this.checkoutRef(ref, options);
};

/**
 * This will set the HEAD to point to the reference and then attempt
 * to update the index and working tree to match the content of the
 * latest commit on that reference
 *
 * @async
 * @param {Reference} reference the reference to checkout
 * @param {Object|CheckoutOptions} opts the options to use for the checkout
 */
Repository.prototype.checkoutRef = async function(reference, options = {}) {
  // TODO don't mutate arguments
  if (!options.checkoutStrategy) {
    options.checkoutStrategy = Checkout.STRATEGY.SAFE |Checkout.STRATEGY.RECREATE_MISSING;
  }

  const commit = await this.getReferenceCommit(reference.name());
  const tree = await commit.getTree();
  await Checkout.tree(this, tree, options);
  return this.setHead(reference.name());
};

/**
 * Continues an existing rebase
 *
 * @async
 * @param {Signature}  signature     Identity of the one performing the rebase
 * @param {Function}   beforeNextFn  Callback to be called before each step
 *                                   of the rebase. If the callback returns a
 *                                   promise, the rebase will resume when the
 *                                   promise resolves. The rebase object is
 *                                   is passed to the callback.
 * @param {Function}   beforeFinishFn Callback called before the invocation
 *                                    of finish(). If the callback returns a
 *                                    promise, finish() will be called when the
 *                                    promise resolves. This callback will be
 *                                    provided a detailed overview of the rebase
 * @param {RebaseOptions} rebaseOptions Options to initialize the rebase object
 *                                      with
 * @return {Oid|Index}  A commit id for a succesful merge or an index for a
 *                      rebase with conflicts
 */
Repository.prototype.continueRebase = async function(
  maybeSignature,
  beforeNextFn,
  beforeFinishFn,
  rebaseOptions
) {
  const signature = maybeSignature || await this.defaultSignature();
  const index = await this.refreshIndex();

  if (index.hasConflicts()) {
    throw index;
  }

  const rebase = await Rebase.open(this, rebaseOptions);

  try {
    await rebase.commit(null, signature);
  } catch (e) {
    if (!e || e.errorno !== NGError.CODE.EAPPLIED) {
      throw e;
    }
  }

  const error = await performRebase(
    this,
    rebase,
    signature,
    beforeNextFn,
    beforeFinishFn
  );

  if (error) {
    throw error;
  }

  return this.getBranchCommit("HEAD");
};

/**
 * Creates a branch with the passed in name pointing to the commit
 *
 * @async
 * @param {String} name Branch name, e.g. "master"
 * @param {Commit|String|Oid} commit The commit the branch will point to
 * @param {Boolean} force Overwrite branch if it exists
 * @return {Reference}
 */
Repository.prototype.createBranch = async function(name, commit, force) {
  let resolvedCommit = commit;

  if (!(commit instanceof Commit)) {
    resolvedCommit = await this.getCommit(commit);
  }

  return Branch.create(
    this,
    name,
    resolvedCommit,
    force ? 1 : 0
  );
};

/**
 * Create a blob from a buffer
 *
 * @async
 * @param {Buffer} buffer
 * @return {Oid}
 */
Repository.prototype.createBlobFromBuffer = function(buffer) {
  return Blob.createFromBuffer(this, buffer, buffer.length);
};

/**
 * Create a commit
 *
 * @async
 * @param {String} updateRef
 * @param {Signature} author
 * @param {Signature} committer
 * @param {String} message
 * @param {Oid|String} Tree
 * @param {Array} parents
 * @return {Oid} The oid of the commit
 */
Repository.prototype.createCommit = async function(
  updateRef,
  author,
  committer,
  message,
  treeOid,
  parents
) {
  const tree = await this.getTree(treeOid);
  const parentCommits = await Promise.all((parents || []).map(
    (parentOid) => this.getCommit(parentOid)
  ));

  return Commit.create(
    this,
    updateRef,
    author,
    committer,
    null /* use default message encoding */,
    message,
    tree,
    parentCommits.length,
    parentCommits
  );
};

/**
 * Create a commit
 *
 * @async
 * @param {Signature} author
 * @param {Signature} committer
 * @param {String} message
 * @param {Oid|String} treeOid
 * @param {Array} parents
 * @return {String} The content of the commit object
 *                  as a string
 */
Repository.prototype.createCommitBuffer = async function(
  author,
  committer,
  message,
  treeOid,
  parents
) {
  const tree = await this.getTree(treeOid);
  const parentCommits = await Promise.all((parents || []).map(
    (parentOid) => this.getCommit(parentOid)
  ));

  return Commit.createBuffer(
    this,
    author,
    committer,
    null /* use default message encoding */,
    message,
    tree,
    parentCommits.length,
    parentCommits
  );
};

/**
 * Create a commit that is digitally signed
 *
 * @async
 * @param {String} updateRef
 * @param {Signature} author
 * @param {Signature} committer
 * @param {String} message
 * @param {Tree|Oid|String} Tree
 * @param {Array} parents
 * @param {Function} onSignature Callback to be called with string to be signed
 * @return {Oid} The oid of the commit
 */
Repository.prototype.createCommitWithSignature = async function(
  updateRef,
  author,
  committer,
  message,
  treeOid,
  parents,
  onSignature
) {
  const tree = await this.getTree(treeOid);
  const parentCommits = await Promise.all((parents || []).map(
    (parentOid) => this.getCommit(parentOid)
  ));

  const commitContentResult = await Commit.createBuffer(
    this,
    author,
    committer,
    null /* use default message encoding */,
    message,
    tree,
    parentCommits.length,
    parentCommits
  );
  const commitContent = commitContentResult.endsWith("\n")
    ? commitContentResult
    : `${commitContentResult}\n`;

  const { code, field, signedData } = await onSignature(commitContent);

  let newCommitOid;
  let skippedSigning = false;
  switch (code) {
    case NGError.CODE.OK:
      newCommitOid = await Commit.createWithSignature(
        this,
        commitContent,
        signedData,
        field
      );
      break;
    case NGError.CODE.PASSTHROUGH:
      skippedSigning = true;
      newCommitOid = await Commit.create(
        this,
        updateRef,
        author,
        committer,
        null /* use default message encoding */,
        message,
        tree,
        parents.length,
        parents
      );
      break;
    default: {
      const error = new Error(
        "Repository.prototype.createCommitWithSignature " +
        `threw with error code ${code}`
      );
      error.errno = code;
      throw error;
    }
  }

  if (!updateRef || skippedSigning) {
    return newCommitOid;
  }

  const newCommit = await this.getCommit(newCommitOid);
  await Reference.updateTerminal(
    this,
    updateRef,
    newCommitOid,
    getReflogMessageForCommit(newCommit),
    committer
  );

  return newCommitOid;
};

/**
 * Creates a new commit on HEAD from the list of passed in files
 *
 * @async
 * @param {Array} filesToAdd
 * @param {Signature} author
 * @param {Signature} committer
 * @param {String} message
 * @return {Oid} The oid of the new commit
 */
Repository.prototype.createCommitOnHead = async function(
  filesToAdd,
  author,
  committer,
  message
) {
  const index = await this.refreshIndex();

  for (const fileToAdd of (filesToAdd || [])) {
    await index.addByPath(fileToAdd);
  }

  await index.write();
  const treeOid = await index.writeTree();
  const parent = await this.getHeadCommit();

  return this.createCommit(
    "HEAD",
    author,
    committer,
    message,
    treeOid,
    parent !== null ? [parent] : parent // To handle a fresh repo with no commits
  );
};

/**
 * Creates a new lightweight tag
 *
 * @async
 * @param {String|Oid} String sha or Oid
 * @param {String} name the name of the tag
 * @return {Reference}
 */
Repository.prototype.createLightweightTag = async function(oid, name) {
  const commit = await Commit.lookup(this, oid);

  // Final argument is `force` which overwrites any previous tag
  await Tag.createLightweight(this, name, commit, 0);
  return Reference.lookup(this, `refs/tags/${name}`);
};

/**
 * Instantiate a new revision walker for browsing the Repository"s history.
 * See also `Commit.prototype.history()`
 *
 * @return {Revwalk}
 */
Repository.prototype.createRevWalk = function() {
  return Revwalk.create(this);
};

/**
 * Creates a new annotated tag
 *
 * @async
 * @param {String|Oid} String sha or Oid
 * @param {String} name the name of the tag
 * @param {String} message the description that will be attached to the
 * annotated tag
 * @return {Tag}
 */
Repository.prototype.createTag = async function(oid, name, message) {
  const signature = await this.defaultSignature();
  const commit = await Commit.lookup(this, oid);
  // Final argument is `force` which overwrites any previous tag
  const tagOid = await Tag.create(this, name, commit, signature, message, 0);
  return this.getTag(tagOid);
};

/**
 * Gets the default signature for the default user and now timestamp
 *
 * @async
 * @return {Signature}
 */
Repository.prototype.defaultSignature = async function() {
  try {
    const signature = await Signature.default(this);
    if (!signature || !signature.name()) {
      return Signature.now("unknown", "unknown@example.com");
    }
    return signature;
  } catch (e) {
    return Signature.now("unknown", "unknown@example.com");
  }
};

/**
 * Deletes a tag from a repository by the tag name.
 *
 * @async
 * @param {String} Short or full tag name
 */
Repository.prototype.deleteTagByName = function(name) {
  return Tag.delete(
    this,
    ~name.indexOf("refs/tags/")
      ? name.substr(10)
      : name
  );
};

/**
 * Discard line selection of a specified file.
 * Assumes selected lines are unstaged.
 *
 * @async
 * @param {String} filePath The relative path of this file in the repo
 * @param {Array} selectedLines The array of DiffLine objects
 *                            selected for discarding
 * @return {Number} 0 or an error code
 */
Repository.prototype.discardLines = async function(
  filePath,
  selectedLines,
  additionalDiffOptions
) {
  const fullFilePath = path.join(this.workdir(), filePath);
  const index = await this.refreshIndex();
  const cleanFilterList = await FilterList.load(
    this,
    null,
    filePath,
    Filter.MODE.CLEAN,
    Filter.FLAG.DEFAULT
  );

  const originalContent = cleanFilterList
    ? await cleanFilterList.applyToFile(this, filePath)
    : await fse.readFile(fullFilePath, "utf8");

  const hunks = await getPathHunks(this, index, filePath, false, additionalDiffOptions);
  const newContent = await applySelectedLinesToTarget(
    originalContent,
    selectedLines,
    hunks,
    false,
    true
  );

  const smudgeFilterList = await FilterList.load(
    this,
    null,
    filePath,
    Filter.MODE.SMUDGE,
    Filter.FLAG.DEFAULT
  );

  const filteredContent = smudgeFilterList
    // We need the constructor for the check in NodeGit's C++ layer
    // to accept an object, and this seems to be a nice way to do it
    ? await smudgeFilterList.applyToData(new String(newContent))
    : newContent;

  return fse.writeFile(fullFilePath, filteredContent);
};

/**
 * Fetches from a remote
 *
 * @async
 * @param {String|Remote} remote
 * @param {Object|FetchOptions} fetchOptions Options for the fetch, includes
 *                                           callbacks for fetching
 */
Repository.prototype.fetch = async function(remote, fetchOptions) {
  const resolvedRemote = await this.getRemote(remote);
  await resolvedRemote.fetch(null, fetchOptions, `Fetch from ${remote}`);
  return resolvedRemote.disconnect();
};

/**
 * Fetches from all remotes. This is done in series due to deadlocking issues
 * with fetching from many remotes that can happen.
 *
 * @async
 * @param {Object|FetchOptions} fetchOptions Options for the fetch, includes
 *                                           callbacks for fetching
 * @param {Function} callback
 */
Repository.prototype.fetchAll = async function(fetchOptions = {}) {
  const createCallbackWrapper = (fn, remote) => (...args) => fn(...args, remote);

  const remotes = await this.getRemotes();

  for (const remote of remotes) {
    const fetchOptionsWithWrappedCallbacks = shallowClone(fetchOptions);
    const callbacks = shallowClone(fetchOptions.callbacks);
    const { credentials, certificateCheck, transferProgress } = callbacks;

    if (credentials) {
      callbacks.credentials = createCallbackWrapper(credentials, remote);
    }

    if (certificateCheck) {
      callbacks.certificateCheck = createCallbackWrapper(certificateCheck, remote);
    }

    if (transferProgress) {
      callbacks.transferProgress = createCallbackWrapper(transferProgress, remote);
    }

    fetchOptionsWithWrappedCallbacks.callbacks = callbacks;

    await this.fetch(remote, fetchOptionsWithWrappedCallbacks);
  }
};

/**
 * @async
 * @param {FetchheadForeachCb} callback The callback function to be called on
 * each entry
 */
Repository.prototype.fetchheadForeach = function(callback) {
  return proto_FetchheadForeach.call(this, callback, null);
};

/**
 * Retrieve the blob represented by the oid.
 *
 * @async
 * @param {String|Oid} String sha or Oid
 * @return {Blob}
 */
Repository.prototype.getBlob = function(oid) {
  return Blob.lookup(this, oid);
};

/**
* Look up a branch. Alias for `getReference`
*
* @async
* @param {String|Reference} name Ref name, e.g. "master", "refs/heads/master"
*                              or Branch Ref
* @return {Reference}
*/
Repository.prototype.getBranch = function(name) {
  return this.getReference(name);
};

/**
* Look up a branch's most recent commit. Alias to `getReferenceCommit`
*
* @async
* @param {String|Reference} name Ref name, e.g. "master", "refs/heads/master"
*                          or Branch Ref
* @return {Commit}
*/
Repository.prototype.getBranchCommit = function(name) {
  return this.getReferenceCommit(name);
};

/**
 * Retrieve the commit identified by oid.
 *
 * @async
 * @param {String|Oid} String sha or Oid
 * @return {Commit}
 */
Repository.prototype.getCommit = function(oid) {
  return Commit.lookup(this, oid);
};

/**
 * Gets the branch that HEAD currently points to
 * Is an alias to head()
 *
 * @async
 * @return {Reference}
 */
Repository.prototype.getCurrentBranch = function() {
  return this.head();
};

/**
 * Retrieve the commit that HEAD is currently pointing to
 *
 * @async
 * @return {Commit}
 */
Repository.prototype.getHeadCommit = async function() {
  try {
    const head = await Reference.nameToId(this, "HEAD");
    return await this.getCommit(head);
  } catch (e) {
    return null;
  }
};

/**
 * Retrieve the master branch commit.
 *
 * @async
 * @return {Commit}
 */
Repository.prototype.getMasterCommit = function() {
  return this.getBranchCommit("master");
};

/**
 * Lookup the reference with the given name.
 *
 * @async
 * @param {String|Reference} name Ref name, e.g. "master", "refs/heads/master"
 *                               or Branch Ref
 * @return {Reference}
 */
Repository.prototype.getReference = async function(name) {
  let reference = await Reference.dwim(this, name);

  if (reference.isSymbolic()) {
    reference = await reference.resolve();
    reference.repo = this;
  }

  return reference;
};

/**
 * Look up a refs's commit.
 *
 * @async
 * @param {String|Reference} name Ref name, e.g. "master", "refs/heads/master"
 *                              or Branch Ref
 * @return {Commit}
 */
Repository.prototype.getReferenceCommit = async function(name) {
  const reference = await this.getReference(name);
  return this.getCommit(reference.target());
};

/**
 * Lookup reference names for a repository.
 *
 * @async
 * @param {Reference.TYPE} type Type of reference to look up
 * @return {Array<String>}
 */
Repository.prototype.getReferenceNames = function(type) {
  return Repository.getReferences(this, type, true);
};

/**
 * Lookup references for a repository.
 *
 * @async
 * @param {Reference.TYPE} type Type of reference to look up
 * @return {Array<Reference>}
 */
Repository.prototype.getReferences = function(type) {
  return Repository.getReferences(this, type, false);
};

/**
 * Gets a remote from the repo
 *
 * @async
 * @param {String|Remote} remote
 * @param {Function} callback
 * @return {Remote} The remote object
 */
Repository.prototype.getRemote = async function(remote) {
  if (remote instanceof Remote) {
    return remote;
  }

  return Remote.lookup(this, remote);
};

/**
* Lists out the remotes in the given repository.
*
* @async
* @return {Object} Promise object.
*/
Repository.prototype.getRemotes = function() {
  return Remote.list(this);
};

/**
 * Get the status of a repo to it's working directory
 *
 * @async
 * @param {obj} opts
 * @return {Array<StatusFile>}
 */
Repository.prototype.getStatus = async function(options) {
  const defaultedOptions = options || {
    flags: Status.OPT.INCLUDE_UNTRACKED
      | Status.OPT.RECURSE_UNTRACKED_DIRS
  };

  const statusFiles = [];
  await Status.foreachExt(this, defaultedOptions, (path, status) => {
    statusFiles.push(new StatusFile({ path, status }));
  });

  return statusFiles;
};

/**
 * Get extended statuses of a repo to it's working directory. Status entries
 * have `status`, `headToIndex` delta, and `indexToWorkdir` deltas
 *
 * @async
 * @param {obj} opts
 * @return {Array<StatusFile>}
 */
Repository.prototype.getStatusExt = async function(maybeOptions) {
  const statuses = [];

  const options = maybeOptions || {
    flags: Status.OPT.INCLUDE_UNTRACKED
      | Status.OPT.RECURSE_UNTRACKED_DIRS
      | Status.OPT.RENAMES_INDEX_TO_WORKDIR
      | Status.OPT.RENAMES_HEAD_TO_INDEX
      | Status.OPT.RENAMES_FROM_REWRITES
  };
  const statusList = await StatusList.create(this, options);

  for (let i = 0; i < statusList.entrycount(); i++) {
    const entry = Status.byIndex(statusList, i);
    statuses.push(new StatusFile({ entry }));
  }

  return statuses;
};

/**
 * Get the names of the submodules in the repository.
 *
 * @async
 * @return {Array<String>}
 */
Repository.prototype.getSubmoduleNames = async function() {
  const names = [];
  await Submodule.foreach(this, (submodule, name) => { names.push(name); });
  return names;
};

/**
 * Retrieve the tag represented by the oid.
 *
 * @async
 * @param {String|Oid} String sha or Oid
 * @return {Tag}
 */
Repository.prototype.getTag = function(oid) {
  return Tag.lookup(this, oid);
};

/**
 * Retrieve the tag represented by the tag name.
 *
 * @async
 * @param {String} Short or full tag name
 * @return {Tag}
 */
Repository.prototype.getTagByName = async function(name) {
  const oid = await Reference.nameToId(
    this,
    ~name.indexOf("refs/tags/")
      ? name
      : `refs/tags/${name}`
  );
  return Tag.lookup(this, oid);
};

/**
 * Retrieve the tree represented by the oid.
 *
 * @async
 * @param {String|Oid} String sha or Oid
 * @return {Tree}
 */
Repository.prototype.getTree = async function(oid) {
  return Tree.lookup(this, oid);
};

/**
 * Returns true if the repository is in the APPLY_MAILBOX or
 * APPLY_MAILBOX_OR_REBASE state.
 * @return {Boolean}
 */
Repository.prototype.isApplyingMailbox = function() {
  const state = this.state();
  return state === Repository.STATE.APPLY_MAILBOX
    || state === Repository.STATE.APPLY_MAILBOX_OR_REBASE;
};

/**
 * Returns true if the repository is in the BISECT state.
 * @return {Boolean}
 */
Repository.prototype.isBisecting = function() {
  return this.state() === Repository.STATE.BISECT;
};

/**
 * Returns true if the repository is in the CHERRYPICK state.
 * @return {Boolean}
 */
Repository.prototype.isCherrypicking = function() {
  return this.state() === Repository.STATE.CHERRYPICK;
};

/**
 * Returns true if the repository is in the default NONE state.
 * @return {Boolean}
 */
Repository.prototype.isDefaultState = function() {
  return this.state() === Repository.STATE.NONE;
};

/**
 * Returns true if the repository is in the MERGE state.
 * @return {Boolean}
 */
Repository.prototype.isMerging = function() {
  return this.state() === Repository.STATE.MERGE;
};

/**
 * Returns true if the repository is in the REBASE, REBASE_INTERACTIVE, or
 * REBASE_MERGE state.
 * @return {Boolean}
 */
Repository.prototype.isRebasing = function() {
  const state = this.state();
  return state === Repository.STATE.REBASE
    || state === Repository.STATE.REBASE_INTERACTIVE
    || state === Repository.STATE.REBASE_MERGE;
};

/**
 * Returns true if the repository is in the REVERT state.
 * @return {Boolean}
 */
Repository.prototype.isReverting = function() {
  return this.state() === Repository.STATE.REVERT;
};

/**
 * Rebases a branch onto another branch
 *
 * @async
 * @param {String}     branch
 * @param {String}     upstream
 * @param {String}     onto
 * @param {Signature}  signature     Identity of the one performing the rebase
 * @param {Function}   beforeNextFn  Callback to be called before each step
 *                                   of the rebase.  If the callback returns a
 *                                   promise, the rebase will resume when the
 *                                   promise resolves.  The rebase object is
 *                                   is passed to the callback.
 * @param {Function}   beforeFinishFn Callback called before the invocation
 *                                    of finish(). If the callback returns a
 *                                    promise, finish() will be called when the
 *                                    promise resolves. This callback will be
 *                                    provided a detailed overview of the rebase
 * @param {RebaseOptions} rebaseOptions Options to initialize the rebase object
 *                                      with
 * @return {Oid|Index}  A commit id for a succesful merge or an index for a
 *                      rebase with conflicts
 */
Repository.prototype.rebaseBranches = async function(
  branch,
  upstream,
  onto,
  signature,
  beforeNextFn,
  beforeFinishFn,
  rebaseOptions
) {
  const resolvedSignature = signature || await this.defaultSignature();
  const branchAnnotatedCommit = await AnnotatedCommit.fromRef(
    this,
    await this.getReference(branch)
  );
  const maybeUpstreamAnnotatedCommit = upstream
    ? await AnnotatedCommit.fromRef(
      this,
      await this.getReference(upstream)
    )
    : null;
  const maybeOntoAnnotatedCommit = onto
    ? await AnnotatedCommit.fromRef(
      this,
      await this.getReference(onto)
    )
    : null;

  if (maybeUpstreamAnnotatedCommit) {
    const oid = await Merge.base(
      this,
      branchAnnotatedCommit.id(),
      maybeUpstreamAnnotatedCommit.id()
    );
    if (oid.toString() === branchAnnotatedCommit.id().toString()) {
      // we just need to fast-forward
      await this.mergeBranches(branch, upstream, null, null, (rebaseOptions || {}).mergeOptions);
      await this.checkoutBranch(branch);
      return this.getBranchCommit("HEAD");
    } else if (oid.toString() === maybeUpstreamAnnotatedCommit.id().toString()) {
      // 'branch' is already on top of 'upstream'
      // checkout 'branch' to match the behavior of rebase
      await this.checkoutBranch(branch);
      return this.getBranchCommit("HEAD");
    }
  }

  const rebase = await Rebase.init(
    this,
    branchAnnotatedCommit,
    maybeUpstreamAnnotatedCommit,
    maybeOntoAnnotatedCommit,
    rebaseOptions
  );

  const error = await performRebase(this, rebase, resolvedSignature, beforeNextFn, beforeFinishFn);
  if (error) {
    throw error;
  }

  return this.getBranchCommit("HEAD");
};

/**
 * Grabs a fresh copy of the index from the repository. Invalidates
 * all previously grabbed indexes
 *
 * @async
 * @return {Index}
 */
Repository.prototype.refreshIndex = async function() {
  this.setIndex(); // clear the index
  return this.index();
};

/**
 * Merge a branch onto another branch
 *
 * @async
 * @param {String|Reference}        to
 * @param {String|Reference}        from
 * @param {Signature}         signature
 * @param {Merge.PREFERENCE}  mergePreference
 * @param {MergeOptions}      mergeOptions
 * @return {Oid|Index}  A commit id for a succesful merge or an index for a
 *                      merge with conflicts
 */
Repository.prototype.mergeBranches = async function(
  to,
  from,
  signature,
  mergePreference = Merge.PREFERENCE.NONE,
  mergeOptions,
  processMergeMessageCallback = (m) => m
) {
  const resolvedSignature = signature || await this.defaultSignature();

  const toBranch = await this.getBranch(to);
  const toCommit = await this.getBranchCommit(toBranch);
  const fromBranch = await this.getBranch(from);
  const fromCommit = await this.getBranchCommit(fromBranch);

  const toCommitOid = toCommit.toString();
  const fromCommitOid = fromCommit.toString();

  const normalizedMergeOptions = normalizeOptions(mergeOptions, MergeOptions);
  const baseCommit = await Merge.base(this, toCommitOid, fromCommitOid);
  if (baseCommit.toString() === fromCommitOid) {
    // The commit we're merging to is already in our history.
    // nothing to do so just return the commit the branch is on
    return toCommitOid;
  } else if (
    baseCommit.toString() === toCommitOid
    && mergePreference !== Merge.PREFERENCE.NO_FASTFORWARD
  ) {
    // fast forward
    const tree = await fromCommit.getTree();
    if (toBranch.isHead()) {
      // Checkout the tree if we're on the branch
      await Checkout.tree(this, tree, {
        checkoutStrategy: Checkout.STRATEGY.SAFE
          | Checkout.STRATEGY.RECREATE_MISSING
      });
    }
    await toBranch.setTarget(
      fromCommitOid,
      `Fast forward branch ${toBranch.shorthand()} to branch ${fromBranch.shorthand()}`
    );
    return fromCommitOid;
  } else if (mergePreference !== Merge.PREFERENCE.FASTFORWARD_ONLY) {
    // We have to merge. Lets do it!
    const headRef = await Reference.lookup(this, "HEAD");
    const resolvedHeadRef = await headRef.resolve();
    const updateHead = Boolean(resolvedHeadRef)
      && resolvedHeadRef.name() === toBranch.name();

    const index = await Merge.commits(
      this,
      toCommitOid,
      fromCommitOid,
      normalizedMergeOptions
    );

    if (index.hasConflicts()) {
      throw index;
    }

    let mergeDecorator;
    if (fromBranch.isTag()) {
      mergeDecorator = "tag";
    } else if (fromBranch.isRemote()) {
      mergeDecorator = "remote-tracking branch";
    } else {
      mergeDecorator = "branch";
    }

    let mergeMessage = `Merge ${mergeDecorator} '${fromBranch.shorthand()}'`;

    // https://github.com/git/git/blob/master/builtin/fmt-merge-msg.c#L456-L459
    if (toBranch.shorthand() !== "master") {
      mergeMessage += ` into ${toBranch.shorthand()}`;
    }

    const processedMessage = await processMergeMessageCallback(mergeMessage);

    // No conflicts so just go ahead with the merge
    const oid = await index.writeTreeTo(this);
    const commit = await this.createCommit(
      toBranch.name(),
      resolvedSignature,
      resolvedSignature,
      processedMessage,
      oid,
      [toCommitOid, fromCommitOid]
    );

    if (updateHead) {
      const updatedToBranch = await this.getBranch(to);
      const updatedToCommit = await this.getBranchCommit(updatedToBranch);
      const updatedToTree = await updatedToCommit.getTree();

      await Checkout.tree(this, updatedToTree, {
        checkoutStrategy: Checkout.STRATEGY.SAFE
          | Checkout.STRATEGY.RECREATE_MISSING
      });
    }

    return commit;
  }

  // A non fast-forwardable merge with ff-only
  return toCommitOid;
};

/**
 * @async
 * @param {MergeheadForeachCb} callback The callback function to be called on
 * each entry
 */
Repository.prototype.mergeheadForeach = function(callback) {
  return proto_MergeheadForeach.call(this, callback, null);
};

/**
 * Stages or unstages line selection of a specified file
 *
 * @async
 * @param {String|Array} filePath The relative path of this file in the repo
 * @param {Boolean} stageNew Set to stage new filemode. Unset to unstage.
 * @return {Number} 0 or an error code
 */
Repository.prototype.stageFilemode = async function(
  filePath,
  stageNew,
  additionalDiffOptions = 0
) {
  await fse.remove(`${this.path()}index.lock`);
  const index = await this.refreshIndex();

  let diff;
  if (stageNew) {
    diff = await Diff.indexToWorkdir(this, index, {
      flags: Diff.OPTION.SHOW_UNTRACKED_CONTENT
        | Diff.OPTION.RECURSE_UNTRACKED_DIRS
        | additionalDiffOptions
    })
  } else {
    const headCommit = await this.getHeadCommit();
    const headTree = await headCommit.getTree();
    const diffOptions = !additionalDiffOptions ? null : {
      flags: additionalDiffOptions
    };
    diff = await Diff.treeToIndex(this, headTree, index, diffOptions);
  }

  const filePaths = (filePath instanceof Array) ? filePath : [filePath];
  const filePathsAndShouldFilter = await Promise.all(filePaths.map(
    async (_filePath) => {
      const status = await Status.file(this, _filePath);
      return {
        path: _filePath,
        filter: Boolean(
          (status & Status.STATUS.WT_MODIFIED)
          || (status & Status.STATUS.INDEX_MODIFIED)
        )
      };
    }
  ));
  const onlyModifiedFilePaths = filePathsAndShouldFilter
    .filter(({ filter }) => filter)
    .map(({ path }) => path);

  if (onlyModifiedFilePaths.length === 0 && filePaths.length > 0) {
    throw new Error("Selected staging is only available on modified files.");
  }

  const patches = await diff.patches();
  const pathPatches = patches.filter(
    (patch) => ~onlyModifiedFilePaths.indexOf(patch.newFile().path())
  );

  if (pathPatches.length === 0) {
    throw new Error("No differences found for this file.");
  }

  for (const pathPatch of pathPatches) {
    const entry = index.getByPath(pathPatch.newFile().path(), 0);
    entry.mode = stageNew
      ? pathPatch.newFile().mode()
      : pathPatch.oldFile().mode();

    await index.add(entry);
  }

  return index.write();
};

/**
 * Stages or unstages line selection of a specified file
 *
 * @async
 * @param {String} filePath The relative path of this file in the repo
 * @param {Array} selectedLines The array of DiffLine objects
 *                            selected for staging or unstaging
 * @param {Boolean} isStaged Are the selected lines currently staged
 * @return {Number} 0 or an error code
 */
Repository.prototype.stageLines = async function(
  filePath,
  selectedLines,
  isSelectionStaged,
  additionalDiffOptions = 0
) {
  const index = await this.refreshIndex();
  const originalBlob = await this.getBlob(index.getByPath(filePath).id);
  const hunks = await getPathHunks(
    this,
    index,
    filePath,
    isSelectionStaged,
    additionalDiffOptions
  );
  const newContent = await applySelectedLinesToTarget(
    originalBlob,
    selectedLines,
    hunks,
    isSelectionStaged
  );
  const newOid = await this.createBlobFromBuffer(new Buffer(newContent));
  const newBlob = await this.getBlob(newOid);
  const entry = index.getByPath(filePath, 0);

  entry.id = newBlob.id();
  entry.path = filePath;
  entry.fileSize = newBlob.content().length;

  await index.add(entry);
  const result = await index.write();

  if (isSelectionStaged) {
    return result;
  }

  // The following chain checks if there is a patch with no hunks left for the
  // file, and no filemode changes were done on the file. It is then safe to
  // stage the entire file so the file doesn't show as having unstaged changes
  // in `git status`. Also, check if there are no type changes.
  const diff = await Diff.indexToWorkdir(this, index, {
    flags: Diff.OPTION.SHOW_UNTRACKED_CONTENT
      | Diff.OPTION.RECURSE_UNTRACKED_DIRS
      | additionalDiffOptions
  });

  const patches = await diff.patches();
  const pathPatch = patches.filter(
    (patch) => patch.newFile().path() === filePath
  );
  const emptyPatch = pathPatch.length > 0
    // No hunks, unchanged file mode, and no type changes.
    && pathPatch[0].size() === 0
    && pathPatch[0].oldFile().mode() === pathPatch[0].newFile().mode()
    && !pathPatch[0].isTypeChange();
  if (emptyPatch) {
    await index.addByPath(filePath);
    return index.write();
  }

  return result;
};

/**
 * Create a new tree builder.
 *
 * @param {Tree} tree
 */
Repository.prototype.treeBuilder = function() {
  const builder = TreeBuilder.create(null);

  builder.root = builder;
  builder.repo = this;

  return builder;
};
