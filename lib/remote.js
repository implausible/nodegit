const {
  ProxyOptions,
  PushOptions,
  Remote,
  RemoteCallbacks,
  Utils: {
    normalizeFetchOptions,
    normalizeOptions,
    lookupWrapper,
    shallowClone
  }
} = require("../");

const {
  connect: proto_Connect,
  download: proto_Download,
  fetch: proto_Fetch,
  push: proto_Push,
  upload: proto_Upload
} = Remote.prototype;

const normalizePushOptions = (options) => {
  const preNormalizedOptions = options
    ? shallowClone(options)
    : {};
  const { callbacks, proxyOpts } = preNormalizedOptions;

  delete preNormalizedOptions.callbacks;
  delete preNormalizedOptions.proxyOpts;

  const pushOptions = normalizeOptions(preNormalizedOptions, PushOptions);

  if (callbacks) {
    pushOptions.callbacks = normalizeOptions(callbacks, RemoteCallbacks);
  }

  if (proxyOpts) {
    pushOptions.proxyOpts = normalizeOptions(proxyOpts, ProxyOptions);
  }

  return pushOptions;
};

/**
 * Retrieves the remote by name
 * @async
 * @param {Repository} repo The repo that the remote lives in
 * @param {String|Remote} name The remote to lookup
 * @param {Function} callback
 * @return {Remote}
 */
Remote.lookup = lookupWrapper(Remote);

/**
 * Connects to a remote
 *
 * @async
 * @param {Enums.DIRECTION} direction The direction for the connection
 * @param {RemoteCallbacks} callbacks The callback functions for the connection
 * @param {ProxyOptions} proxyOpts Proxy settings
 * @param {Array<string>} customHeaders extra HTTP headers to use
 * @param {Function} callback
 * @return {Number} error code
 */
Remote.prototype.connect = function(
  direction,
  remoteCallbacks,
  proxyOptions,
  customHeaders
) {
  return proto_Connect.call(
    this,
    direction,
    normalizeOptions(remoteCallbacks || {}, RemoteCallbacks),
    normalizeOptions(proxyOptions || {}, ProxyOptions),
    customHeaders || []
  );
};

/**
 * Connects to a remote
 *
 * @async
 * @param {Array} refSpecs The ref specs that should be pushed
 * @param {FetchOptions} opts The fetch options for download, contains callbacks
 * @param {Function} callback
 * @return {Number} error code
 */
Remote.prototype.download = function(refspecs, fetchOptions) {
  return proto_Download.call(this, refspecs, normalizeFetchOptions(fetchOptions));
};

/**
 * Connects to a remote
 *
 * @async
 * @param {Array} refSpecs The ref specs that should be pushed
 * @param {FetchOptions} opts The fetch options for download, contains callbacks
 * @param {String} message The message to use for the update reflog messages
 * @param {Function} callback
 * @return {Number} error code
 */
Remote.prototype.fetch = function(refspecs, fetchOptions, reflogMessage) {
  return proto_Fetch.call(
    this,
    refspecs,
    normalizeFetchOptions(fetchOptions),
    reflogMessage
  );
};

/**
 * Pushes to a remote
 *
 * @async
 * @param {Array} refSpecs The ref specs that should be pushed
 * @param {PushOptions} options Options for the checkout
 * @param {Function} callback
 * @return {Number} error code
 */
Remote.prototype.push = function(refSpecs, options) {
  return proto_Push.call(this, refSpecs, normalizePushOptions(options));
};

/**
 * Lists advertised references from a remote. You must connect to the remote
 * before using referenceList.
 *
 * @async
 * @return {Promise<Array<RemoteHead>>} a list of the remote heads the remote
 *                                      had available at the last established
 *                                      connection.
 *
 */
Remote.prototype.referenceList = Remote.prototype.referenceList;

/**
 * Connects to a remote
 *
 * @async
 * @param {Array} refSpecs The ref specs that should be pushed
 * @param {FetchOptions} opts The fetch options for download, contains callbacks
 * @param {String} message The message to use for the update reflog messages
 * @param {Function} callback
 * @return {Number} error code
 */
Remote.prototype.fetch = function(refspecs, fetchOptions, reflogMessage) {
  return proto_Fetch.call(
    this,
    refspecs,
    normalizeFetchOptions(fetchOptions),
    reflogMessage
  );
};

/**
 * Pushes to a remote
 *
 * @async
 * @param {Array} refSpecs The ref specs that should be pushed
 * @param {PushOptions} options Options for the checkout
 * @param {Function} callback
 * @return {Number} error code
 */
Remote.prototype.upload = function(refSpecs, options) {
  return proto_Upload.call(this, refSpecs, normalizePushOptions(options));
};
