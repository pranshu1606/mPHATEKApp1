// CloudFront Function (cloudfront-js-2.0), viewer-request.
// Runs at every edge location before the cache lookup: drops common scanner/exploit
// probes at the edge so they never reach the origin VM.

var BLOCKED = [
  /^\/\.env/,
  /^\/\.git/,
  /^\/\.aws/,
  /^\/wp-/,
  /^\/xmlrpc/,
  /^\/phpmyadmin/,
  /^\/cgi-bin/,
  /\.php$/,
  /\.(bak|sql|sqlite3?|db)$/
];

function handler(event) {
  var request = event.request;
  var uri = request.uri.toLowerCase();

  for (var i = 0; i < BLOCKED.length; i++) {
    if (BLOCKED[i].test(uri)) {
      return {
        statusCode: 403,
        statusDescription: "Forbidden",
        headers: {
          "cache-control": { value: "no-store" },
          "x-edge-blocked": { value: "true" }
        }
      };
    }
  }

  return request;
}
