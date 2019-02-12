const {
  CheckoutOptions,
  Submodule,
  SubmoduleUpdateOptions,
  Utils: {
    normalizeFetchOptions,
    normalizeOptions,
    shallowClone
  }
} = require("../");

const {
  foreach: static_Foreach
} = Submodule;

const {
  update: proto_Update
} = Submodule.prototype;

Submodule.foreach = (repo, callback) =>
  static_Foreach(repo, callback, null);

/**
 * Updates a submodule
 *
 * @async
 * @param {Number} init Setting this to 1 will initialize submodule
 *                      before updating
 * @param {SubmoduleUpdateOptions} options Submodule update settings
 * @return {Number} 0 on success, any non-zero return value from a callback
 */
Submodule.prototype.update = function(init, options) {
  let submoduleUpdateOptions;
  if (options instanceof SubmoduleUpdateOptions) {
    submoduleUpdateOptions = options;
  } else if (options) {
    const preNormalizedOptions = shallowClone(options);
    const { checkoutOpts, fetchOpts } = preNormalizedOptions;

    delete preNormalizedOptions.checkoutOpts;
    delete preNormalizedOptions.fetchOpts;

    submoduleUpdateOptions = normalizeOptions(preNormalizedOptions, SubmoduleUpdateOptions);

    if (checkoutOpts) {
      submoduleUpdateOptions.checkoutOpts = normalizeOptions(checkoutOpts, CheckoutOptions);
    }

    if (fetchOpts) {
      submoduleUpdateOptions.fetchOpts = normalizeFetchOptions(fetchOpts);
    }
  }

  return proto_Update.call(this, init, submoduleUpdateOptions);
};
