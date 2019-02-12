const {
  Blame,
  BlameOptions,
  Utils: { normalizeOptions }
} = require("../");

const {
  file: static_BlameFile
} = Blame;

/**
 * Retrieve the blame of a file
 *
 * @async
 * @param {Repository} repo that contains the file
 * @param {String} path to the file to get the blame of
 * @param {BlameOptions} [options] Options for the blame
 */
Blame.file = (repo, path, options) =>
  static_BlameFile(repo, path, normalizeOptions(options, BlameOptions));
