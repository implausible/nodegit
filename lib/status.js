const {
  Status,
  StatusOptions,
  Utils: {
    normalizeOptions
  }
} = require("../");

const {
  foreach: static_Foreach,
  foreachExt: static_ForeachExt
} = Status;

Status.foreach = (repo, callback) =>
  static_Foreach(repo, callback, null);

Status.foreachExt = (repo, options, callback) =>
  static_ForeachExt(repo, normalizeOptions(options, StatusOptions), callback, null);
