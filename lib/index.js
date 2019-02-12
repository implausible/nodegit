const {
  Index
} = require("../");

const {
  addAll: proto_AddAll,
  removeAll: proto_RemoveAll,
  updateAll: proto_UpdateAll
} = Index.prototype;

Index.prototype.addAll = function(pathspec, flags, matchedCallback) {
  return proto_AddAll.call(this, pathspec || "*", flags, matchedCallback, null);
};

/**
 * Return an array of the entries in this index.
 * @return {Array<IndexEntry>} an array of IndexEntrys
 */
Index.prototype.entries = function() {
  const size = this.entryCount();
  const result = [];

  for (let i = 0; i < size; i++) {
    result.push(this.getByIndex(i));
  }

  return result;
};

Index.prototype.removeAll = function(pathspec, matchedCallback) {
  return proto_RemoveAll.call(this, pathspec || "*", matchedCallback, null);
};

Index.prototype.updateAll = function(pathspec, matchedCallback) {
  return proto_UpdateAll.call(this, pathspec || "*", matchedCallback, null);
};
