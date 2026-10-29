/* Great-circle helpers for the static map. No build step.
   Works in the browser (global HKGeo) and in Node (module.exports). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HKGeo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }
  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function greatCircle(lat1, lon1, lat2, lon2, steps) {
    var φ1 = toRad(lat1);
    var λ1 = toRad(lon1);
    var φ2 = toRad(lat2);
    var λ2 = toRad(lon2);
    var d = 2 * Math.asin(Math.min(1, Math.sqrt(
      Math.sin((φ2 - φ1) / 2) * Math.sin((φ2 - φ1) / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) * Math.sin((λ2 - λ1) / 2)
    )));
    var points = [];
    var n = Math.max(1, steps);
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      if (d < 1e-9) {
        points.push([lat1, lon1]);
        continue;
      }
      var A = Math.sin((1 - f) * d) / Math.sin(d);
      var B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      var y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      var z = A * Math.sin(φ1) + B * Math.sin(φ2);
      var φ = Math.atan2(z, Math.sqrt(x * x + y * y));
      var λ = Math.atan2(y, x);
      points.push([toDeg(φ), toDeg(λ)]);
    }
    return points;
  }

  function wrapLon(lon) {
    var x = ((lon + 180) % 360 + 360) % 360 - 180;
    return x === -180 ? 180 : x;
  }

  /* Split a great-circle into polylines that do not cross the antimeridian,
     so Leaflet does not draw a straight line across the world. */
  function routeSegments(lat1, lon1, lat2, lon2, steps) {
    var raw = greatCircle(lat1, lon1, lat2, lon2, steps == null ? 96 : steps);
    var unwrapped = [[raw[0][0], raw[0][1]]];
    for (var i = 1; i < raw.length; i++) {
      var lon = raw[i][1];
      var prev = unwrapped[i - 1][1];
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
      unwrapped.push([raw[i][0], lon]);
    }

    var segments = [];
    var seg = [[unwrapped[0][0], wrapLon(unwrapped[0][1])]];
    for (var j = 1; j < unwrapped.length; j++) {
      var a = unwrapped[j - 1];
      var b = unwrapped[j];
      var bandA = Math.floor((a[1] + 180) / 360);
      var bandB = Math.floor((b[1] + 180) / 360);
      if (bandA !== bandB) {
        var dir = b[1] > a[1] ? 1 : -1;
        var boundary = dir > 0 ? (bandA + 1) * 360 - 180 : bandA * 360 - 180;
        var t = (boundary - a[1]) / (b[1] - a[1]);
        var lat = a[0] + t * (b[0] - a[0]);
        seg.push([lat, dir > 0 ? 180 : -180]);
        if (seg.length >= 2) segments.push(seg);
        seg = [[lat, dir > 0 ? -180 : 180]];
      }
      seg.push([b[0], wrapLon(b[1])]);
    }
    if (seg.length >= 2) segments.push(seg);
    return segments;
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    var R = 6371.0088;
    var p1 = toRad(lat1);
    var p2 = toRad(lat2);
    var dp = toRad(lat2 - lat1);
    var dl = toRad(lon2 - lon1);
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  return {
    greatCircle: greatCircle,
    routeSegments: routeSegments,
    distanceKm: distanceKm,
    wrapLon: wrapLon
  };
});
