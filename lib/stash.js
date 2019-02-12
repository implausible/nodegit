const {
  CheckoutOptions,
  Stash,
  StashApplyOptions,
  Utils: {
    normalizeOptions,
    shallowClone,
  },
} = require('../');

const {
  apply: static_Apply,
  foreach: static_Foreach,
  pop: static_Pop,
} = Stash;

const normalizeStashApplyOptions = (maybeStashApplyOptions) => {
  if (maybeStashApplyOptions instanceof StashApplyOptions) {
    return maybeStashApplyOptions;
  }

  const preNormalizedOptions = maybeStashApplyOptions
    ? shallowClone(maybeStashApplyOptions)
    : {};
  const { checkoutOptions } = preNormalizedOptions;

  delete preNormalizedOptions.checkoutOptions;

  const stashApplyOptions = normalizeOptions(preNormalizedOptions, StashApplyOptions);

  if (checkoutOptions) {
    stashApplyOptions.checkoutOptions = normalizeOptions(checkoutOptions, CheckoutOptions);
  }

  return stashApplyOptions;
};

Stash.apply = (repo, index, options) =>
  static_Apply(repo, index, normalizeStashApplyOptions(options));

// Override Stash.foreach to eliminate the need to pass null payload
Stash.foreach = (repo, callback) =>
  static_Foreach(
    repo,
    // We need to copy the OID since libgit2 types are getting cleaned up
    // incorrectly right now in callbacks
    (index, message, oid) => callback(index, message, oid.copy()),
    null,
  );

Stash.pop = (repo, index, options) =>
  static_Pop(repo, index, normalizeStashApplyOptions(options));
