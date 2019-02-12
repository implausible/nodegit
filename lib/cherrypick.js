const {
  CheckoutOptions,
  Cherrypick,
  CherrypickOptions,
  MergeOptions,
  Utils: {
    normalizeOptions,
    shallowClone
  }
} = require("../");

const {
  cherrypick: static_Cherrypick,
  commit: static_Commit
} = Cherrypick;

const normalizeCherrypickOptions = (maybeCherrypickOptions) => {
  if (!maybeCherrypickOptions) {
    return null;
  }

  if (maybeCherrypickOptions instanceof CherrypickOptions) {
    return maybeCherrypickOptions;
  }

  const preNormalizedOptions = shallowClone(maybeCherrypickOptions);
  const { checkoutOpts, mergeOpts } = preNormalizedOptions;

  delete preNormalizedOptions.checkoutOpts;
  delete preNormalizedOptions.mergeOpts;

  const cherrypickOptions = normalizeOptions(preNormalizedOptions, CherrypickOptions);

  if (checkoutOpts) {
    cherrypickOptions.checkoutOpts = normalizeOptions(checkoutOpts, CheckoutOptions);
  }

  if (mergeOpts) {
    cherrypickOptions.mergeOpts = normalizeOptions(mergeOpts, MergeOptions);
  }

  return cherrypickOptions;
};

/**
* Cherrypick a commit and, changing the index and working directory
*
* @async
* @param {Repository}         repo      The repo to checkout head
* @param {Commit}             commit    The commit to cherrypick
* @param {CherrypickOptions}  [options] Options for the cherrypick
* @return {int} 0 on success, -1 on failure
*/
Cherrypick.cherrypick = (repo, commit, options) =>
  static_Cherrypick(repo, commit, normalizeCherrypickOptions(options));

/**
* Cherrypicks the given commit against "our" commit, producing an index that
* reflects the result of the cherrypick. The index is not backed by a repo.
*
* @async
* @param {Repository}   repo              The repo to cherrypick commits
* @param {Commit}       cherrypick_commit The commit to cherrypick
* @param {Commit}       our_commit        The commit to revert against
* @param {int}          mainline          The parent of the revert commit (1 or
*                                         2) if it's a merge, 0 otherwise
* @param {MergeOptions} [merge_options]   Merge options for the cherrypick
* @return {int}   0 on success, -1 on failure
*/
Cherrypick.commit = (repo, cherrypickCommit, ourCommit, mainline, mergeOptions) =>
  static_Commit(
    repo,
    cherrypickCommit,
    ourCommit,
    mainline,
    normalizeOptions(mergeOptions, MergeOptions)
  );
