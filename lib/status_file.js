const NodeGit = require("../");
const {
  Status
} = NodeGit;

const getPathFromEntry = (entry) =>
  entry.indexToWorkdir()
    ? entry.indexToWorkdir().newFile().path()
    : entry.headToIndex().newFile().path();

class StatusFile {
  constructor({ path, status, entry }) {
    this._entry = entry;
    this._path = entry ? getPathFromEntry(entry) : path;
    this._status = entry ? entry.status() : status;
    this._statuses = [];

    for (const key in Status.STATUS) {
      if (this._status & Status.STATUS[key]) {
        this._statuses.push(key);
      }
    }
  }

  headToIndex() {
    return this._entry
      ? this._entry.headToIndex()
      : undefined;
  }

  indexToWorkdir() {
    return this._entry
      ? this._entry.indexToWorkdir()
      : undefined;
  }

  inIndex() {
    return this._status & Status.STATUS.INDEX_NEW
     || this._status & Status.STATUS.INDEX_MODIFIED
     || this._status & Status.STATUS.INDEX_DELETED
     || this._status & Status.STATUS.INDEX_TYPECHANGE
     || this._status & Status.STATUS.INDEX_RENAMED;
  }

  inWorkingTree() {
    return this._status & Status.STATUS.WT_NEW
     || this._status & Status.STATUS.WT_MODIFIED
     || this._status & Status.STATUS.WT_DELETED
     || this._status & Status.STATUS.WT_TYPECHANGE
     || this._status & Status.STATUS.WT_RENAMED;
  }

  isConflicted() {
    return this._status & Status.STATUS.CONFLICTED;
  }

  isDeleted() {
    return this._status & Status.STATUS.WT_DELETED
     || this._status & Status.STATUS.INDEX_DELETED;
  }

  isIgnored() {
    return this._status & Status.STATUS.IGNORED;
  }

  isModified() {
    return this._status & Status.STATUS.WT_MODIFIED
     || this._status & Status.STATUS.INDEX_MODIFIED;
  }

  isNew() {
    return this._status & Status.STATUS.WT_NEW
     || this._status & Status.STATUS.INDEX_NEW;
  }

  isRenamed() {
    return this._status & Status.STATUS.WT_RENAMED
     || this._status & Status.STATUS.INDEX_RENAMED;
  }

  isTypechange() {
    return this._status & Status.STATUS.WT_TYPECHANGE
     || this._status & Status.STATUS.INDEX_TYPECHANGE;
  }

  path() {
    return this._path;
  }

  status() {
    return this._statuses;
  }

  statusBit() {
    return this._status;
  }
}

NodeGit.StatusFile = StatusFile;
