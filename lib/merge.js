const {
  CheckoutOptions,
  Merge,
  MergeOptions,
  Utils: {
    normalizeOptions
  }
} = require("../");

const {
  commits: static_Commits,
  merge: static_Merge
} = Merge;

/**
 * Merge 2 commits together and create an new index that can
 * be used to create a merge commit.
 *
 * @param {Repository} repo Repository that contains the given commits
 * @param {Commit} ourCommit The commit that reflects the destination tree
 * @param {Commit} theirCommit The commit to merge into ourCommit
 * @param {MergeOptions} [options] The merge tree options (null for default)
 */
Merge.commits = async (repo, ourCommit, theirCommit, options) =>
  static_Commits(
    repo,
    await repo.getCommit(ourCommit),
    await repo.getCommit(theirCommit),
    normalizeOptions(options, MergeOptions)
  );

/**
 * Merge a commit into HEAD and writes the results to the working directory.
 *
 * @param {Repository} repo Repository that contains the given commits
 * @param {AnnotatedCommit} theirHead The annotated commit to merge into HEAD
 * @param {MergeOptions} [mergeOpts] The merge tree options (null for default)
 * @param {CheckoutOptions} [checkoutOpts] The checkout options
 *                                         (null for default)
 */
Merge.merge = (repo, theirHead, mergeOpts, checkoutOpts) =>
  static_Merge(
    repo,
    // Even though git_merge takes an array of annotated_commits, it expects
    // exactly one to have been passed in or it will throw an error...  ¯\_(ツ)_/¯
    [theirHead],
    1,
    normalizeOptions(mergeOpts || {}, MergeOptions),
    normalizeOptions(checkoutOpts || {}, CheckoutOptions)
  );
