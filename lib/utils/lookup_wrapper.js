const NodeGit = require('../../');

/**
* Wraps a method so that you can pass in either a string, OID or the object
* itself and you will always get back a promise that resolves to the object.
* @param {Object} objectType The object type that you're expecting to receive.
* @param {Function} lookupFunction  The function to do the lookup for the
*                                   object. Defaults to `objectType.lookup`.
* @return {Function}
*/
const lookupWrapper = (objectType, lookupFunction = objectType.lookup) =>
  async (repo, oidLikeOrAlreadyResolvedObject) => {
    const outObject = oidLikeOrAlreadyResolvedObject instanceof objectType
      ? oidLikeOrAlreadyResolvedObject
      : await lookupFunction(repo, oidLikeOrAlreadyResolvedObject);
    outObject.repo = repo;
    return outObject;
  };

NodeGit.Utils.lookupWrapper = lookupWrapper;
