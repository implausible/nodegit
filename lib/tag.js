const {
  Error: NGError,
  Object: NGObject,
  Tag,
  Utils: {
    lookupWrapper,
  },
} = require('../');

/**
 * Retrieves the tag pointed to by the oid
 * @async
 * @param {Repository} repo The repo that the tag lives in
 * @param {String|Oid|Tag} id The tag to lookup
 * @return {Tag}
 */
Tag.lookup = lookupWrapper(Tag);

/**
 * @async
 * @param {Repository} repo
 * @param {String} tagName
 * @param {Oid} target
 * @param {Signature} tagger
 * @return {String}
 */
Tag.createBuffer = async (repo, tagName, target, tagger, message) => {
  const object = await NGObject.lookup(repo, target, NGObject.TYPE.ANY);
  if (!NGObject.typeisloose(object.type())) {
    throw new Error('Object must be a loose type');
  }

  const id = object.id().toString();
  const objectType = NGObject.type2String(object.type());
  const lines = [
    `object ${id}`,
    `type ${objectType}`,
    `tag ${tagName}`,
    `tagger ${tagger.toString(true)}\n`,
    `${message}${message.endsWith('\n') ? '' : '\n'}`,
  ];

  return lines.join('\n');
};

/**
 * @async
 * @param {Repository} repo
 * @param {String} tagName
 * @param {Oid} target
 * @param {Signature}   const signatureRegexes = signatureRegexesBySignatureType[signatureType];
tagger
 * @param {String} message
 * @param {Number} force
 * @param {Function} signingCallback Takes a string and returns a string
 *                                   representing the signed message
 * @return {Oid}
 */
Tag.createWithSignature = async (
  repo,
  tagName,
  target,
  tagger,
  message,
  force,
  signingCallback,
) => {
  const tagBuffer = await Tag.createBuffer(repo, tagName, target, tagger, message);
  const { code, signedData } = await signingCallback(tagBuffer);
  switch (code) {
    case NGError.CODE.OK: {
      const normalizedEnding = signedData.endsWith('\n') ? '' : '\n';
      const signedTagString = tagBuffer + signedData + normalizedEnding;
      return Tag.createFromBuffer(repo, signedTagString, force);
    }
    case NGError.CODE.PASSTHROUGH:
      return Tag.create(
        repo,
        tagName,
        target,
        tagger,
        message,
        force,
      );
    default: {
      const error = new Error(
        `Tag.createWithSignature threw with error code ${code}`,
      );
      error.errno = code;
      throw error;
    }
  }
};

const signatureRegexesBySignatureType = {
  gpgsig: [
    /-----BEGIN PGP SIGNATURE-----[\s\S]+?-----END PGP SIGNATURE-----/gm,
    /-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/gm,
  ],
  x509: [
    /-----BEGIN SIGNED MESSAGE-----[\s\S]+?-----END SIGNED MESSAGE-----/gm,
  ],
};

/**
 * Retrieves the signature of an annotated tag
 * @async
 * @param {String} signatureType
 * @return {String|null}
 */
Tag.prototype.extractSignature = async function(signatureType = 'gpgsig') {
  const signatureRegexes = signatureRegexesBySignatureType[signatureType];
  if (!signatureRegexes) {
    throw new Error('Unsupported signature type');
  }

  const odb = await this.repo.odb();
  const odbObject = await odb.read(this.id());
  const odbData = odbObject.toString();

  for (const regex of signatureRegexes) {
    const matchResult = regex.exec(odbData);

    if (matchResult !== null) {
      return matchResult[0];
    }
  }

  throw new Error('this tag is not signed');
};
