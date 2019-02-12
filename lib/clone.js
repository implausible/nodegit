const {
  Clone,
  CloneOptions,
  Utils: {
    normalizeFetchOptions,
    normalizeOptions,
    shallowClone,
  },
} = require('../');

const {
  clone: static_Clone,
} = Clone;

const normalizeCloneOptions = (maybeCloneOptions) => {
  if (!maybeCloneOptions) {
    return null;
  }

  if (maybeCloneOptions instanceof CloneOptions) {
    return maybeCloneOptions;
  }

  const preNormalizedOptions = shallowClone(maybeCloneOptions);
  const fetchOpts = normalizeFetchOptions(preNormalizedOptions.fetchOpts);

  delete preNormalizedOptions.fetchOpts;

  const cloneOptions = normalizeOptions(preNormalizedOptions, CloneOptions);

  if (fetchOpts) {
    cloneOptions.fetchOpts = fetchOpts;
  }

  return cloneOptions;
};

/**
 * Patch repository cloning to automatically coerce objects.
 *
 * @async
 * @param {String} url url of the repository
 * @param {String} localPath local path to store repository
 * @param {CloneOptions} [options]
 * @return {Repository} repo
 */
Clone.clone = (url, localPath, options) =>
  static_Clone(url, localPath, normalizeCloneOptions(options));
