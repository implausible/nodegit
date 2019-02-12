const { EventEmitter } = require('events');
const {
  Commit,
  Error: NGError,
  Oid,
  Utils: {
    lookupWrapper,
  },
} = require('../');

const {
  amend: proto_Amend,
} = Commit.prototype;

/**
 * Retrieves the commit pointed to by the oid
 * @async
 * @param {Repository} repo The repo that the commit lives in
 * @param {String|Oid|Commit} id The commit to lookup
 * @return {Commit}
 */
Commit.lookup = lookupWrapper(Commit);

/**
 * Amend a commit
 * @async
 * @param {String} update_ref
 * @param {Signature} author
 * @param {Signature} committer
 * @param {String} message_encoding
 * @param {String} message
 * @param {Tree|Oid} tree
 * @param {Oid} callback
 */
Commit.prototype.amend = async function(
  updateRef,
  author,
  committer,
  messageEncoding,
  message,
  tree,
) {
  const repo = this.owner();
  const treeObject = tree instanceof Oid
    ? await repo.getTree(tree)
    : tree;

  return proto_Amend.call(
    this,
    updateRef,
    author,
    committer,
    messageEncoding,
    message,
    treeObject,
  );
};

/**
 * Amend a commit with the given signature
 * @async
 * @param {String} updateRef
 * @param {Signature} author
 * @param {Signature} committer
 * @param {String} messageEncoding
 * @param {String} message
 * @param {Tree|Oid} tree
 * @param {Function} onSignature Callback to be called with string to be signed
 * @return {Oid}
*/
Commit.prototype.amendWithSignature = async function(
  updateRef,
  author,
  committer,
  messageEncoding,
  message,
  tree,
  onSignature,
) {
  const repo = this.owner();
  const treeObject = tree instanceof Oid
    ? await repo.getTree(tree)
    : tree;
  const parents = await Promise.all(
    this.parents().map(
      (parentOid) => repo.getCommit(parentOid),
    ),
  );

  const resolvedAuthor = author || this.author();
  const resolvedCommitter = committer || this.committer();
  const resolvedMessageEncoding = messageEncoding || this.messageEncoding();
  const resolvedMessage = message || this.message();
  const resolvedTree = treeObject || await this.getTree();

  const commitContentResult = await Commit.createBuffer(
    repo,
    resolvedAuthor,
    resolvedCommitter,
    resolvedMessageEncoding,
    resolvedMessage,
    resolvedTree,
    parents.length,
    parents,
  );
  const commitContent = commitContentResult.endsWith('\n')
    ? commitContentResult
    : `${commitContentResult}\n`;

  const { code, field, signedData } = await onSignature(commitContent);

  let skippedSigning = false;
  let amendedCommitOid;
  switch (code) {
    case NGError.CODE.OK:
      amendedCommitOid = await Commit.createWithSignature(
        repo,
        commitContent,
        signedData,
        field,
      );
      break;
    case NGError.CODE.PASSTHROUGH:
      skippedSigning = true;
      amendedCommitOid = await Commit.create(
        repo,
        updateRef,
        resolvedAuthor,
        resolvedCommitter,
        resolvedMessageEncoding,
        resolvedMessage,
        resolvedTree,
        parents.length,
        parents,
      );
      break;
    default: {
      const error = new Error(
        `Commit.amendWithSignature threw with error code ${code}`,
      );
      error.errno = code;
      throw error;
    }
  }

  if (!updateRef || skippedSigning) {
    return amendedCommitOid;
  }

  const amendedCommit = await repo.getCommit(amendedCommitOid);
  const refToUpdate = await repo.getReference(updateRef);
  await refToUpdate.setTarget(
    amendedCommitOid,
    `commit (amend): ${amendedCommit.summary()}`,
  );
  return amendedCommitOid;
};

/**
 * Retrieve the commit time as a Date object.
 * @return {Date}
 */
Commit.prototype.date = function() {
  return new Date(this.timeMs());
};

/**
 * Generate an array of diff trees showing changes between this commit
 * and its parent(s).
 *
 * @async
 * @param {Function} callback
 * @return {Array<Diff>} an array of diffs
 */
Commit.prototype.getDiff = function() {
  return this.getDiffWithOptions(null);
};

/**
 * Generate an array of diff trees showing changes between this commit
 * and its parent(s).
 *
 * @async
 * @param {Object} options
 * @param {Function} callback
 * @return {Array<Diff>} an array of diffs
 */
Commit.prototype.getDiffWithOptions = async function(options) {
  const thisTree = await this.getTree();
  const parents = await this.getParents();

  if (!parents.length) {
    return Promise.all([
      thisTree.diffWithOptions(null, options),
    ]);
  }

  return Promise.all(parents.map(
    async (parent) => {
      const parentTree = await parent.getTree();
      return thisTree.diffWithOptions(parentTree, options);
    },
  ));
};

/**
 * Retrieve the entry represented by path for this commit.
 * Path must be relative to repository root.
 *
 * @async
 * @param {String} path
 * @return {TreeEntry}
 */
Commit.prototype.getEntry = async function(path) {
  const tree = await this.getTree();
  return tree.getEntry(path);
};

/**
 * Retrieve the commit's parents as commit objects.
 *
 * @async
 * @param {number} limit Optional amount of parents to return.
 * @return {Array<Commit>} array of commits
 */
Commit.prototype.getParents = async function(limit = this.parentcount()) {
  const repo = this.owner();
  const adjustedLimit = Math.min(Math.max(limit, 0), this.parentcount());

  const parents = [];
  for (let i = 0; i < adjustedLimit; i++) {
    const parentOid = this.parentId(i);
    const parentCommit = await repo.getCommit(parentOid);
    parents.push(parentCommit);
  }

  return parents;
};

/**
 * @typedef extractedSignature
 * @type {Object}
 * @property {String} signature the signature of the commit
 * @property {String} signedData the extracted signed data
 */

/**
 * Retrieve the signature and signed data for a commit.
 * @param  {String} field Optional field to get from the signature,
 *                        defaults to gpgsig
 * @return {extractedSignature}
 */
Commit.prototype.getSignature = function(field) {
  return Commit.extractSignature(this.owner(), this.id(), field);
};

/**
 * Get the tree associated with this commit.
 *
 * @async
 * @return {Tree}
 */
Commit.prototype.getTree = function() {
  return this.owner().getTree(this.treeId());
};

/**
 * Walk the history from this commit backwards.
 *
 * An EventEmitter is returned that will emit a 'commit' event for each
 * commit in the history, and one 'end' event when the walk is completed.
 * Don't forget to call `start()` on the returned event.
 *
 * @fires EventEmitter#commit Commit
 * @fires EventEmitter#end Array<Commit>
 * @fires EventEmitter#error Error
 *
 * @return {EventEmitter}
 * @start start()
 */
Commit.prototype.history = function(...args) {
  const historyEventEmitter = new EventEmitter();
  const revwalk = this.owner().createRevWalk();
  const commits = [];

  const handleRevwalkWalk = (error, commit) => {
    if (error) {
      if (error.errno === NGError.CODE.ITEROVER) {
        historyEventEmitter.emit('end', commits);
      } else {
        historyEventEmitter.emit('error', error);
      }
      return;
    }

    historyEventEmitter.emit('commit', commit);
    commits.push(commit);
  };

  let started = false;
  historyEventEmitter.start = () => {
    if (started) {
      throw new Error('History walk already started');
    }
    revwalk.sorting(...args);
    revwalk.walk(this.id(), handleRevwalkWalk);
    started = true;
  };

  return historyEventEmitter;
};

/**
 * Retrieve the commit's parent shas.
 *
 * @return {Array<Oid>} array of oids
 */
Commit.prototype.parents = function() {
  const result = [];

  for (let i = 0; i < this.parentcount(); i++) {
    result.push(this.parentId(i));
  }

  return result;
};

/**
 * Retrieve the SHA.
 * @return {String}
 */
Commit.prototype.sha = function() {
  return this.id().toString();
};

/**
 * Retrieve the commit time as a unix timestamp.
 * @return {Number}
 */
Commit.prototype.timeMs = function() {
  return this.time() * 1000;
};

/**
 * The sha of this commit
 * @return {String}
 */
Commit.prototype.toString = function() {
  return this.sha();
};
