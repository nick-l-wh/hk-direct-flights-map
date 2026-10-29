(function () {
  var COLORS = {
    CN: "#2563eb",
    TW: "#d97706",
    JP: "#db2777",
    KR: "#0891b2",
    SEA: "#059669",
    SA: "#c026d3",
    ME: "#b45309",
    EU: "#4f46e5",
    NA: "#be123c",
    OC: "#0f766e",
    AF: "#7c2d12",
    OA: "#475569"
  };

  var TAG_CLASS = {
    "暫停": "tag-suspend",
    "新開航": "tag-new",
    "復航": "tag-resume",
    "季節性": "tag-season"
  };

  var LINE = "#e25b78";
  var LINE_ACTIVE = "#d61f4e";

  var data = null;
  var map = null;
  var popup = null;
  var origin = null;
  var records = [];
  var pinned = null;
  var highlighted = null;
  var regionFilter = "all";
  var ignoreClose = 0;
  var closeTimer = null;
  var mapReady = false;

  var el = {
    subtitle: document.getElementById("subtitle"),
    stats: document.getElementById("header-stats"),
    search: document.getElementById("search"),
    airline: document.getElementById("airline"),
    status: document.getElementById("status"),
    regions: document.getElementById("regions"),
    list: document.getElementById("list"),
    listMeta: document.getElementById("list-meta"),
    reset: document.getElementById("reset"),
    about: document.getElementById("about"),
    panel: document.getElementById("panel"),
    panelToggle: document.getElementById("panel-toggle")
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—'"’./-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tagsOf(record) {
    var seen = {};
    var order = ["暫停", "新開航", "復航", "季節性"];
    record.airlines.forEach(function (airline) {
      (airline.tags || []).forEach(function (tag) { seen[tag] = true; });
    });
    return order.filter(function (tag) { return seen[tag]; });
  }

  function popupHtml(record) {
    var tags = tagsOf(record).map(function (tag) {
      return '<span class="tag ' + TAG_CLASS[tag] + '">' + esc(tag) + "</span>";
    }).join("");
    var airlines = record.airlines.map(function (airline) {
      var note = airline.note ? '<span class="airline-note">' + esc(airline.note) + "</span>" : "";
      return "<li><span class=\"airline-name\">" + esc(airline.name) + "</span>" + note + "</li>";
    }).join("");
    var icao = record.icao ? " · " + esc(record.icao) : "";
    return (
      '<article class="popup">' +
        '<div class="popup-kicker"><i style="background:' + COLORS[record.region] + '"></i>' + esc(record.regionZh) + "</div>" +
        "<h3>" + esc(record.cityZh) + ' <span class="iata">' + esc(record.iata) + "</span></h3>" +
        '<p class="en">' + esc(record.cityEn) + "</p>" +
        '<p class="apt">' + esc(record.airportName) + icao + "</p>" +
        (tags ? '<div class="tags">' + tags + "</div>" : "") +
        "<h4>航空公司</h4>" +
        '<ul class="airlines">' + airlines + "</ul>" +
      "</article>"
    );
  }

  function activeId() {
    return highlighted || pinned || "";
  }

  function applyStyles() {
    if (!mapReady) return;
    var active = activeId();
    map.setPaintProperty("routes", "line-color", [
      "case", ["==", ["get", "iata"], active], LINE_ACTIVE, LINE
    ]);
    map.setPaintProperty("routes", "line-width", [
      "interpolate", ["linear"], ["zoom"],
      1, ["case", ["==", ["get", "iata"], active], 2.2, 1.15],
      4, ["case", ["==", ["get", "iata"], active], 2.8, 1.4]
    ]);
    map.setPaintProperty("routes", "line-opacity", [
      "case",
      ["==", ["get", "iata"], active], 0.95,
      active ? 0.16 : 0.52
    ]);
    map.setPaintProperty("destinations", "circle-stroke-width", [
      "case", ["==", ["get", "iata"], active], 2.4, 1.35
    ]);
    map.setPaintProperty("destinations", "circle-radius", [
      "interpolate", ["linear"], ["zoom"],
      1, ["case", ["==", ["get", "iata"], active], 5.6, 3.5],
      3, ["case", ["==", ["get", "iata"], active], 7.6, 5],
      6, ["case", ["==", ["get", "iata"], active], 10, 7.2]
    ]);
  }

  function syncMapFilter(list) {
    if (!mapReady) return;
    var iatas = list.map(function (record) { return record.iata; });
    var filter = ["in", ["get", "iata"], ["literal", iatas]];
    map.setFilter("routes", filter);
    map.setFilter("destinations", filter);
    applyStyles();
  }

  function filtersActive() {
    return regionFilter !== "all" ||
      el.airline.value !== "all" ||
      el.status.value !== "all" ||
      el.search.value.trim() !== "";
  }

  function recordMatches(record, query) {
    if (regionFilter !== "all" && record.region !== regionFilter) return false;
    if (el.airline.value !== "all") {
      var wanted = el.airline.value;
      var hit = record.airlines.some(function (airline) { return airline.name === wanted; });
      if (!hit) return false;
    }
    if (el.status.value === "noted" && tagsOf(record).length === 0) return false;
    if (el.status.value !== "all" && el.status.value !== "noted") {
      if (tagsOf(record).indexOf(el.status.value) === -1) return false;
    }
    if (!query) return true;
    var hay = norm([
      record.cityZh,
      record.cityEn,
      record.cityKey,
      record.iata,
      record.icao,
      record.airportName,
      record.regionZh
    ].join(" "));
    return hay.indexOf(query) !== -1;
  }

  function renderList(list) {
    if (!list.length) {
      el.list.innerHTML = '<li class="empty">找不到符合的航點</li>';
      return;
    }
    el.list.innerHTML = list.map(function (record) {
      var note = tagsOf(record).length ? " · " + tagsOf(record).join("、") : "";
      var airlines = record.airlines.map(function (airline) { return airline.name; }).join("、");
      return (
        '<li><button type="button" class="item' + (record.iata === pinned ? " active" : "") + '" data-iata="' + esc(record.iata) + '">' +
          '<span class="dot" style="background:' + COLORS[record.region] + '"></span>' +
          '<span class="name">' + esc(record.cityZh) + "</span>" +
          '<span class="code">' + esc(record.iata) + "</span>" +
          '<span class="sub">' + esc(record.cityEn) + " · " + esc(airlines) + esc(note) + "</span>" +
        "</button></li>"
      );
    }).join("");
  }

  function cityCount(list) {
    var keys = {};
    list.forEach(function (record) { keys[record.cityKey] = true; });
    return Object.keys(keys).length;
  }

  function applyFilters() {
    var query = norm(el.search.value);
    var visible = [];
    records.forEach(function (record) {
      record.visible = recordMatches(record, query);
      if (record.visible) visible.push(record);
    });
    if (pinned && !visible.some(function (record) { return record.iata === pinned; })) {
      pinned = null;
      highlighted = null;
      closeRecordPopup();
    }
    syncMapFilter(visible);
    renderList(visible);
    var cities = cityCount(visible);
    el.listMeta.textContent = "顯示 " + visible.length + " 個機場 · " + cities + " 個城市";
    el.stats.innerHTML = "<strong>" + visible.length + "</strong> / " + data.meta.airportCount + " 個機場";
    el.reset.hidden = !filtersActive();
    paintRegionChips();
  }

  function paintRegionChips() {
    Array.prototype.forEach.call(el.regions.querySelectorAll(".chip"), function (chip) {
      chip.classList.toggle("active", chip.getAttribute("data-region") === regionFilter);
    });
  }

  function buildRegionChips() {
    var counts = { all: records.length };
    data.meta.regions.forEach(function (region) { counts[region.id] = 0; });
    records.forEach(function (record) { counts[record.region] += 1; });
    var chips = [{ id: "all", zh: "全部", color: "#94a3b8", n: counts.all }].concat(
      data.meta.regions.map(function (region) {
        return { id: region.id, zh: region.zh, color: COLORS[region.id], n: counts[region.id] || 0 };
      })
    );
    el.regions.innerHTML = chips.map(function (chip) {
      var label = chip.id === "OA" ? "其他亞洲" : chip.zh;
      return (
        '<button type="button" class="chip" data-region="' + chip.id + '" title="' + esc(chip.zh) + '">' +
          '<i style="background:' + chip.color + '"></i>' +
          "<span>" + esc(label) + "</span>" +
          '<span class="n">' + chip.n + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function buildAirlineSelect() {
    var counts = {};
    records.forEach(function (record) {
      record.airlines.forEach(function (airline) {
        counts[airline.name] = (counts[airline.name] || 0) + 1;
      });
    });
    var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, "en"); });
    el.airline.innerHTML = '<option value="all">全部航空公司</option>' + names.map(function (name) {
      return '<option value="' + esc(name) + '">' + esc(name) + "（" + counts[name] + "）</option>";
    }).join("");
  }

  function focusRoute(record) {
    var km = HKGeo.distanceKm(origin.lat, origin.lon, record.lat, record.lon);
    if (km < 2800) {
      var bounds = new maplibregl.LngLatBounds(
        [Math.min(origin.lon, record.lon), Math.min(origin.lat, record.lat)],
        [Math.max(origin.lon, record.lon), Math.max(origin.lat, record.lat)]
      );
      map.fitBounds(bounds, { padding: 72, maxZoom: 5.2, duration: 700 });
    } else {
      map.flyTo({ center: [record.lon, record.lat], zoom: 2.7, duration: 800 });
    }
  }

  function openRecordPopup(record) {
    if (!popup || !mapReady) return;
    popup.setLngLat([record.lon, record.lat]).setHTML(popupHtml(record));
    if (!popup.isOpen()) popup.addTo(map);
  }

  function closeRecordPopup() {
    if (popup && popup.isOpen()) {
      ignoreClose += 1;
      popup.remove();
      ignoreClose -= 1;
    }
  }

  function cancelClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function scheduleClose(record) {
    cancelClose();
    closeTimer = setTimeout(function () {
      if (pinned) return;
      if (highlighted === record.iata) highlighted = null;
      closeRecordPopup();
      applyStyles();
    }, 320);
  }

  function selectRecord(record, options) {
    cancelClose();
    pinned = record.iata;
    highlighted = record.iata;
    if (location.hash !== "#" + record.iata) {
      history.replaceState(null, "", "#" + record.iata);
    }
    applyStyles();
    renderList(records.filter(function (item) { return item.visible; }));
    var button = el.list.querySelector('[data-iata="' + record.iata + '"]');
    if (button) button.scrollIntoView({ block: "nearest" });
    openRecordPopup(record);
    if (options.fly) focusRoute(record);
  }

  function fitWorld() {
    map.easeTo({ center: [28, 16], zoom: 1.15, duration: 650 });
  }

  function fitApac() {
    map.fitBounds([[95, -12], [152, 48]], { padding: 28, duration: 650 });
  }

  function addViewControl() {
    function ViewSwitch() {}
    ViewSwitch.prototype.onAdd = function () {
      var wrap = document.createElement("div");
      wrap.className = "maplibregl-ctrl view-control";
      wrap.innerHTML = '<button type="button" data-view="world">全球</button><button type="button" data-view="apac">亞太</button>';
      wrap.querySelector('[data-view="world"]').addEventListener("click", function (event) {
        event.preventDefault();
        fitWorld();
      });
      wrap.querySelector('[data-view="apac"]').addEventListener("click", function (event) {
        event.preventDefault();
        fitApac();
      });
      return wrap;
    };
    ViewSwitch.prototype.onRemove = function () {};
    map.addControl(new ViewSwitch(), "top-right");
  }

  function addHub() {
    var wrap = document.createElement("div");
    wrap.className = "hub";
    wrap.innerHTML =
      '<span class="hub-dot" aria-hidden="true"></span>' +
      '<span class="hub-label">香港 (HKG)' +
        '<button type="button" class="hub-close" aria-label="關閉標籤">×</button>' +
      "</span>";
    new maplibregl.Marker({ element: wrap, anchor: "center" })
      .setLngLat([origin.lon, origin.lat])
      .addTo(map);
    wrap.querySelector(".hub-close").addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      wrap.querySelector(".hub-label").hidden = true;
    });
  }

  function appendAttribution() {
    var inner = document.querySelector(".maplibregl-ctrl-attrib-inner");
    if (!inner || inner.dataset.extra) return;
    inner.dataset.extra = "1";
    var span = document.createElement("span");
    span.innerHTML =
      ' · 航點：<a href="https://en.wikipedia.org/wiki/Hong_Kong_International_Airport#Airlines_and_destinations" target="_blank" rel="noopener">維基百科 HKG 航點表</a>（截至 ' +
      esc(data.meta.asOf) +
      '） · 座標：<a href="https://ourairports.com/data/" target="_blank" rel="noopener">OurAirports</a>';
    inner.appendChild(span);
  }

  function fillAbout() {
    var source = data.meta.sources[0];
    var coords = data.meta.sources[1];
    el.about.innerHTML =
      "資料截至 " + esc(data.meta.asOfLabel) + "。<br>" +
      '航點：<a href="' + esc(source.url) + '" target="_blank" rel="noopener">' + esc(source.name) + "</a>。<br>" +
      '座標：<a href="' + esc(coords.url) + '" target="_blank" rel="noopener">OurAirports</a>（按 IATA 代碼對照，並非估算）。<br>' +
      '地圖：<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> Positron（© OpenStreetMap © OpenMapTiles）。<br>' +
      esc(data.meta.macauNote) + "<br>" +
      "出發前請向航空公司或香港國際機場查詢最新航班。";
    el.subtitle.innerHTML = "非經停客運航點 · 截至 <time datetime=\"" + esc(data.meta.asOf) + "\">" + esc(data.meta.asOfLabel) + "</time>";
  }

  function wireUi() {
    el.search.addEventListener("input", applyFilters);
    el.airline.addEventListener("change", applyFilters);
    el.status.addEventListener("change", applyFilters);
    el.regions.addEventListener("click", function (event) {
      var chip = event.target.closest(".chip");
      if (!chip) return;
      regionFilter = chip.getAttribute("data-region");
      applyFilters();
    });
    el.reset.addEventListener("click", function () {
      regionFilter = "all";
      el.airline.value = "all";
      el.status.value = "all";
      el.search.value = "";
      applyFilters();
    });
    el.list.addEventListener("click", function (event) {
      var button = event.target.closest(".item");
      if (!button) return;
      var record = records.filter(function (item) { return item.iata === button.getAttribute("data-iata"); })[0];
      if (record) selectRecord(record, { fly: true });
    });
    el.list.addEventListener("mouseover", function (event) {
      var button = event.target.closest(".item");
      if (!button || pinned) return;
      var record = records.filter(function (item) { return item.iata === button.getAttribute("data-iata"); })[0];
      if (!record) return;
      cancelClose();
      highlighted = record.iata;
      applyStyles();
      openRecordPopup(record);
    });
    el.list.addEventListener("mouseout", function (event) {
      if (pinned) return;
      var button = event.target.closest(".item");
      if (!button) return;
      var nextItem = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".item");
      if (nextItem === button) return;
      var record = records.filter(function (item) { return item.iata === button.getAttribute("data-iata"); })[0];
      if (record) scheduleClose(record);
    });
    el.panelToggle.addEventListener("click", function () {
      var collapsed = el.panel.classList.toggle("collapsed");
      el.panelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      el.panelToggle.textContent = collapsed ? "顯示列表" : "隱藏列表";
      setTimeout(function () { map.resize(); }, 50);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "/" && document.activeElement !== el.search) {
        event.preventDefault();
        el.search.focus();
      }
      if (event.key === "Escape") {
        pinned = null;
        highlighted = null;
        closeRecordPopup();
        applyStyles();
        renderList(records.filter(function (item) { return item.visible; }));
      }
    });
  }

  function findRecord(iata) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].iata === iata) return records[i];
    }
    return null;
  }

  function bootMap() {
    var lineFeatures = [];
    var pointFeatures = [];
    records = data.destinations.map(function (raw) {
      var record = Object.assign({ visible: true }, raw);
      var segments = HKGeo.routeSegments(origin.lat, origin.lon, record.lat, record.lon, 160);
      segments.forEach(function (segment) {
        lineFeatures.push({
          type: "Feature",
          properties: { iata: record.iata },
          geometry: {
            type: "LineString",
            coordinates: segment.map(function (point) { return [point[1], point[0]]; })
          }
        });
      });
      pointFeatures.push({
        type: "Feature",
        properties: { iata: record.iata, color: COLORS[record.region] || "#64748b" },
        geometry: { type: "Point", coordinates: [record.lon, record.lat] }
      });
      return record;
    });

    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [origin.lon, origin.lat],
      zoom: 1.4,
      minZoom: 0.8,
      attributionControl: true,
      hash: false
    });
    popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: "320px",
      className: "route-popup",
      offset: 16
    });
    popup.on("open", function () {
      var node = popup.getElement();
      if (!node || node.dataset.hoverBound) return;
      node.dataset.hoverBound = "1";
      node.addEventListener("mouseenter", cancelClose);
      node.addEventListener("mouseleave", function () {
        if (pinned) return;
        var record = findRecord(highlighted);
        if (record) scheduleClose(record);
      });
    });
    popup.on("close", function () {
      if (ignoreClose) return;
      pinned = null;
      highlighted = null;
      applyStyles();
      var buttons = el.list.querySelectorAll(".item.active");
      Array.prototype.forEach.call(buttons, function (button) { button.classList.remove("active"); });
    });

    map.on("load", function () {
      map.addSource("routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: lineFeatures }
      });
      map.addSource("destinations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: pointFeatures }
      });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": LINE, "line-width": 1.2, "line-opacity": 0.52 }
      });
      map.addLayer({
        id: "destinations",
        type: "circle",
        source: "destinations",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 4.2,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.35
        }
      });
      mapReady = true;
      addHub();
      addViewControl();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      syncMapFilter(records.filter(function (record) { return record.visible; }));

      map.on("mouseenter", "destinations", function () {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "destinations", function () {
        map.getCanvas().style.cursor = "";
        if (pinned) {
          highlighted = pinned;
          applyStyles();
          return;
        }
        var record = findRecord(highlighted);
        if (record) scheduleClose(record);
      });
      map.on("mousemove", "destinations", function (event) {
        var feature = event.features && event.features[0];
        if (!feature) return;
        var iata = feature.properties.iata;
        if (highlighted === iata && popup.isOpen()) return;
        var record = findRecord(iata);
        if (!record) return;
        cancelClose();
        highlighted = iata;
        applyStyles();
        if (!pinned) openRecordPopup(record);
      });
      map.on("click", "destinations", function (event) {
        var feature = event.features && event.features[0];
        if (!feature) return;
        var record = findRecord(feature.properties.iata);
        if (record) selectRecord(record, { fly: true });
      });
      map.on("click", function (event) {
        var hits = map.queryRenderedFeatures(event.point, { layers: ["destinations"] });
        if (hits.length) return;
        if (!popup.isOpen() && !pinned) return;
        pinned = null;
        highlighted = null;
        closeRecordPopup();
        applyStyles();
        renderList(records.filter(function (record) { return record.visible; }));
      });

      if ((location.hash || "").replace("#", "")) openFromHash();
      else fitWorld();
      map.once("idle", appendAttribution);
    });
  }

  function openFromHash() {
    var code = (location.hash || "").replace("#", "").toUpperCase();
    if (!code) return;
    var record = records.filter(function (item) { return item.iata === code; })[0];
    if (!record) return;
    selectRecord(record, { fly: true });
  }

  fetch("data/destinations.json")
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (payload) {
      data = payload;
      origin = payload.meta.origin;
      if (!payload.destinations || payload.destinations.length !== payload.meta.airportCount) {
        throw new Error("航點數量與資料不一致");
      }
      fillAbout();
      bootMap();
      buildRegionChips();
      buildAirlineSelect();
      wireUi();
      applyFilters();
    })
    .catch(function (error) {
      el.subtitle.textContent = "航點資料載入失敗";
      el.about.textContent = "無法讀取 data/destinations.json。請以網站伺服器開啟此頁（不要直接打開檔案）。" + (error && error.message ? " " + error.message : "");
    });
})();
