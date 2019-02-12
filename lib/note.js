const {
  Note
} = require("../");

const {
  foreach: static_Foreach
} = Note;

// Override Note.foreach to eliminate the need to pass null payload
Note.foreach = (repo, notesRef, callback) => {
  // We need to copy the OID since libgit2 types are getting cleaned up
  // incorrectly right now in callbacks
  const safeCallback = (blobId, objectId) =>
    callback(blobId.copy(), objectId.copy());

  return static_Foreach(repo, notesRef, safeCallback, null);
};
