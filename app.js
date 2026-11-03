(() => {
  "use strict";
  const DEFAULT_CITIES = [
    { id: "seoul", name: "Seoul", zone: "Asia/Seoul", home: true },
    { id: "london", name: "London", zone: "Europe/London" },
    { id: "new-york", name: "New York", zone: "America/New_York" },
    { id: "los-angeles", name: "Los Angeles", zone: "America/Los_Angeles" }
  ];
  const KNOWN_CITIES = [
    ...DEFAULT_CITIES, { name: "Tokyo", zone: "Asia/Tokyo" }, { name: "Paris", zone: "Europe/Paris" }, { name: "Berlin", zone: "Europe/Berlin" }, { name: "Singapore", zone: "Asia/Singapore" }, { name: "Hong Kong", zone: "Asia/Hong_Kong" }, { name: "Sydney", zone: "Australia/Sydney" }, { name: "Auckland", zone: "Pacific/Auckland" }, { name: "Dubai", zone: "Asia/Dubai" }, { name: "Mumbai", zone: "Asia/Kolkata" }, { name: "Bangkok", zone: "Asia/Bangkok" }, { name: "Antalya", zone: "Europe/Istanbul" }, { name: "San Francisco", zone: "America/Los_Angeles" }, { name: "Chicago", zone: "America/Chicago" }, { name: "Mexico City", zone: "America/Mexico_City" }, { name: "São Paulo", zone: "America/Sao_Paulo" }, { name: "Vancouver", zone: "America/Vancouver" }, { name: "Honolulu", zone: "Pacific/Honolulu" }
  ];
  const ALL_CITIES = (() => { try { return [...KNOWN_CITIES, ...Intl.supportedValuesOf("timeZone").map(zone => ({ name: zone.split("/").pop().replace(/_/g, " "), zone }))]; } catch { return KNOWN_CITIES; } })();
  const stored = (() => { try { return JSON.parse(localStorage.getItem("onetime-cities")); } catch { return null; } })();
  const DISPLAY_KEY = "onetime-display";
  const DEFAULT_DISPLAY = { typeScale: 100, palette: "balanced", hourCycle: "h23", homeMode: "fixed" };
  const LEGACY_TYPE_SCALES = { small: 85, medium: 90, large: 100, "x-large": 110, "xx-large": 120 };
  const storedDisplay = (() => { try { return JSON.parse(localStorage.getItem(DISPLAY_KEY)); } catch { return null; } })();
  const savedScale = storedDisplay && Number(storedDisplay.typeScale);
  const migratedLegacyScale = storedDisplay && !Number.isFinite(savedScale) ? LEGACY_TYPE_SCALES[storedDisplay.fontSize] : null;
  const display = {
    ...DEFAULT_DISPLAY,
    ...(Number.isFinite(savedScale) && savedScale >= 85 && savedScale <= 180 ? { typeScale: Math.round(savedScale / 5) * 5 } : migratedLegacyScale ? { typeScale: migratedLegacyScale } : {}),
    ...(storedDisplay && ["balanced", "contrast", "warm"].includes(storedDisplay.palette) ? { palette: storedDisplay.palette } : {}),
    ...(storedDisplay && ["h23", "h12"].includes(storedDisplay.hourCycle) ? { hourCycle: storedDisplay.hourCycle } : {}),
    ...(storedDisplay && ["fixed", "device"].includes(storedDisplay.homeMode) ? { homeMode: storedDisplay.homeMode } : {})
  };
  const resolvedDeviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul"; } catch { return "Asia/Seoul"; } };
  const state = { instant: new Date(), dragging: false, scrubbed: false, startAngle: 0, startInstant: 0, timer: null, hapticSlot: null, hapticAt: 0, surfaceKey: null, surfaceClear: null, surfaceFrame: null, surfaceRelease: null, surfaceReleases: [], surfaceTug: null, surfaceGeometry: null, liveInstant: null, deviceZone: resolvedDeviceZone(), deviceZoneOverride: false, display, cities: Array.isArray(stored) && stored.length ? stored : DEFAULT_CITIES };
  const canvas = document.querySelector("#dial"), dialPanel = document.querySelector("#dial-panel");
  const ctx = canvas.getContext("2d");
  const labels = document.querySelector("#city-labels");
  const nowButton = document.querySelector("#now-button");
  const timeOut = document.querySelector("#current-time");
  const homeCityOut = document.querySelector("#home-city");
  const previousDate = document.querySelector("#previous-date");
  const currentDate = document.querySelector("#current-date");
  const dateSeam = document.querySelector(".date-seam");
  const drawer = document.querySelector("#city-drawer"), search = document.querySelector("#city-search"), settings = document.querySelector("#settings-sheet"), cityList = document.querySelector("#city-list"), query = document.querySelector("#city-query"), results = document.querySelector("#search-results");
  const shareSheet = document.querySelector("#share-sheet"), shareText = document.querySelector("#share-text");
  const appShell = document.querySelector(".app-shell");
  const followDeviceZone = document.querySelector("#follow-device-zone");
  const homeModeStatus = document.querySelector("#home-mode-status");
  // The two sides of the footer are the two legal sides of the International
  // Date Line.  Kiritimati is UTC+14; Honolulu is UTC-10 and has no DST.
  const DATE_LINE_EAST = { zone: "Pacific/Kiritimati" };
  const DATE_LINE_WEST = { zone: "Pacific/Honolulu" };
  const parts = (zone, date = state.instant) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  const minutesAt = (city, date) => { const p = parts(city.zone, date); return Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60; };
  const minutes = city => minutesAt(city, state.instant);
  const time = city => {
    if (state.display.hourCycle === "h12") return new Intl.DateTimeFormat("en-US", { timeZone: city.zone, hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(state.instant);
    const p = parts(city.zone); return `${p.hour}:${p.minute}`;
  };
  const activeCities = () => {
    if (state.display.homeMode !== "device") return state.cities;
    const matchingIndex = state.cities.findIndex(city => city.zone === state.deviceZone);
    if (matchingIndex >= 0) return state.cities.map((city, index) => ({ ...city, home: index === matchingIndex }));
    return [{ id: "device-local", name: "Local", zone: state.deviceZone, home: true, device: true }, ...state.cities.map(city => ({ ...city, home: false }))];
  };
  const home = () => activeCities().find(city => city.home) || activeCities()[0];
  const persist = () => localStorage.setItem("onetime-cities", JSON.stringify(state.cities));
  function persistDisplay() { localStorage.setItem(DISPLAY_KEY, JSON.stringify(state.display)); }
  function applyDisplay() {
    appShell.dataset.palette = state.display.palette;
    const scale = state.display.typeScale / 100;
    // Set final values here: older iOS Safari did not reliably resolve arithmetic in custom properties.
    appShell.style.setProperty("--city-label-size", `clamp(${(12 * scale).toFixed(2)}px, ${(3.1 * scale).toFixed(2)}vw, ${(17 * scale).toFixed(2)}px)`);
    appShell.style.setProperty("--city-label-width", `${Math.min(168, 96 * scale).toFixed(0)}px`);
    document.querySelector("#type-scale").value = String(state.display.typeScale);
    document.querySelector("#type-scale-output").value = `${state.display.typeScale}%`;
    document.querySelector("#type-scale-output").textContent = `${state.display.typeScale}%`;
    document.querySelector(`#palette-options input[value="${state.display.palette}"]`).checked = true;
    document.querySelector(`#time-format-options input[value="${state.display.hourCycle}"]`).checked = true;
    followDeviceZone.checked = state.display.homeMode === "device";
    const fixedHome = state.cities.find(city => city.home) || state.cities[0];
    homeModeStatus.textContent = state.display.homeMode === "device" ? `Following device time zone · ${state.deviceZone.replaceAll("_", " ")}` : `Fixed home · ${fixedHome.name}`;
    if (migratedLegacyScale) persistDisplay();
  }
  const angleAt = (event) => { const rect = canvas.getBoundingClientRect(); return Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2); };
  const shortest = delta => ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  const liveNow = () => state.liveInstant || new Date();
  const HAPTIC_INCREMENT_MS = 15 * 60 * 1000;
  const HAPTIC_MIN_GAP_MS = 70;
  function hapticTick({ reset = false } = {}) {
    if (typeof navigator.vibrate !== "function") return false;
    const now = Date.now();
    if (!reset) {
      const slot = Math.floor(state.instant.getTime() / HAPTIC_INCREMENT_MS);
      if (slot === state.hapticSlot || now - state.hapticAt < HAPTIC_MIN_GAP_MS) return false;
      state.hapticSlot = slot;
    }
    state.hapticAt = now;
    try { navigator.vibrate(reset ? 18 : 8); return true; } catch { return false; }
  }
  const DAYBREAK_MINUTES = 6 * 60;
  const NIGHTFALL_MINUTES = 18 * 60;
  const SURFACE_MIN_GAP_MS = 180;
  const SURFACE_RELEASE_MS = 460;
  function crossedHorizon(before, after) {
    if (before === after) return null;
    const forward = after > before;
    const lower = Math.min(before, after), upper = Math.max(before, after);
    const boundaries = [];
    for (const hour of [DAYBREAK_MINUTES, NIGHTFALL_MINUTES]) {
      const firstDay = Math.floor((lower - hour) / 1440);
      const lastDay = Math.floor((upper - hour) / 1440);
      for (let day = firstDay; day <= lastDay; day += 1) {
        const boundary = day * 1440 + hour;
        const crossed = forward ? boundary > before && boundary <= after : boundary < before && boundary >= after;
        if (crossed) boundaries.push({ boundary, kind: hour === DAYBREAK_MINUTES ? "daybreak" : "nightfall" });
      }
    }
    if (!boundaries.length) return null;
    boundaries.sort((a, b) => a.boundary - b.boundary);
    return forward ? boundaries[boundaries.length - 1].kind : boundaries[0].kind;
  }
  function clearSurfaceRelease() {
    if (state.surfaceClear) window.clearTimeout(state.surfaceClear);
    if (state.surfaceFrame) window.cancelAnimationFrame(state.surfaceFrame);
    state.surfaceClear = null;
    state.surfaceFrame = null;
    state.surfaceRelease = null;
    state.surfaceReleases = [];
    delete dialPanel.dataset.surfaceCrossing;
    delete dialPanel.dataset.surfaceDirection;
    delete dialPanel.dataset.surfaceTug;
    state.surfaceTug = null;
  }
  function releaseGeometry(release, at = performance.now()) {
    const raw = Math.max(0, Math.min(1, (at - release.startedAt) / release.duration));
    const travel = 1 - Math.pow(1 - raw, 2.3);
    // One broad lobe: no packet, colour, secondary ripple, or independent line.
    // The lobe becomes legible in its first iPhone frame, peaks at 16 px and releases
    // early rather than waiting for the middle of the gesture to become visible.
    return { raw, travel, amplitude: Math.sin(Math.PI * Math.pow(raw, .68)) * 16, width: 64 + raw * 20 };
  }
  function animateSurfaceRelease() {
    draw();
    state.surfaceReleases = state.surfaceReleases.filter(release => releaseGeometry(release).raw < 1);
    state.surfaceRelease = state.surfaceReleases[state.surfaceReleases.length - 1] || null;
    if (state.surfaceRelease) state.surfaceFrame = window.requestAnimationFrame(animateSurfaceRelease);
    else clearSurfaceRelease();
  }
  function startSurfaceRelease(crossing, duration = SURFACE_RELEASE_MS) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const release = { kind: crossing.kind, direction: crossing.direction, startedAt: performance.now() - (reduced ? duration * .48 : 0), duration };
    // Releases stay attached to the filled seam. Later pointer frames cannot replace one
    // before it has painted; a brief queue covers a deliberate reversal through the line.
    state.surfaceReleases = [...state.surfaceReleases.filter(item => releaseGeometry(item).raw < 1), release].slice(-2);
    state.surfaceRelease = release;
    if (reduced) { draw(); state.surfaceClear = window.setTimeout(clearSurfaceRelease, 160); return; }
    if (!state.surfaceFrame) state.surfaceFrame = window.requestAnimationFrame(animateSurfaceRelease);
  }
  function surfaceTug(beforeInstant) {
    const forward = state.instant > beforeInstant;
    const city = home();
    const candidate = (() => {
      const before = wallMinutes(city, beforeInstant), after = wallMinutes(city, state.instant);
      const kind = crossedHorizon(before, after);
      const local = minutes(city);
      // Surface tension is directional: sunrise catches just before the line while moving
      // forward; sunset trails just after it. Reverse the relationship while rewinding.
      const window = forward
        ? (local >= 330 && local <= 360 ? { boundary: DAYBREAK_MINUTES, kind: "daybreak" } : local >= 1080 && local <= 1135 ? { boundary: NIGHTFALL_MINUTES, kind: "nightfall" } : null)
        : (local >= 360 && local <= 390 ? { boundary: DAYBREAK_MINUTES, kind: "daybreak" } : local >= 1025 && local <= 1080 ? { boundary: NIGHTFALL_MINUTES, kind: "nightfall" } : null);
      const boundary = kind === "daybreak" ? DAYBREAK_MINUTES : kind === "nightfall" ? NIGHTFALL_MINUTES : window && window.boundary;
      const distance = boundary === undefined ? Infinity : Math.abs(local - boundary);
      return { city, kind: kind || (window && window.kind), crossed: Boolean(kind), local, boundary, distance };
    })();
    if (!candidate.kind) { state.surfaceTug = null; delete dialPanel.dataset.surfaceTug; return null; }
    state.surfaceTug = { ...candidate, direction: forward ? "forward" : "backward" };
    dialPanel.dataset.surfaceTug = `${city.id || city.zone}-${forward ? "forward" : "backward"}`;
    return state.surfaceTug;
  }
  function surfacePulse(beforeInstant) {
    const tug = surfaceTug(beforeInstant);
    const crossing = tug && tug.crossed ? tug : null;
    if (!crossing) return false;
    const now = Date.now();
    const key = `${crossing.city.id || crossing.city.zone}-${crossing.kind}-${crossing.direction}`;
    if (state.surfaceKey && state.surfaceKey.key === key && now - state.surfaceKey.at < SURFACE_MIN_GAP_MS) return false;
    state.surfaceKey = { key, at: now };
    if (state.surfaceClear) window.clearTimeout(state.surfaceClear);
    dialPanel.dataset.surfaceCrossing = crossing.kind;
    dialPanel.dataset.surfaceDirection = crossing.direction;
    startSurfaceRelease(crossing);
    return true;
  }
  function dayLabel(zone, date = state.instant) {
    const p = parts(zone, date);
    return `<strong>${p.weekday}</strong>${p.day} ${new Intl.DateTimeFormat("en-GB", { timeZone: zone, month: "long" }).format(date).toUpperCase()}`;
  }
  function dateLineSector() {
    const lineMinutes = minutesAt(DATE_LINE_EAST, state.instant);
    const phase = lineMinutes / 1440 * Math.PI * 2;
    return { minutes: lineMinutes, phase, side: phase <= Math.PI ? "left" : "right", sweep: phase <= Math.PI ? phase : Math.PI * 2 - phase, angle: Math.PI / 2 + phase };
  }
  function updateDateProjection(sector, w, h) {
    // The canvas covers the inner portion of this sampled wedge, leaving its continuation
    // visible outside the globe in whichever direction the moving ray points.
    const depth = Math.max(48, Math.round(dateSeam.getBoundingClientRect().bottom - dialPanel.getBoundingClientRect().bottom));
    // The ray may travel above or to either side of the globe. Give its non-interactive
    // underlay enough room to leave the panel entirely, rather than clipping it to a square.
    const overscan = Math.ceil(Math.max(window.innerWidth, window.innerHeight, w, h) * 1.15);
    dialPanel.style.setProperty("--date-projection-depth", `${depth}px`);
    dialPanel.style.setProperty("--date-projection-overscan", `${overscan}px`);
    const totalW = w + overscan * 2, totalH = h + depth + overscan * 2, cx = w / 2 + overscan, cy = h / 2 + overscan, radius = Math.max(totalW, totalH) * 2;
    const start = sector.side === "left" ? Math.PI / 2 : sector.angle;
    const end = sector.side === "left" ? sector.angle : Math.PI / 2 + Math.PI * 2;
    const samples = Math.max(3, Math.ceil((end - start) / (Math.PI / 20)));
    const points = [`${cx}px ${cy}px`];
    for (let i = 0; i <= samples; i += 1) {
      const a = start + (end - start) * i / samples;
      points.push(`${(cx + Math.cos(a) * radius).toFixed(1)}px ${(cy + Math.sin(a) * radius).toFixed(1)}px`);
    }
    const projection = document.querySelector("#date-sector-projection");
    projection.style.setProperty("--date-projection-origin-x", `${cx}px`);
    projection.style.setProperty("--date-projection-origin-y", `${cy}px`);
    projection.style.clipPath = `polygon(${points.join(",")})`;
    projection.dataset.side = sector.side;
    projection.dataset.dateFor = sector.side === "left" ? "current-date" : "previous-date";
    projection.dataset.minutes = String(Math.round(sector.minutes));
    dialPanel.dataset.dateSector = sector.side;
  }
  function size() { const rect = canvas.getBoundingClientRect(); const scale = window.devicePixelRatio || 1; canvas.width = Math.round(rect.width * scale); canvas.height = Math.round(rect.height * scale); ctx.setTransform(scale, 0, 0, scale, 0, 0); return rect; }
  function labelVisualBounds(label, panelBounds) {
    // The fixed-width label container is deliberately wider than many city names.
    // Lay out against the painted name and time rather than that transparent space.
    const textBounds = node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()];
      return rects.length ? rects : [node.getBoundingClientRect()];
    };
    const rects = [...textBounds(label.querySelector(".city-name")), ...textBounds(label.querySelector("time"))];
    return {
      left: Math.min(...rects.map(rect => rect.left)) - panelBounds.left,
      top: Math.min(...rects.map(rect => rect.top)) - panelBounds.top,
      right: Math.max(...rects.map(rect => rect.right)) - panelBounds.left,
      bottom: Math.max(...rects.map(rect => rect.bottom)) - panelBounds.top
    };
  }
  function boxesOverlap(first, second, padding = 6) {
    return first.left - padding < second.right && first.right + padding > second.left && first.top - padding < second.bottom && first.bottom + padding > second.top;
  }
  function boxFitsDial(box, x, y, r) {
    const inset = 3;
    return [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]].every(([px, py]) => Math.hypot(px - x, py - y) <= r - inset);
  }
  function layoutCityLabels(entries, panelBounds, x, y, r) {
    const placed = [];
    // Home is placed first so it keeps its familiar position when space is scarce.
    const ordered = [...entries].sort((a, b) => Number(Boolean(b.city.home)) - Number(Boolean(a.city.home)) || a.index - b.index);
    for (const entry of ordered) {
      const radial = { x: Math.cos(entry.angle), y: Math.sin(entry.angle) };
      const tangent = { x: -radial.y, y: radial.x };
      const tryOffsets = [
        [0, 0], [0, .19], [0, -.19], [-.07, .29], [-.07, -.29],
        [-.15, .11], [-.15, -.11], [-.18, .40], [-.18, -.40], [-.27, 0],
        [-.29, .32], [-.29, -.32], [-.38, .48], [-.38, -.48], [-.43, 0]
      ];
      let fallback = null;
      for (const [inward, sideways] of tryOffsets) {
        const candidateX = entry.baseX + radial.x * inward * r + tangent.x * sideways * r;
        const candidateY = entry.baseY + radial.y * inward * r + tangent.y * sideways * r;
        entry.label.style.left = `${candidateX}px`;
        entry.label.style.top = `${candidateY}px`;
        const box = labelVisualBounds(entry.label, panelBounds);
        const overlaps = placed.filter(other => boxesOverlap(box, other.box)).length;
        const fits = boxFitsDial(box, x, y, r);
        if (!fallback || overlaps < fallback.overlaps || (overlaps === fallback.overlaps && fits && !fallback.fits)) fallback = { box, overlaps, fits, x: candidateX, y: candidateY };
        if (fits && !overlaps) { fallback = { box, overlaps, fits, x: candidateX, y: candidateY }; break; }
      }
      // A very crowded dial still has a deterministic least-overlap destination.
      entry.label.style.left = `${fallback.x}px`;
      entry.label.style.top = `${fallback.y}px`;
      placed.push({ entry, box: fallback.box });
    }
  }
  function draw() {
    const rect = size(), w = rect.width, h = rect.height, r = Math.min(w, h) * .455, x = w / 2, y = h / 2;
    const panelBounds = dialPanel.getBoundingClientRect();
    const homeIsDay = minutes(home()) >= DAYBREAK_MINUTES && minutes(home()) < NIGHTFALL_MINUTES;
    dialPanel.dataset.homePhase = homeIsDay ? "day" : "night";
    const sectorStyle = getComputedStyle(dialPanel);
    appShell.style.setProperty("--date-seam-edge", sectorStyle.getPropertyValue("--date-sector-edge").trim());
    const sector = dateLineSector();
    updateDateProjection(sector, w, h);
    ctx.clearRect(0, 0, w, h);
    // Paint daylight across the entire clipped globe before laying night below the
    // moving seam. A downward release exposes the area beneath the resting horizon;
    // keeping this as a full disk makes that exposed lobe daylight rather than the
    // transparent canvas/page behind it.
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = "#b7cede"; ctx.fill();
    // Day and night share one filled seam. The approaching home-city marker tugs that
    // seam, then the same lobe moves inward and settles. There is no stroked wake layer.
    const seamDisplacement = px => {
      let displacement = 0;
      const tug = state.surfaceTug;
      if (tug && !tug.crossed) {
        const localAngle = tug.local / 1440 * Math.PI * 2 + Math.PI / 2;
        const tugX = x + Math.cos(localAngle) * r * .8;
        const near = Math.max(0, 1 - tug.distance / 55);
        const incoming = tug.kind === "daybreak" ? 1 : -1;
        const direction = tug.direction === "forward" ? 1 : -1;
        const width = Math.max(34, r * .23);
        const lobe = Math.max(0, 1 - Math.abs(px - tugX) / width);
        displacement += incoming * direction * near * 12 * lobe * lobe;
      }
      for (const release of state.surfaceReleases) {
        const geometry = releaseGeometry(release);
        if (geometry.raw >= 1) continue;
        const side = release.kind === "daybreak" ? -1 : 1;
        const inward = -side;
        const centre = x + side * r + inward * (12 + r * .56 * geometry.travel);
        const normal = (release.kind === "daybreak" ? 1 : -1) * (release.direction === "forward" ? 1 : -1);
        const distance = Math.abs(px - centre) / geometry.width;
        const lobe = distance >= 1 ? 0 : Math.pow(Math.cos(distance * Math.PI / 2), 1.7);
        displacement += normal * geometry.amplitude * lobe;
      }
      return displacement;
    };
    const seamPoints = [];
    for (let step = 0; step <= 48; step += 1) {
      const px = x - r + (r * 2 * step / 48);
      seamPoints.push({ x: px, y: y + seamDisplacement(px) });
    }
    state.surfaceGeometry = { points: seamPoints.map(point => ({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 })), release: state.surfaceRelease && { ...releaseGeometry(state.surfaceRelease), kind: state.surfaceRelease.kind, direction: state.surfaceRelease.direction } };
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.moveTo(seamPoints[0].x, seamPoints[0].y);
    for (let index = 1; index < seamPoints.length; index += 1) ctx.lineTo(seamPoints[index].x, seamPoints[index].y);
    ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); ctx.fillStyle = "#080a21"; ctx.fill();
    ctx.restore();
    // International Date Line sector: 00:00–12:00 grows on the left, then the right side
    // shrinks from noon until the next midnight. Both rays move with the selected instant.
    ctx.beginPath(); ctx.moveTo(x, y);
    if (sector.side === "left") ctx.arc(x, y, r, Math.PI / 2, sector.angle);
    else ctx.arc(x, y, r, sector.angle, Math.PI / 2 + Math.PI * 2);
    ctx.closePath(); ctx.fillStyle = sectorStyle.getPropertyValue("--date-sector-fill").trim(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + r); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(sector.angle) * r, y + Math.sin(sector.angle) * r); ctx.strokeStyle = sectorStyle.getPropertyValue("--date-sector-edge").trim(); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1; ctx.stroke();
    if (state.scrubbed) {
      const selectedAngle = minutes(home()) / 1440 * Math.PI * 2 + Math.PI / 2;
      const liveAngle = minutesAt(home(), liveNow()) / 1440 * Math.PI * 2 + Math.PI / 2;
      const traceDelta = shortest(selectedAngle - liveAngle);
      const traceRadius = r * .80;
      // A quiet transient sweep keeps the drag direction legible without covering labels.
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(selectedAngle - .12) * r * 1.5, y + Math.sin(selectedAngle - .12) * r * 1.5); ctx.lineTo(x + Math.cos(selectedAngle + .12) * r * 1.5, y + Math.sin(selectedAngle + .12) * r * 1.5); ctx.closePath(); ctx.fillStyle = state.dragging ? "rgba(89,122,151,.16)" : "rgba(89,122,151,.07)"; ctx.fill(); ctx.restore();
      // The hollow ring fixes real home time in place; the dashed orbit traces the chosen
      // time in either direction. The dark keyline keeps white dashes legible over the sky.
      ctx.save(); ctx.lineCap = "round";
      ctx.setLineDash([5, 5]); ctx.lineDashOffset = 1;
      ctx.lineWidth = 3.6; ctx.strokeStyle = "rgba(12, 27, 40, .24)";
      ctx.beginPath(); ctx.arc(x, y, traceRadius, liveAngle, selectedAngle, traceDelta < 0); ctx.stroke();
      ctx.lineWidth = 1.65; ctx.strokeStyle = "rgba(255, 255, 255, .93)";
      ctx.beginPath(); ctx.arc(x, y, traceRadius, liveAngle, selectedAngle, traceDelta < 0); ctx.stroke();
      const gx = x + Math.cos(liveAngle) * traceRadius, gy = y + Math.sin(liveAngle) * traceRadius;
      const ghostRadius = Math.max(9, r * .055);
      ctx.setLineDash([4, 3]); ctx.lineDashOffset = 0;
      ctx.lineWidth = 3.6; ctx.strokeStyle = "rgba(12, 27, 40, .24)";
      ctx.beginPath(); ctx.arc(gx, gy, ghostRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.7; ctx.strokeStyle = "rgba(255, 255, 255, .94)";
      ctx.beginPath(); ctx.arc(gx, gy, ghostRadius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    labels.replaceChildren();
    const entries = [];
    const occupied = [];
    for (const [index, city] of activeCities().entries()) {
      const localMinutes = minutes(city), a = localMinutes / 1440 * Math.PI * 2 + Math.PI / 2;
      const collision = occupied.filter(other => Math.abs(other - localMinutes) < 26).length; occupied.push(localMinutes);
      const dotR = r * (.80 + collision * .055), labelR = r * (.58 - collision * .08), tangent = collision ? (collision % 2 ? 1 : -1) * r * .105 : 0;
      const dx = x + Math.cos(a) * dotR, dy = y + Math.sin(a) * dotR;
      const lx = x + Math.cos(a) * labelR + Math.cos(a + Math.PI / 2) * tangent, ly = y + Math.sin(a) * labelR + Math.sin(a + Math.PI / 2) * tangent;
      const day = localMinutes >= 360 && localMinutes < 1080 ? " is-day" : " is-night";
      const dot = document.createElement("i"); dot.className = `city-dot${city.home ? " is-home" : ""}${day}`; dot.setAttribute("aria-hidden", "true"); dot.style.left = `${dx / w * 100}%`; dot.style.top = `${dy / h * 100}%`;
      const label = document.createElement("div"); label.className = `city${city.home ? " is-home" : ""}${day}`; label.dataset.cityId = city.id || city.zone; label.setAttribute("aria-label", `${city.name}${city.home ? ", current location" : ""}, ${time(city)}`); if (city.home) label.setAttribute("aria-current", "true"); label.innerHTML = `<span class="city-name">${city.name}</span><time aria-hidden="true">${time(city)}</time>`;
      labels.append(dot, label);
      entries.push({ city, index, label, angle: a, baseX: lx, baseY: ly });
    }
    layoutCityLabels(entries, panelBounds, x, y, r);
    // The live region must be quiet between minute changes. Replacing identical text
    // on each one-second canvas redraw causes assistive technology to re-announce it.
    const hp = parts(home().zone), homeTimeText = time(home()), homeCityText = `${home().name} · Home`, homeTimeLabel = `Home time in ${home().name}`, homeDateTime = state.instant.toISOString().slice(0, 16) + "Z";
    if (timeOut.textContent !== homeTimeText) timeOut.textContent = homeTimeText;
    if (homeCityOut.textContent !== homeCityText) homeCityOut.textContent = homeCityText;
    if (timeOut.getAttribute("aria-label") !== homeTimeLabel) timeOut.setAttribute("aria-label", homeTimeLabel);
    if (timeOut.dateTime !== homeDateTime) timeOut.dateTime = homeDateTime;
    currentDate.innerHTML = dayLabel(DATE_LINE_EAST.zone); previousDate.innerHTML = dayLabel(DATE_LINE_WEST.zone);
    dialPanel.setAttribute("aria-valuenow", String(Math.floor(minutes(home()))));
    const homeParts = parts(home().zone);
    dialPanel.setAttribute("aria-valuetext", `${homeParts.weekday} ${Number(homeParts.day)} ${new Intl.DateTimeFormat("en-GB", { timeZone: home().zone, month: "long" }).format(state.instant)}, ${time(home())} in ${home().name}`);
    dialPanel.dataset.scrubbed = String(state.scrubbed);
    dialPanel.dataset.liveTrace = String(state.scrubbed);
    nowButton.disabled = !state.scrubbed;
    nowButton.setAttribute("aria-label", state.scrubbed ? "Return to current time" : "Showing current time");
    nowButton.title = state.scrubbed ? "Return to now" : "At current time";
  }
  function pulseDial() { dialPanel.classList.remove("is-resetting"); void dialPanel.offsetWidth; dialPanel.classList.add("is-resetting"); }
  function resetNow() { state.instant = new Date(); state.scrubbed = false; state.hapticSlot = Math.floor(state.instant.getTime() / HAPTIC_INCREMENT_MS); hapticTick({ reset: true }); pulseDial(); draw(); }
  canvas.addEventListener("pointerdown", event => { state.dragging = true; state.moved = false; state.startX = event.clientX; state.startY = event.clientY; state.startAngle = angleAt(event); state.startInstant = state.instant.getTime(); state.hapticSlot = Math.floor(state.startInstant / HAPTIC_INCREMENT_MS); canvas.setPointerCapture(event.pointerId); dialPanel.dataset.dragging = "true"; });
  canvas.addEventListener("pointermove", event => {
    if (!state.dragging) return;
    // Do not advance the crossing baseline during jitter inside the drag threshold.
    // Otherwise a slow 05:45→06:00 turn can visit 05:50/05:55 while `moved` is false,
    // then cross 06:00 on the first recognised move with no remaining boundary to pulse.
    const movedNow = Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 7;
    if (!state.moved && !movedNow) return;
    state.moved = true;
    state.scrubbed = true;
    const previousInstant = state.instant;
    const turns = shortest(angleAt(event) - state.startAngle) / (Math.PI * 2);
    state.instant = new Date(state.startInstant + turns * 86400000);
    hapticTick(); surfacePulse(previousInstant); draw();
  });
  canvas.addEventListener("pointerup", () => { if (!state.moved) resetNow(); state.dragging = false; delete dialPanel.dataset.dragging; }); canvas.addEventListener("pointercancel", () => { state.dragging = false; delete dialPanel.dataset.dragging; });
  canvas.addEventListener("dblclick", resetNow); nowButton.addEventListener("click", resetNow);
  dialPanel.addEventListener("keydown", event => { const step = event.shiftKey ? 60 : 15; const previousInstant = state.instant; if (event.key === "ArrowLeft") { state.instant = new Date(state.instant.getTime() - step * 60000); } else if (event.key === "ArrowRight") { state.instant = new Date(state.instant.getTime() + step * 60000); } else if (event.key === "Home") { resetNow(); event.preventDefault(); return; } else return; state.scrubbed = true; hapticTick(); surfacePulse(previousInstant); event.preventDefault(); draw(); });
  function wallMinutes(city, date = state.instant) { const p = parts(city.zone, date); return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) / 60000; }
  function cityOffset(city) { const delta = wallMinutes(city) - wallMinutes(home()); const sign = delta >= 0 ? "+" : "-"; const absolute = Math.abs(delta); return `${sign}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`; }
  function cityMeta(city) { return city.zone.replace("_", " · ").replace("/", " · "); }
  function renderCities() {
    cityList.replaceChildren();
    const activeHome = home();
    state.cities.forEach((city, index) => {
      const isActiveHome = (city.id || city.zone) === (activeHome.id || activeHome.zone);
      const homeSuffix = isActiveHome ? " · home" : city.home && state.display.homeMode === "device" ? " · fixed home" : "";
      const row = document.createElement("article"); row.className = "city-row";
      row.innerHTML = `<i class="city-dot${isActiveHome ? " is-home" : ""}"></i><div><h2>${city.name}${homeSuffix}</h2><p>${cityMeta(city)}</p></div><div><time>${time(city)}</time><div class="offset">UTC ${cityOffset(city)}</div><div class="row-actions"><button data-act="home" data-id="${city.id || city.zone}" aria-label="Make ${city.name} the fixed home city" ${isActiveHome && state.display.homeMode === "fixed" ? "disabled" : ""}>⌂</button><button data-act="up" data-id="${city.id || city.zone}" aria-label="Move ${city.name} up" ${index === 0 ? "disabled" : ""}>↑</button><button data-act="down" data-id="${city.id || city.zone}" aria-label="Move ${city.name} down" ${index === state.cities.length - 1 ? "disabled" : ""}>↓</button><button data-act="remove" data-id="${city.id || city.zone}" aria-label="Remove ${city.name}" ${city.home || isActiveHome ? "disabled" : ""}>×</button></div></div>`;
      cityList.append(row);
    });
  }
  const overlayLayers = [drawer, search, settings, shareSheet];
  function updateBackdrop() { appShell.classList.toggle("has-overlay", overlayLayers.some(layer => layer.classList.contains("is-open"))); }
  function setLayer(layer, open) {
    const closeId = String((Number(layer.dataset.closeId) || 0) + 1);
    layer.dataset.closeId = closeId;
    layer.setAttribute("aria-hidden", String(!open));
    if (open) { layer.hidden = false; void layer.offsetWidth; layer.classList.add("is-open"); updateBackdrop(); return; }
    layer.classList.remove("is-open");
    updateBackdrop();
    let fallback = 0;
    const cleanup = () => { layer.removeEventListener("transitionend", finish); layer.removeEventListener("transitioncancel", finish); clearTimeout(fallback); };
    const finish = event => {
      if (event && event.target !== layer) return;
      if (event?.type === "transitionend" && event.propertyName !== "transform") return;
      cleanup();
      if (layer.dataset.closeId !== closeId || layer.classList.contains("is-open")) return;
      layer.hidden = true;
      updateBackdrop();
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    else { layer.addEventListener("transitionend", finish); layer.addEventListener("transitioncancel", finish); fallback = setTimeout(finish, 520); }
  }
  window.addEventListener("pageshow", updateBackdrop);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateBackdrop(); });
  function showDrawer(open) { setLayer(drawer, open); if (open) renderCities(); }
  function showSettings(open) {
    if (open) drawer.setAttribute("aria-hidden", "true");
    setLayer(settings, open);
    if (!open) drawer.setAttribute("aria-hidden", "false");
  }
  function renderResults() { const needle = query.value.trim().toLowerCase(); const cityKey = city => `${city.name.toLowerCase()}|${city.zone}`; results.replaceChildren(); ALL_CITIES.filter((city, index, all) => all.findIndex(other => cityKey(other) === cityKey(city)) === index).filter(city => !state.cities.some(existing => cityKey(existing) === cityKey(city))).filter(city => !needle || `${city.name} ${city.zone}`.toLowerCase().includes(needle)).slice(0, 40).forEach(city => { const button = document.createElement("button"); button.className = "search-result"; button.type = "button"; button.innerHTML = `<strong>${city.name}</strong><span>${city.zone.replace("_", " ")}</span>`; button.onclick = () => { state.cities.push({ id: city.name.toLowerCase().replace(/\s+/g, "-"), name: city.name, zone: city.zone }); persist(); setLayer(search, false); showDrawer(true); draw(); }; results.append(button); }); }
  document.querySelector(".menu-button").addEventListener("click", () => showDrawer(true)); document.querySelector("#drawer-close").addEventListener("click", () => showDrawer(false)); document.querySelector("#drawer-add").addEventListener("click", () => { setLayer(search, true); query.value = ""; renderResults(); query.focus(); }); document.querySelector("#search-close").addEventListener("click", () => setLayer(search, false)); document.querySelector("#drawer-settings").addEventListener("click", () => showSettings(true)); document.querySelector("#settings-close").addEventListener("click", () => showSettings(false)); query.addEventListener("input", renderResults);
  document.querySelector("#type-scale").addEventListener("input", event => {
    state.display.typeScale = Number(event.target.value);
    persistDisplay(); applyDisplay(); draw();
  });
  settings.addEventListener("change", event => {
    const input = event.target.closest("input");
    if (!input) return;
    if (input.name === "palette") state.display.palette = input.value;
    else if (input.name === "hour-cycle") state.display.hourCycle = input.value;
    else if (input.id === "follow-device-zone") state.display.homeMode = input.checked ? "device" : "fixed";
    else return;
    persistDisplay(); applyDisplay(); draw();
    if (!drawer.hidden) renderCities();
  });
  cityList.addEventListener("click", event => { const button = event.target.closest("button[data-act]"); if (!button) return; const index = state.cities.findIndex(city => (city.id || city.zone) === button.dataset.id); if (index < 0) return; if (button.dataset.act === "remove") state.cities.splice(index, 1); else if (button.dataset.act === "home") { state.cities.forEach((city, cityIndex) => { city.home = cityIndex === index; }); state.display.homeMode = "fixed"; persistDisplay(); applyDisplay(); } else { const next = button.dataset.act === "up" ? index - 1 : index + 1; if (state.cities[next]) [state.cities[index], state.cities[next]] = [state.cities[next], state.cities[index]]; } persist(); renderCities(); draw(); });
  function shareCopy() { const hp = parts(home().zone); return `WorldDial · ${hp.weekday} ${hp.year}-${hp.month}-${hp.day} ${time(home())} ${home().name} (${activeCities().map(city => `${city.name} ${time(city)}`).join(", ")})`; }
  function ics() { const stamp = state.instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); const end = new Date(state.instant.getTime() + 3600000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//WorldDial//EN\r\nBEGIN:VEVENT\r\nUID:onetime-${Date.now()}@local\r\nDTSTAMP:${stamp}\r\nDTSTART:${stamp}\r\nDTEND:${end}\r\nSUMMARY:WorldDial · ${home().name} ${time(home())}\r\nDESCRIPTION:${shareCopy()}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`; }
  document.querySelector("#calendar-button").addEventListener("click", () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([ics()], { type: "text/calendar;charset=utf-8" })); link.download = "worlddial.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); });
  document.querySelector("#share-button").addEventListener("click", async () => { const text = shareCopy(); if (navigator.share) { try { await navigator.share({ title: "WorldDial", text }); return; } catch (error) { if (error.name === "AbortError") return; } } shareText.textContent = text; setLayer(shareSheet, true); }); document.querySelector("#share-close").addEventListener("click", () => setLayer(shareSheet, false)); document.querySelector("#copy-share").addEventListener("click", async () => { try { await navigator.clipboard.writeText(shareCopy()); } catch {} document.querySelector("#copy-share").textContent = "Copied"; });
  if (location.hostname === "127.0.0.1") window.__onetimeTest = {
    setInstant: value => { clearSurfaceRelease(); state.instant = new Date(value); state.scrubbed = true; draw(); },
    setCities: cities => { state.cities = cities; draw(); },
    setScale: value => { state.display.typeScale = value; applyDisplay(); draw(); },
    setHourCycle: value => { state.display.hourCycle = value; applyDisplay(); draw(); },
    setHomeMode: value => { state.display.homeMode = value; applyDisplay(); draw(); },
    setDeviceZone: value => { state.deviceZone = value; state.deviceZoneOverride = true; applyDisplay(); draw(); },
    activeCities: () => activeCities().map(city => ({ ...city })),
    cityOffset, ics, guideVisible: () => state.scrubbed, liveTrace: () => {
      const selectedAngle = minutes(home()) / 1440 * Math.PI * 2 + Math.PI / 2;
      const liveAngle = minutesAt(home(), liveNow()) / 1440 * Math.PI * 2 + Math.PI / 2;
      const delta = shortest(selectedAngle - liveAngle);
      return { visible: state.scrubbed, selectedMinutes: minutes(home()), liveMinutes: minutesAt(home(), liveNow()), delta, anticlockwise: delta < 0 };
    }, setLiveNow: value => { state.liveInstant = new Date(value); draw(); }, hapticState: () => ({ slot: state.hapticSlot, at: state.hapticAt }), surfaceCrossing: () => dialPanel.dataset.surfaceCrossing || null, surfaceTug: () => state.surfaceTug && ({ city: state.surfaceTug.city.id || state.surfaceTug.city.zone, direction: state.surfaceTug.direction, crossed: state.surfaceTug.crossed, kind: state.surfaceTug.kind || null }), surfaceRelease: () => state.surfaceRelease && ({ ...releaseGeometry(state.surfaceRelease), kind: state.surfaceRelease.kind, directionName: state.surfaceRelease.direction, animating: Boolean(state.surfaceFrame) }), surfaceReleaseCount: () => state.surfaceReleases.length, surfaceGeometry: () => state.surfaceGeometry && JSON.parse(JSON.stringify(state.surfaceGeometry)), sectorState: () => ({ ...dateLineSector(), eastDate: parts(DATE_LINE_EAST.zone), westDate: parts(DATE_LINE_WEST.zone) }), display: () => ({ ...state.display }),
    labelBounds: () => { const panel = dialPanel.getBoundingClientRect(); return [...labels.querySelectorAll(".city")].map(label => ({ id: label.dataset.cityId, ...labelVisualBounds(label, panel) })); }
  };
  window.addEventListener("resize", draw);
  if (document.fonts) {
    document.fonts.ready.then(draw);
    document.fonts.addEventListener?.("loadingdone", draw);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?release=v42", { scope: "./", updateViaCache: "none" });
  state.timer = window.setInterval(() => {
    const nextDeviceZone = resolvedDeviceZone();
    if (!state.deviceZoneOverride && nextDeviceZone !== state.deviceZone) { state.deviceZone = nextDeviceZone; applyDisplay(); draw(); }
    if (!state.dragging && Math.abs(Date.now() - state.instant.getTime()) < 65000) { state.instant = new Date(); draw(); }
  }, 1000);
  applyDisplay(); draw();
})();
