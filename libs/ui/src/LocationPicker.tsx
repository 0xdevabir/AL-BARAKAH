'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { currentPosition, DHAKA, type GeoError, geoErrorText, isInBangladesh, type LatLng, type Place, reverseGeocode, searchPlaces } from './geo.js';
import { addTiles, loadLeaflet } from './MapView.js';

export interface PickedLocation extends LatLng {
  place: Place | null;
}

/**
 * Drag the map under a fixed centre pin — the Uber/Pathao pattern. Search jumps the map,
 * "my location" uses GPS, and the pin's spot is named by reverse geocoding.
 */
export function LocationPicker({
  value,
  near,
  onChange,
  autoLocate = false,
  className,
}: {
  value?: LatLng | null;
  /** Where to start when there is no value and GPS isn't used, e.g. the pharmacy. */
  near?: LatLng;
  onChange: (v: PickedLocation) => void;
  /** Ask for GPS on open when there is no value yet. */
  autoLocate?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const accuracyRef = useRef<Leaflet.Circle | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [moving, setMoving] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [naming, setNaming] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoError | null>(null);
  const [outside, setOutside] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const nameAbort = useRef<AbortController | null>(null);
  const nameTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function nameSpot(p: LatLng, known?: Place) {
    clearTimeout(nameTimer.current);
    nameAbort.current?.abort();
    const ok = isInBangladesh(p);
    setOutside(!ok);
    if (known) {
      setPlace(known);
      setNaming(false);
      onChangeRef.current({ ...p, place: known });
      return;
    }
    onChangeRef.current({ ...p, place: null });
    if (!ok) return;
    setNaming(true);
    nameTimer.current = setTimeout(() => {
      const ac = new AbortController();
      nameAbort.current = ac;
      reverseGeocode(p, ac.signal).then((found) => {
        if (ac.signal.aborted) return;
        setPlace(found);
        setNaming(false);
        onChangeRef.current({ ...p, place: found });
      });
    }, 450);
  }

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !host.current) return;
      LRef.current = L;
      const start = value ?? near ?? DHAKA;
      const map = L.map(host.current, { center: [start.lat, start.lng], zoom: value ? 17 : 15, zoomControl: false, zoomSnap: 0.25, tapTolerance: 12 });
      map.attributionControl.setPrefix(false);
      addTiles(L, map);
      map.on('movestart', () => setMoving(true));
      map.on('moveend', () => {
        setMoving(false);
        const c = map.getCenter();
        nameSpot({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) });
      });
      mapRef.current = map;
      nameSpot(start);
      if (!value && autoLocate) locate(true);
    });
    return () => {
      dead = true;
      clearTimeout(nameTimer.current);
      nameAbort.current?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false }));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);

  // Debounced place search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const t = setTimeout(() => {
      const c = mapRef.current?.getCenter();
      searchPlaces(term, c ? { lat: c.lat, lng: c.lng } : near, ac.signal).then((r) => {
        if (ac.signal.aborted) return;
        setResults(r);
        setSearching(false);
      });
    }, 320);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, near]);

  function flyTo(p: LatLng, zoom = 17) {
    mapRef.current?.flyTo([p.lat, p.lng], zoom, { duration: 0.7 });
  }

  function locate(quiet = false) {
    setLocating(true);
    setGeoError(null);
    currentPosition()
      .then((p) => {
        const map = mapRef.current;
        const L = LRef.current;
        if (!map || !L) return;
        accuracyRef.current?.remove();
        accuracyRef.current = L.circle([p.lat, p.lng], { radius: Math.min(p.accuracy, 400), color: '#0b7ac4', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
        flyTo(p, p.accuracy > 200 ? 16 : 18);
      })
      .catch((e: GeoError) => {
        if (!quiet || e !== 'denied') setGeoError(e);
      })
      .finally(() => setLocating(false));
  }

  function pick(r: Place) {
    setQ('');
    setResults([]);
    (document.activeElement as HTMLElement | null)?.blur();
    flyTo(r);
    // flyTo ends in a moveend which re-names the spot; show the chosen name meanwhile.
    setPlace(r);
  }

  const showResults = focused && q.trim().length >= 2;

  return (
    <div className={`picker ${className ?? ''}`}>
      <div className="picker-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Search area, road or landmark"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          aria-label="Search for a place"
        />
        {q && <button type="button" className="picker-clear" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
      </div>
      {showResults && (
        <div className="picker-results" role="listbox">
          {searching && !results.length && <div className="picker-result muted">Searching…</div>}
          {!searching && !results.length && <div className="picker-result muted">No places found. Move the map to your spot instead.</div>}
          {results.map((r, i) => (
            <button type="button" role="option" aria-selected={false} key={`${r.lat},${r.lng},${i}`} className="picker-result" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.4" /></svg>
              <span className="grow">
                <b>{r.title}</b>
                {r.subtitle && <small>{r.subtitle}</small>}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="picker-map">
        <div ref={host} className="map-canvas" />
        <div className={`picker-pin ${moving ? 'is-moving' : ''}`} aria-hidden>
          <span className="picker-pin-head" />
          <span className="picker-pin-stem" />
          <span className="picker-pin-shadow" />
        </div>
        <button type="button" className="map-btn picker-locate" onClick={() => locate()} aria-label="Use my current location" disabled={locating}>
          {locating ? <span className="spin" /> : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
          )}
        </button>
        <div className="picker-hint">{moving ? 'Release to set the pin' : 'Move the map to place the pin on your door'}</div>
      </div>

      <div className="picker-place" aria-live="polite">
        {outside ? (
          <span className="error">We only deliver inside Bangladesh. Move the pin.</span>
        ) : (
          <>
            <b className={naming ? 'is-loading' : ''}>{naming && !place ? 'Finding the address…' : place?.title ?? 'Pinned location'}</b>
            <small className="muted">{place?.subtitle || (naming ? '' : 'Add the house and road in the next step')}</small>
          </>
        )}
        {geoError && <span className="error small">{geoErrorText[geoError]}</span>}
      </div>
    </div>
  );
}
