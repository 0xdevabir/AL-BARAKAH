'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { DHAKA, type LatLng } from './geo.js';

type L = typeof Leaflet;
let leaflet: Promise<L> | null = null;
/** Leaflet touches `window` on import, so it only ever loads in the browser. */
export function loadLeaflet(): Promise<L> {
  leaflet ??= import('leaflet').then((m) => ((m as unknown as { default?: L }).default ?? m) as L);
  return leaflet;
}

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>';

export function addTiles(L: L, map: Leaflet.Map) {
  return L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 20,
    detectRetina: false,
    referrerPolicy: 'strict-origin-when-cross-origin',
  } as Leaflet.TileLayerOptions).addTo(map);
}

export type PinKind = 'store' | 'home' | 'job' | 'rider';

export interface MapPin {
  id: string;
  point: LatLng;
  kind: PinKind;
  /** Number or short text shown inside a job pin. */
  label?: string;
  /** Degrees clockwise from north, for the rider arrow. */
  heading?: number | null;
  active?: boolean;
  /** Dim pins that are done or not in focus. */
  muted?: boolean;
  title?: string;
  onClick?: () => void;
}

const GLYPH = {
  store: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z"/></svg>',
};

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function pinHtml(p: MapPin): string {
  const cls = `map-pin map-pin-${p.kind}${p.active ? ' is-active' : ''}${p.muted ? ' is-muted' : ''}`;
  if (p.kind === 'rider') {
    const arrow = p.heading == null ? '' : `<span class="map-rider-arrow" style="transform:rotate(${Math.round(p.heading)}deg)"></span>`;
    return `<div class="${cls}"><span class="map-rider-pulse"></span>${arrow}<span class="map-rider-dot"></span></div>`;
  }
  const inner = p.kind === 'job' ? `<b>${esc(p.label ?? '')}</b>` : GLYPH[p.kind];
  return `<div class="${cls}"><span class="map-pin-head">${inner}</span></div>`;
}

function iconFor(L: L, p: MapPin) {
  const rider = p.kind === 'rider';
  const size: [number, number] = rider ? [44, 44] : p.active ? [46, 54] : [38, 46];
  return L.divIcon({
    html: pinHtml(p),
    className: 'map-pin-wrap',
    iconSize: size,
    iconAnchor: rider ? [22, 22] : [size[0] / 2, size[1] - 2],
  });
}

/** Glides a marker to its new spot instead of jumping, like a ride-hailing car. */
function glide(marker: Leaflet.Marker, to: LatLng, ms = 900) {
  const from = marker.getLatLng();
  if (Math.abs(from.lat - to.lat) + Math.abs(from.lng - to.lng) < 1e-7) return;
  const start = performance.now();
  const anim = (marker as unknown as { _glide?: number })._glide;
  if (anim) cancelAnimationFrame(anim);
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - (1 - t) ** 3;
    marker.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
    if (t < 1) (marker as unknown as { _glide?: number })._glide = requestAnimationFrame(step);
  };
  (marker as unknown as { _glide?: number })._glide = requestAnimationFrame(step);
}

export interface MapViewProps {
  pins: MapPin[];
  /** Road route drawn under the pins. */
  route?: LatLng[] | null;
  /** Dashed when the route is a straight-line guess. */
  routeDashed?: boolean;
  /** Change this to refit the camera to every pin (e.g. a new selection). */
  fitKey?: string | number;
  /** Pin ids to fit to instead of all of them. */
  focus?: string[];
  center?: LatLng;
  zoom?: number;
  /** A static preview: no dragging or zoom, taps fall through. */
  still?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Space kept clear at the bottom when fitting (e.g. under a card carousel). */
  padBottom?: number;
  padTop?: number;
  /** Show the locate/recenter button. */
  recenter?: boolean;
  onMapClick?: (p: LatLng) => void;
  children?: React.ReactNode;
}

/** A Leaflet map driven by props. Pins update in place, so live positions animate smoothly. */
export function MapView({
  pins,
  route,
  routeDashed,
  fitKey,
  focus,
  center,
  zoom = 14,
  still,
  className,
  style,
  padBottom = 24,
  padTop = 24,
  recenter = true,
  onMapClick,
  children,
}: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{ L: L; map: Leaflet.Map; markers: Map<string, Leaflet.Marker>; line?: Leaflet.Polyline; casing?: Leaflet.Polyline } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ pins, focus, padBottom, padTop, onMapClick });
  latest.current = { pins, focus, padBottom, padTop, onMapClick };

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !host.current) return;
        const map = L.map(host.current, {
          center: center ?? pins[0]?.point ?? DHAKA,
          zoom,
          zoomControl: false,
          attributionControl: true,
          dragging: !still,
          touchZoom: !still,
          scrollWheelZoom: !still,
          doubleClickZoom: !still,
          boxZoom: false,
          keyboard: !still,
          tapTolerance: 12,
          zoomSnap: 0.25,
        });
        map.attributionControl.setPrefix(false);
        addTiles(L, map);
        map.on('click', (e: Leaflet.LeafletMouseEvent) => latest.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
        state.current = { L, map, markers: new Map() };
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      state.current?.map.remove();
      state.current = null;
    };
    // The map is created once; everything else flows through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the map sized to its box (sheets and tabs resize it after mount).
  useEffect(() => {
    if (!ready || !host.current) return;
    const ro = new ResizeObserver(() => state.current?.map.invalidateSize({ pan: false }));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, [ready]);

  // Sync pins in place.
  useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    const seen = new Set<string>();
    for (const p of pins) {
      seen.add(p.id);
      const html = pinHtml(p);
      let m = s.markers.get(p.id);
      if (!m) {
        m = s.L.marker([p.point.lat, p.point.lng], { icon: iconFor(s.L, p), keyboard: !!p.onClick, title: p.title ?? '', riseOnHover: true, zIndexOffset: p.kind === 'rider' ? 1000 : 0 }).addTo(s.map);
        (m as unknown as { _html: string })._html = html;
        s.markers.set(p.id, m);
      } else {
        if ((m as unknown as { _html: string })._html !== html) {
          m.setIcon(iconFor(s.L, p));
          (m as unknown as { _html: string })._html = html;
        }
        if (p.kind === 'rider') glide(m, p.point);
        else m.setLatLng([p.point.lat, p.point.lng]);
      }
      m.setZIndexOffset(p.kind === 'rider' ? 1000 : p.active ? 800 : p.muted ? -200 : 0);
      m.off('click');
      if (p.onClick) m.on('click', p.onClick);
    }
    for (const [id, m] of s.markers) {
      if (!seen.has(id)) {
        m.remove();
        s.markers.delete(id);
      }
    }
  }, [ready, pins]);

  // Route polyline with a white casing, like native maps.
  useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    s.line?.remove();
    s.casing?.remove();
    s.line = s.casing = undefined;
    if (!route || route.length < 2) return;
    const ll = route.map((p) => [p.lat, p.lng] as [number, number]);
    s.casing = s.L.polyline(ll, { color: '#fff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(s.map);
    s.line = s.L.polyline(ll, { color: '#3e5238', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', dashArray: routeDashed ? '2 10' : undefined, interactive: false }).addTo(s.map);
  }, [ready, route, routeDashed]);

  function fit(animate = true) {
    const s = state.current;
    if (!s) return;
    const { pins: ps, focus: f, padBottom: pb, padTop: pt } = latest.current;
    const chosen = f?.length ? ps.filter((p) => f.includes(p.id)) : ps;
    const pts = chosen.map((p) => [p.point.lat, p.point.lng] as [number, number]);
    if (s.line && !f?.length) for (const ll of s.line.getLatLngs() as Leaflet.LatLng[]) pts.push([ll.lat, ll.lng]);
    if (!pts.length) return;
    if (pts.length === 1) {
      s.map.setView(pts[0]!, Math.max(s.map.getZoom(), 15), { animate });
      return;
    }
    s.map.fitBounds(s.L.latLngBounds(pts), { paddingTopLeft: [40, pt + 40], paddingBottomRight: [40, pb + 40], maxZoom: 16, animate });
  }

  // Refit when asked, and once the first time pins or the route arrive.
  const fitted = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!fitted.current && !pins.length) return;
    fit(fitted.current);
    fitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey, route?.length]);

  return (
    <div className={`map ${still ? 'map-still' : ''} ${className ?? ''}`} style={style}>
      <div ref={host} className="map-canvas" aria-label="Map" role="region" />
      {failed && <div className="map-fallback">Map couldn’t load. Check your connection.</div>}
      {!ready && !failed && <div className="map-loading" aria-hidden />}
      {recenter && !still && ready && (
        <div className="map-controls">
          <button type="button" className="map-btn" aria-label="Zoom in" onClick={() => state.current?.map.zoomIn()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </button>
          <button type="button" className="map-btn" aria-label="Zoom out" onClick={() => state.current?.map.zoomOut()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 12h12" /></svg>
          </button>
          <button type="button" className="map-btn" aria-label="Show everything" onClick={() => fit()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" /></svg>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
