const NodeGit = require('../../');

const {
  normalizeOptions,
  shallowClone,
} = NodeGit.Utils;

/**
 * Normalize an object to match a struct.
 *
 * @param {String, Object} oid - The oid string or instance.
 * @return {Object} An Oid instance.
 */
const normalizeFetchOptions = (maybeFetchOptions) => {
  if (maybeFetchOptions instanceof NodeGit.FetchOptions) {
    return maybeFetchOptions;
  }

  const preNormalizedOptions = maybeFetchOptions
    ? shallowClone(maybeFetchOptions)
    : {};
  const { callbacks, proxyOpts } = preNormalizedOptions;

  delete preNormalizedOptions.callbacks;
  delete preNormalizedOptions.proxyOpts;

  const options = normalizeOptions(preNormalizedOptions, NodeGit.FetchOptions);

  if (callbacks) {
    options.callbacks = normalizeOptions(callbacks, NodeGit.RemoteCallbacks);
  }

  if (proxyOpts) {
    options.proxyOpts = normalizeOptions(proxyOpts, NodeGit.ProxyOptions);
  }

  return options;
};

NodeGit.Utils.normalizeFetchOptions = normalizeFetchOptions;
