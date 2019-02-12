const {
  Checkout,
  CheckoutOptions,
  Utils: { normalizeOptions }
} = require("../");

const {
  head: static_Head,
  index: static_Index,
  tree: static_Tree
} = Checkout;

/**
* Patch head checkout to automatically coerce objects.
*
* @async
* @param {Repository} repo The repo to checkout head
* @param {CheckoutOptions} [options] Options for the checkout
* @return {Void} checkout complete
*/
Checkout.head = (url, options = {}) =>
  static_Head(url, normalizeOptions(options, CheckoutOptions));

/**
* Patch index checkout to automatically coerce objects.
*
* @async
* @param {Repository} repo The repo to checkout an index
* @param {Index} index The index to checkout
* @param {CheckoutOptions} [options] Options for the checkout
* @return {Void} checkout complete
*/
Checkout.index = (repo, index, options = {}) =>
  static_Index(repo, index, normalizeOptions(options, CheckoutOptions));

/**
* Patch tree checkout to automatically coerce objects.
*
* @async
* @param {Repository} repo
* @param {String|Tree|Commit|Reference} treeish
* @param {CheckoutOptions} [options]
* @return {Void} checkout complete
*/
Checkout.tree = (repo, treeish, options = {}) =>
  static_Tree(repo, treeish, normalizeOptions(options, CheckoutOptions));
