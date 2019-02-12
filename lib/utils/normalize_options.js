const NodeGit = require("../../");

/**
 * Normalize an object to match a struct.
 *
 * @param {String, Object} oid - The oid string or instance.
 * @return {Object} An Oid instance.
 */
const normalizeOptions = (options, Ctor) => {
  if (!options) {
    return null;
  }

  if (options instanceof Ctor) {
    return options;
  }

  const instance = new Ctor();

  Object.keys(options)
    .forEach((key) => {
      if (typeof options[key] !== "undefined") {
        instance[key] = options[key];
      }
    });

  return instance;
};

NodeGit.Utils.normalizeOptions = normalizeOptions;
