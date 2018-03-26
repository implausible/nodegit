var cp = require("child_process");
var path = require("path");
var rooted = function (dir) {
  var fullPath = path.join(__dirname, "..", dir);
  var escapedPathForShell = fullPath.replace(/ /g, "\\ ");
  return escapedPathForShell;
};

if (process.argv.length < 3) {
  console.log('Requires path to openssl library');
  process.exit(1);
}

function retrieveExternalDependencies() {
  return new Promise(function(resolve, reject) {
    var opensslDir = process.argv[2];
    var newEnv = {};
    Object.keys(process.env).forEach(function(key) {
      newEnv[key] = process.env[key];
    });
    newEnv.CPPFLAGS = newEnv.CPPFLAGS || "";
    newEnv.CPPFLAGS += " -I" + path.join(opensslDir, "include");
    newEnv.CPPFLAGS = newEnv.CPPFLAGS.trim();

    cp.exec(
      rooted("vendor/libssh2/configure") +
        " --with-libssl-prefix=" + opensslDir,
      {cwd: rooted("vendor/libssh2/"), env: newEnv},
      function(err, stdout, stderr) {
        if (err) {
          console.error(err);
          console.error(stderr);
          reject(err, stderr);
        }
        else {
          resolve(stdout);
        }
      }
    );
  });
};

retrieveExternalDependencies()
  .then(function () {
    process.exit(0);
  })
  .catch(function() {
    process.exit(1);
  });
