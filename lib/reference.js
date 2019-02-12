const {
  Branch,
  Error: NGError,
  Reference,
  Reflog,
  Signature,
  Utils: {
    lookupWrapper,
  },
} = require('../');

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

const getTerminal = async (repo, refName, depth = 10, prevRef = null) => {
  if (depth <= 0) {
    return {
      error: NGError.CODE.ENOTFOUND,
      out: prevRef,
    };
  }

  try {
    const ref = await Reference.lookup(repo, refName);

    if (ref.type() === Reference.TYPE.OID) {
      return {
        error: NGError.CODE.OK,
        out: ref,
      };
    }

    const { error, out } = await getTerminal(repo, ref.symbolicTarget(), depth - 1, ref);

    if (error === NGError.CODE.ENOTFOUND && !out) {
      return { error, out: ref };
    }

    return { error, out };
  } catch (error) {
    return {
      error: error.errno,
      out: null,
    };
  }
};

const getSignatureForReflog = async (repo) => {
  const { email, name } = repo.ident();

  if (email && name) {
    return Signature.now(name, email);
  }

  try {
    return await Signature.default(repo);
  } catch (e) {
    return Signature.now('unknown', 'unknown');
  }
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
Reference.updateTerminal = async (
  repo,
  refName,
  oid,
  logMessage,
  signature,
) => {
  const signatureToUse = signature || await getSignatureForReflog(repo);
  const { error, out } = await getTerminal(repo, refName);

  if (error === NGError.CODE.ENOTFOUND && out) {
    await Reference.create(
      repo,
      out.symbolicTarget(),
      oid,
      0,
      logMessage,
    );
  } else if (error === NGError.CODE.ENOTFOUND) {
    await Reference.create(
      repo,
      refName,
      oid,
      0,
      logMessage,
    );
  } else {
    await Reference.createMatching(
      repo,
      out.name(),
      oid,
      1,
      out.target(),
      logMessage,
    );
  }

  // Janky, but works. Ideally, we would want to generate the correct reflog
  // entry in the first place, rather than drop the most recent entry and
  // write the correct one.
  // NOTE: There is a theoretical race condition that could happen here.
  // We may want to consider some kind of transactional logic to make sure
  // that the reflog on disk isn't modified before we can write back.
  const reflog = await Reflog.read(repo, refName);
  reflog.drop(0, 1);
  reflog.append(oid, signatureToUse, logMessage);
  return reflog.write();
};
