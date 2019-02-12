const {
  Branch,
  Error: NGError,
  Reference,
  Reflog,
  Signature,
  Utils: {
    lookupWrapper
  }
} = require("../");

/**
* Retrieves the reference by it's short name
* @async
* @param {Repository} repo The repo that the reference lives in
* @param {String|Reference} id The reference to lookup
* @param {Function} callback
* @return {Reference}
*/
Reference.dwim = lookupWrapper(Reference, Reference.dwim);

/**
* Retrieves the reference pointed to by the oid
* @async
* @param {Repository} repo The repo that the reference lives in
* @param {String|Reference} id The reference to lookup
* @param {Function} callback
* @return {Reference}
*/
Reference.lookup = lookupWrapper(Reference);

/**
 * Returns true if this reference is not symbolic
 * @return {Boolean}
 */
Reference.prototype.isConcrete = function() {
  return this.type() === Reference.TYPE.OID;
};

/**
 * Returns if the ref is pointed at by HEAD
 * @return {Boolean}
 */
Reference.prototype.isHead = function() {
  return Branch.isHead(this);
};

/**
 * Returns true if this reference is symbolic
 * @return {Boolean}
 */
Reference.prototype.isSymbolic = function() {
  return this.type() === Reference.TYPE.SYMBOLIC;
};

/**
 * Returns true if this reference is valid
 * @return {Boolean}
 */
Reference.prototype.isValid = function() {
  return this.type() !== Reference.TYPE.INVALID;
};

/**
 * Returns the name of the reference.
 * @return {String}
 */
Reference.prototype.toString = Reference.prototype.name;

const getTerminal = (repo, refName, depth = 10, prevRef = null) => {
  if (depth <= 0) {
    return Promise.resolve({
      error: NGError.CODE.ENOTFOUND,
      out: prevRef
    });
  }

  return Reference.lookup(repo, refName)
    .then((ref) => {
      if (ref.type() === Reference.TYPE.OID) {
        return {
          error: NGError.CODE.OK,
          out: ref
        };
      } else {
        return getTerminal(repo, ref.symbolicTarget(), depth - 1, ref)
          .then(({ error, out }) => {
            if (error === NGError.CODE.ENOTFOUND && !out) {
              return { error, out: ref };
            } else {
              return { error, out };
            }
          });
      }
    })
    .catch((error) => {
      return {
        error: error.errno,
        out: null
      };
    });
};

const getSignatureForReflog = (repo) => {
  const { email, name } = repo.ident();
  if (email && name) {
    return Promise.resolve(Signature.now(name, email));
  }

  return Signature.default(repo)
    .catch(() => Signature.now("unknown", "unknown"));
};

/**
 * Given a reference name, follows symbolic links and updates the direct
 * reference to point to a given OID. Updates the reflog with a given message.
 *
 * @async
 * @param {Repository} repo The repo where the reference and objects live
 * @param {String} refName The reference name to update
 * @param {Oid} oid The target OID that the reference will point to
 * @param {String} logMessage The reflog message to be writted
 * @param {Signature} signature Optional signature to use for the reflog entry
 */
Reference.updateTerminal = function (
  repo,
  refName,
  oid,
  logMessage,
  signature
) {
  let signatureToUse;
  let promiseChain = Promise.resolve();

  if (!signature) {
    promiseChain = promiseChain
      .then(() => getSignatureForReflog(repo))
      .then((sig) => {
        signatureToUse = sig;
        return Promise.resolve();
      });
  } else {
    signatureToUse = signature;
  }

  return promiseChain
    .then(() => getTerminal(repo, refName))
    .then(({ error, out }) => {
      if (error === NGError.CODE.ENOTFOUND && out) {
        return Reference.create(
          repo,
          out.symbolicTarget(),
          oid,
          0,
          logMessage
        );
      } else if (error === NGError.CODE.ENOTFOUND) {
        return Reference.create(
          repo,
          refName,
          oid,
          0,
          logMessage
        );
      } else {
        return Reference.createMatching(
          repo,
          out.name(),
          oid,
          1,
          out.target(),
          logMessage
        );
      }
    })
    .then(() => Reflog.read(repo, refName))
    .then((reflog) => {
      // Janky, but works. Ideally, we would want to generate the correct reflog
      // entry in the first place, rather than drop the most recent entry and
      // write the correct one.
      // NOTE: There is a theoretical race condition that could happen here.
      // We may want to consider some kind of transactional logic to make sure
      // that the reflog on disk isn't modified before we can write back.
      reflog.drop(0, 1);
      reflog.append(oid, signatureToUse, logMessage);
      return reflog.write();
    });
};
