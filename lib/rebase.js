const {
  Error: NGError,
  Checkout,
  CheckoutOptions,
  MergeOptions,
  Rebase,
  RebaseOptions,
  Utils: {
    normalizeOptions,
    shallowClone
  }
} = require("../");

const {
  init: static_Init,
  open: static_Open
} = Rebase;

const {
  commit: proto_Commit
} = Rebase.prototype;

const defaultRebaseOptions = (maybeRebaseOptions, checkoutStrategy) => {
  const preNormalizedOptions = maybeRebaseOptions
    ? shallowClone(maybeRebaseOptions)
    : {};
  const checkoutOptions = preNormalizedOptions.checkoutOptions;
  const mergeOptions = preNormalizedOptions.mergeOptions;

  delete preNormalizedOptions.checkoutOptions;
  delete preNormalizedOptions.mergeOptions;

  if (preNormalizedOptions.signingCb) {
    const signingCb = preNormalizedOptions.signingCb;
    preNormalizedOptions.signingCb = async (signatureBuf, signatureFieldBuf, commitContent) => {
      const { code, field, signedData } = await signingCb(commitContent);

      if (code === NGError.CODE.OK) {
        signatureBuf.setString(signedData);
        if (field) {
          signatureFieldBuf.setString(field);
        }
      }

      return code;
    };
  }

  const rebaseOptions = normalizeOptions(preNormalizedOptions, RebaseOptions);

  if (checkoutOptions) {
    rebaseOptions.checkoutOptions = normalizeOptions(checkoutOptions, CheckoutOptions);
  } else if (checkoutStrategy) {
    rebaseOptions.checkoutOptions = normalizeOptions({ checkoutStrategy }, CheckoutOptions);
  }

  if (mergeOptions) {
    rebaseOptions.mergeOptions = normalizeOptions(mergeOptions, MergeOptions);
  }

  return rebaseOptions;
}

// Save options on the rebase object. If we don't do this,
// the options may be cleaned up and cause a segfault
// when Rebase.prototype.commit is called.
const lockOptionsOnRebase = (options, rebase) => {
  Object.defineProperty(rebase, "options", {
    value: options,
    writable: false
  });
  return rebase;
};

/**
 * Initializes a rebase
 * @async
 * @param {Repository} repo The repository to perform the rebase
 * @param {AnnotatedCommit} branch The terminal commit to rebase, or NULL to
 *                                 rebase the current branch
 * @param {AnnotatedCommit} upstream The commit to begin rebasing from, or NULL
 *                                   to rebase all reachable commits
 * @param {AnnotatedCommit} onto The branch to rebase onto, or NULL to rebase
 *                               onto the given upstream
 * @param {RebaseOptions} options Options to specify how rebase is performed,
 *                                or NULL
 * @return {Remote}
 */
Rebase.init = async (repository, branch, upstream, onto, options) => {
  const defaultedOptions = defaultRebaseOptions(options, Checkout.STRATEGY.FORCE);
  const rebase = await static_Init(repository, branch, upstream, onto, defaultedOptions);
  return lockOptionsOnRebase(defaultedOptions, rebase);
};

/**
 * Opens an existing rebase that was previously started by either an invocation
 * of Rebase.open or by another client.
 * @async
 * @param {Repository} repo The repository that has a rebase in-progress
 * @param {RebaseOptions} options Options to specify how rebase is performed
 * @return {Remote}
 */
Rebase.open = async (repository, options) => {
  const defaultedOptions = defaultRebaseOptions(options, Checkout.STRATEGY.FORCE);
  const rebase = await static_Open(repository, defaultedOptions);
  return lockOptionsOnRebase(defaultedOptions, rebase);
};

// NOTE Promisification of optional arguments fails here. Need to investigate better solution.
Rebase.prototype.commit = function(author, committer, encoding, message) {
  return proto_Commit.call(this, author, committer, encoding, message);
};
