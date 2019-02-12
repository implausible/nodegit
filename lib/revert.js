const {
  CheckoutOptions,
  MergeOptions,
  Revert,
  RevertOptions,
  Utils: {
    normalizeOptions,
    shallowClone
  }
} = require("../");

const {
  commit: static_Commit,
  revert: static_Revert
} = Revert;

/**
 * Reverts the given commit against the given "our" commit, producing an index
 * that reflects the result of the revert.
 *
 * @async
 * @param {Repository} repo the repository that contains the given commits.
 * @param {Commit} revertCommit the commit to revert
 * @param {Commit} ourCommit the commit to revert against (e.g. HEAD)
 * @param {Number} mainline the parent of the revert commit, if it is a merge
 * @param {MergeOptions} mergeOptions the merge options (or null for defaults)
 *
 * @return {Index} the index result
 */
Revert.commit = (
  repo,
  revertCommit,
  ourCommit,
  mainline,
  mergeOptions
) => static_Commit(
  repo,
  revertCommit,
  ourCommit,
  mainline,
  normalizeOptions(mergeOptions, MergeOptions)
);

/**
 * Reverts the given commit, producing changes in the index and
 * working directory.
 *
 * @async
 * @param {Repository} repo the repository to perform the revert in
 * @param {Commit} commit the commit to revert
 * @param {RevertOptions} revert_options the revert options
 *                                       (or null for defaults)
 */
Revert.revert = (repo, commit, revertOptions) => {
  let normalizedOptions;
  if (revertOptions) {
    const preNormalizedOptions = shallowClone(revertOptions);
    const { checkoutOpts, mergeOpts } = preNormalizedOptions;

    delete preNormalizedOptions.mergeOpts;
    delete preNormalizedOptions.checkoutOpts;

    normalizedOptions = normalizeOptions(preNormalizedOptions, RevertOptions);

    if (checkoutOpts) {
      normalizedOptions.checkoutOpts = normalizeOptions(checkoutOpts, CheckoutOptions);
    }

    if (mergeOpts) {
      normalizedOptions.mergeOpts = normalizeOptions(mergeOpts, MergeOptions);
    }
  }

  return static_Revert(repo, commit, normalizedOptions);
};
