const path = require("path");
const { EventEmitter } = require("events");
const {
  Diff,
  Tree,
  Treebuilder,
  Utils: {
    lookupWrapper
  }
} = require("../");

/**
* Retrieves the tree pointed to by the oid
* @async
* @param {Repository} repo The repo that the tree lives in
* @param {String|Oid|Tree} id The tree to lookup
* @param {Function} callback
* @return {Tree}
*/
Tree.lookup = lookupWrapper(Tree);

/**
 * Make builder. This is helpful for modifying trees.
 * @return {Treebuilder}
 */
Tree.prototype.builder = function() {
  const builder = Treebuilder.create(this);

  builder.root = builder;
  builder.repo = this.repo;

  return builder;
};

/**
 * Diff two trees
 * @async
 * @param {Tree} tree to diff against
 * @param {Function} callback
 * @return {DiffList}
 */
Tree.prototype.diff = function(tree) {
  return this.diffWithOptions(tree, null);
};

/**
 * Diff two trees with options
 * @async
 * @param {Tree} tree to diff against
 * @param {Object} options
 * @param {Function} callback
 * @return {DiffList}
 */
Tree.prototype.diffWithOptions = function(tree, options) {
  return Diff.treeToTree(this.repo, tree, this, options);
};

/**
 * Return an array of the entries in this tree (excluding its children).
 * @return {Array<TreeEntry>} an array of TreeEntrys
 */
Tree.prototype.entries = function() {
  const size = this.entryCount();
  const result = [];

  for (let i = 0; i < size; i++) {
    result.push(this.entryByIndex(i));
  }

  return result;
};

/**
 * Get an entry at the ith position.
 *
 * @param {Number} i
 * @return {TreeEntry}
 */
Tree.prototype.entryByIndex = function(i) {
  const entry = this._entryByIndex(i);
  entry.parent = this;
  return entry;
};

/**
 * Get an entry by name; if the tree is a directory, the name is the filename.
 *
 * @param {String} name
 * @return {TreeEntry}
 */
Tree.prototype.entryByName = function(name) {
  const entry = this._entryByName(name);
  entry.parent = this;
  return entry;
};

/**
 * Get an entry at a path. Unlike by name, this takes a fully
 * qualified path, like `/foo/bar/baz.javascript`
 * @async
 * @param {String} filePath
 * @return {TreeEntry}
 */
Tree.prototype.getEntry = async function(filePath) {
  const entry = await this.entryByPath(filePath);

  entry.parent = this;
  entry.dirtoparent = path.dirname(filePath);

  return entry;
};

/**
 * Return the path of this tree, like `/lib/foo/bar`
 * @return {String}
 */
Tree.prototype.path = function() {
  return this.entry ? this.entry.path() : "";
};

/**
 * Recursively walk the tree in breadth-first order. Fires an event for each
 * entry.
 *
 * @fires EventEmitter#entry Tree
 * @fires EventEmitter#end Array<Tree>
 * @fires EventEmitter#error Error
 *
 * @param {Boolean} [blobsOnly = true] True to emit only blob & blob executable
 * entries.
 *
 * @return {EventEmitter}
 */
Tree.prototype.walk = function(blobsOnly) {
  const useBlobsOnly = typeof blobsOnly === "boolean" ? blobsOnly : true;
  const treeWalkEventEmitter = new EventEmitter();
  const entries = new Set();
  const allFoundEntries = [];

  let total = 1;

  // This looks like a DFS, but it is a BFS because of implicit queueing in
  // the recursive call to `entry.getTree(bfs)`
  const bfs = (tree) => {
    total--;

    tree.entries().forEach(async (entry, entryIndex) => {
      if (!useBlobsOnly || entry.isFile() && !entries.has(entry)) {
        treeWalkEventEmitter.emit("entry", entry);
        entries.add(entry);
        allFoundEntries.push(entry);
      }

      if (entry.isTree()) {
        total++;
        try {
          const nextTree = await entry.getTree();
          bfs(nextTree);
        } catch (error) {
          treeWalkEventEmitter.emit("error", error);
          return;
        }
      }
    });

    if (total === 0) {
      treeWalkEventEmitter.emit("end", allFoundEntries);
    }
  };

  let started = false;
  treeWalkEventEmitter.start = () => {
    if (started) {
      throw new Error("Tree walk already started");
    }

    bfs(this);
    started = true;
  };

  return treeWalkEventEmitter;
};
