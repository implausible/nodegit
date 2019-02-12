const {
  Branch
} = require("../");

const {
  remoteName: static_RemoteName
} = Branch;

/**
 * Retrieve the Branch's Remote Name as a String.
 *
 *  @async
 * @param {Repository} repo The repo to get the remote name from
 * @param {String} the refname of the branch
 * @return {String} remote name as a string.
 */
Branch.remoteName = async (repo, remoteRef) => {
  const remoteNameBuffer = await static_RemoteName(repo, remoteRef);
  return remoteNameBuffer.toString();
};
