var http = require("http");
var https = require("https");
var httpProxy = require("http-proxy");
var fs = require("fs");
var path = require("path");

var local = path.join.bind(path, __dirname);

var httpsOptions = {
  key: fs.readFileSync(local("./proxyTestCerts/key.pem")),
  cert: fs.readFileSync(local("./proxyTestCerts/cert.pem"))
};


function createSingleUseProxy(useHttps) {
  var server;
  var resolve;
  var reject;
  var proxyWasUsed = false;
  var options = useHttps ? { secure: true, ssl: httpsOptions } : {};
  var proxy = httpProxy.createProxyServer(options);
  var serverListeningPromise = new Promise(function(_resolve, _reject) {
    resolve = _resolve;
    reject = _reject;
  });

  function requestForwarder(request, response) {
    proxyWasUsed = true;
    proxy.web(request, response, { target: request.url });
  }

  if (useHttps) {
    server = https.createServer(httpsOptions, requestForwarder);
  } else {
    console.log("create http server");
    server = http.createServer(requestForwarder);
  }

  server.on("error", reject);
  server.listen(8080, function() {
    resolve({
      close: function() {
        server.close();
      },
      getProxyWasUsed: function() {
        return proxyWasUsed;
      }
    });
  });

  return serverListeningPromise;
}

module.exports = createSingleUseProxy;
