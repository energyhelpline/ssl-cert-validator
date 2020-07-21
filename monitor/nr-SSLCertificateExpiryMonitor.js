var request = require("request"),
  Q = require("q");
/* 
************************************************** 
What is the URL that you want to check? 
************************************************** 
************************************************** 
How many days before your certification expires do you want this monitor to fail?  
I.e. daysBeforeExpiration = 30 
This monitor will start failing within 30 days of the SSL certificate expiring 
************************************************** 
*/
var urlsToMonitor = [
  "https://rest.staging.energyhelpline.com/domestic/energy",
  "https://rest.energyhelpline.com/domestic/energy",
];

urlsToMonitor.forEach(url =>  monitorCertsForUrl(url));

function monitorCertsForUrl(url) {
  var deferred = Q.defer();
  console.log("Preparing to monitor " + url);

  var r = request({
    url: url,
    method: "HEAD",
    gzip: true,
    followRedirect: false,
    followAllRedirects: false,
  });

  r.on("response", function (res) {
    const includeDetail = true;
    var domainCertificate = res.req.connection.getPeerCertificate(includeDetail);
    var certificates = findAllChainedCertificates(domainCertificate);
    certificates.forEach(c => sendCertificateInfo(c, url));
    deferred.resolve();
  });
  console.log("**** Date at time of testing: " + new Date());
  return deferred.promise;
}

function findAllChainedCertificates(certDetails) {
  if (certDetails.issuerCertificate) {
    var chainCert = certDetails.issuerCertificate;
    return findChainedCertificates(chainCert,[certDetails]);
  }
}

function findChainedCertificates(cert, accumulator) {
  const certificateNotFound = (accumulator.findIndex(c=> c.fingerprint == cert.fingerprint) == -1);
  if (certificateNotFound) {
    accumulator.push(cert);
    return findChainedCertificates(cert.issuerCertificate,accumulator);
  }
  return accumulator;
}

function sendCertificateInfo(certificate, url) {
  var issuedBy = certificate.issuer.O;
  var expiryDate = certificate.valid_to;
  var thumbprint = certificate.fingerprint;

  var daysRemainingForRenewal = daysRemaingForCertificateExpiry(new Date(expiryDate));
  submitEvent(
    SSLCertificateCheckEvent({
      url,
      thumbprint,
      issuedBy,
      daysToExpiry:daysRemainingForRenewal,
      expiryDate,
    })
  );
}

function submitEvent(event) {
  var evtRequest = eventRequest(event);
  request.post(evtRequest, function (error, response, body) {
    console.log(JSON.stringify(response));
  });
}

function eventRequest(event) {
  var events = [event];
  return {
    uri:
      "https://insights-collector.newrelic.com/v1/accounts/" +
      $secure.ACCOUNT_ID +
      "/events",
    body: JSON.stringify(events),
    headers: {
      "X-Insert-Key": $secure.INSIGHTS_API_LICENSE,
      "Content-Type": "application/json",
    },
  };
}

function daysRemaingForCertificateExpiry(toDate) {
  var today = new Date();
  var differenceInTime = toDate.getTime() - today.getTime();
  var daysDifference = differenceInTime / (1000 * 3600 * 24);
  return Math.round(daysDifference);
}

function SSLCertificateCheckEvent(certificateInfo) {
  return {
    eventType: "SSLCertificateCheck",
    Thumbprint: certificateInfo.thumbprint,
    Url: certificateInfo.url,
    Issuer: certificateInfo.issuedBy,
    DaysToExpiry: certificateInfo.daysToExpiry,
    ExpirationDate: certificateInfo.expiryDate,
  };
}
