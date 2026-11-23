import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Thermometer,
  Volume2,
  Zap,
  Droplets,
  Bus,
  Car,
  Crosshair,
  Plus,
  Minus,
} from 'lucide-react';
import {
  TrafficNode,
  WeatherSummary,
  ServiceAlertItem,
  StreetRouteGeometry,
} from '../types';
import { fetchStreetRoute } from '../services/geminiService';

interface InteractiveRouteMapProps {
  routeTitle: string;
  trafficNodes: TrafficNode[];
  serviceRadar?: ServiceAlertItem[];
  weather?: WeatherSummary;
  coords?: { lat: number; lng: number };
  startCoords?: { lat: number; lng: number };
  endCoords?: { lat: number; lng: number };
  routeCoordinates?: Array<[number, number]>;
  isVisible?: boolean;
  darkMapTheme?: boolean;
  onPlayAlertAudio?: (item: ServiceAlertItem) => void;
  onPlayNodeAudio?: (node: TrafficNode) => void;
  onLocateUser?: () => void;
  onRouteGeometryResolved?: (geo: StreetRouteGeometry) => void;
  /** Floating search bar & shortcut icons overlaid at top of the map */
  mapOverlayTop?: React.ReactNode;
}

export const InteractiveRouteMap: React.FC<InteractiveRouteMapProps> = ({
  routeTitle,
  trafficNodes,
  serviceRadar = [],
  weather,
  coords,
  startCoords,
  endCoords,
  routeCoordinates,
  isVisible = true,
  darkMapTheme = false,
  onPlayAlertAudio,
  onPlayNodeAudio,
  onLocateUser,
  onRouteGeometryResolved,
  mapOverlayTop,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [resolvedPathCoords, setResolvedPathCoords] = useState<Array<[number, number]>>(
    routeCoordinates || []
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const nodesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const itemCoordsMapRef = useRef<Record<string, [number, number]>>({});
  const routeBoundsRef = useRef<L.LatLngBounds | null>(null);
  const hadNonZeroSizeRef = useRef<boolean>(false);

  const totalDelay = trafficNodes.reduce((acc, n) => acc + (n.delayMinutes || 0), 0);

  const getCategoryMeta = (category?: ServiceAlertItem['category'], severity?: TrafficNode['severity']) => {
    if (category === 'garaza') {
      return {
        hex: '#10b981',
        badge: 'P',
        label: 'Parking garaža',
        textColor: 'text-emerald-400',
        bgCls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
        Icon: Car,
      };
    }
    if (category === 'radovi' || severity === 'radovi') {
      return {
        hex: '#f59e0b',
        badge: '🚧',
        label: 'Radovi na putu',
        textColor: 'text-amber-400',
        bgCls: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
        Icon: Wrench,
      };
    }
    if (category === 'prevoz') {
      return {
        hex: '#6366f1',
        badge: '🚌',
        label: 'Gradski prevoz (GSP)',
        textColor: 'text-indigo-400',
        bgCls: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
        Icon: Bus,
      };
    }
    if (category === 'struja') {
      return {
        hex: '#eab308',
        badge: '⚡',
        label: 'Struja (EDS)',
        textColor: 'text-yellow-400',
        bgCls: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300',
        Icon: Zap,
      };
    }
    if (category === 'voda') {
      return {
        hex: '#0ea5e9',
        badge: '💧',
        label: 'Voda (BVK)',
        textColor: 'text-sky-400',
        bgCls: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
        Icon: Droplets,
      };
    }
    if (severity === 'zastoj' || category === 'saobracaj') {
      return {
        hex: '#f43f5e',
        badge: '!',
        label: 'Saobraćaj',
        textColor: 'text-rose-400',
        bgCls: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
        Icon: AlertTriangle,
      };
    }
    return {
      hex: '#10b981',
      badge: '✓',
      label: 'Prohodno',
      textColor: 'text-emerald-400',
      bgCls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
      Icon: CheckCircle2,
    };
  };

  // Initialize Leaflet Map once + attach ResizeObserver
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const initialCenter: [number, number] = startCoords
      ? [startCoords.lat, startCoords.lng]
      : coords
      ? [coords.lat, coords.lng]
      : [44.8176, 20.445];

    const map = L.map(container, {
      center: initialCenter,
      zoom: 13,
      zoomControl: false,
    });

    // Standardni OpenStreetMap sloj sa lokalnim nazivima za Beograd (tamni prikaz se primenjuje isključivo preko CSS filtera na .leaflet-tile-pane)
    const tileLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }
    );

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    const routeGroup = L.layerGroup().addTo(map);
    const nodesGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    routeLayerGroupRef.current = routeGroup;
    nodesLayerGroupRef.current = nodesGroup;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect && rect.width > 0 && rect.height > 0 && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
          if (!hadNonZeroSizeRef.current && routeBoundsRef.current) {
            hadNonZeroSizeRef.current = true;
            try {
              mapInstanceRef.current.fitBounds(routeBoundsRef.current, { padding: [36, 36] });
            } catch {
              // ignore
            }
          }
        }
      });
      ro.observe(container);
    }

    return () => {
      ro?.disconnect();
      userMarkerRef.current = null;
      tileLayerRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
      routeLayerGroupRef.current = null;
      nodesLayerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isVisible || !mapInstanceRef.current) return;
    const refreshMap = () => {
      const m = mapInstanceRef.current;
      if (!m) return;
      m.invalidateSize();
      if (routeBoundsRef.current) {
        try {
          m.fitBounds(routeBoundsRef.current, { padding: [36, 36] });
        } catch {
          // ignore
        }
      }
    };
    const t1 = window.setTimeout(refreshMap, 50);
    const t2 = window.setTimeout(refreshMap, 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isVisible]);

  // Effect 1: Fetch/render OSRM street geometry and Start/Destination markers
  useEffect(() => {
    let cancelled = false;
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerGroupRef.current;
    if (!map || !routeGroup) return;

    const origin = startCoords || coords || { lat: 44.8176, lng: 20.4569 };
    if (!endCoords) {
      routeGroup.clearLayers();
      routeBoundsRef.current = null;
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      setResolvedPathCoords([]);
      map.setView([origin.lat, origin.lng], 14);
      return;
    }
    const destination = endCoords;

    const drawRouteGeometry = async () => {
      try {
        const streetRoute = await fetchStreetRoute(origin, destination);
        if (cancelled) return;

        setRouteDistanceKm(streetRoute.distanceKm);
        setRouteDurationMin(streetRoute.durationMinutes);
        if (onRouteGeometryResolved) {
          onRouteGeometryResolved(streetRoute);
        }

        routeGroup.clearLayers();

        const pathCoords =
          routeCoordinates && routeCoordinates.length > 1
            ? routeCoordinates
            : streetRoute.coordinates;
        setResolvedPathCoords(pathCoords);

        if (pathCoords.length > 1) {
          L.polyline(pathCoords, {
            color: '#4f46e5',
            weight: 9,
            opacity: 0.3,
            lineCap: 'round',
          }).addTo(routeGroup);

          const routeLine = L.polyline(pathCoords, {
            color: '#6366f1',
            weight: 4.5,
            opacity: 0.95,
            lineCap: 'round',
          }).addTo(routeGroup);

          const bounds = routeLine.getBounds();
          routeBoundsRef.current = bounds;
          const containerRect = mapContainerRef.current?.getBoundingClientRect();
          if (containerRect && containerRect.width > 0 && containerRect.height > 0) {
            hadNonZeroSizeRef.current = true;
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [36, 36] });
          }
        }

        // Start Marker
        const startPos = pathCoords[0] || [origin.lat, origin.lng];
        const startIcon = L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:9999px;background:#10b981;border:3px solid #090d16;box-shadow:0 0 12px rgba(16,185,129,0.7);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#090d16;">A</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker(startPos, { icon: startIcon })
          .bindPopup(`<strong>Polazište</strong><br/>${routeTitle.split('→')[0] || 'Start'}`)
          .addTo(routeGroup);

        // Destination Marker
        const endPos = pathCoords[pathCoords.length - 1] || [destination.lat, destination.lng];
        const endIcon = L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:9999px;background:#3b82f6;border:3px solid #090d16;box-shadow:0 0 12px rgba(59,130,246,0.7);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#ffffff;">B</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker(endPos, { icon: endIcon })
          .bindPopup(`<strong>Odredište</strong><br/>${routeTitle.split('→')[1] || 'Cilj'}`)
          .addTo(routeGroup);
      } catch (err) {
        console.error('Error rendering street route:', err);
      }
    };

    drawRouteGeometry();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeTitle,
    startCoords?.lat,
    startCoords?.lng,
    endCoords?.lat,
    endCoords?.lng,
    routeCoordinates,
  ]);

  // Effect 2: Render ServiceRadar items (or fallback trafficNodes) as clickable audio pins on the map
  useEffect(() => {
    const nodesGroup = nodesLayerGroupRef.current;
    if (!nodesGroup) return;

    nodesGroup.clearLayers();

    const origin = startCoords || coords || { lat: 44.8206, lng: 20.4144 };
    const destination = endCoords || {
      lat: origin.lat - 0.005,
      lng: origin.lng + 0.044,
    };

    const newCoordsMap: Record<string, [number, number]> = {};

    if (serviceRadar && serviceRadar.length > 0) {
      serviceRadar.forEach((srv, idx) => {
        const ratio =
          typeof srv.progressRatio === 'number'
            ? Math.max(0.08, Math.min(0.92, srv.progressRatio))
            : (idx + 1) / (serviceRadar.length + 1);

        let itemLatLng: [number, number];
        if (typeof srv.lat === 'number' && typeof srv.lng === 'number') {
          itemLatLng = [srv.lat, srv.lng];
        } else if (resolvedPathCoords.length > 2) {
          const pathIndex = Math.min(
            resolvedPathCoords.length - 1,
            Math.floor(ratio * (resolvedPathCoords.length - 1))
          );
          itemLatLng = resolvedPathCoords[pathIndex];
        } else {
          itemLatLng = [
            origin.lat + (destination.lat - origin.lat) * ratio,
            origin.lng + (destination.lng - origin.lng) * ratio,
          ];
        }

        newCoordsMap[srv.id] = itemLatLng;
        const meta = getCategoryMeta(srv.category);
        const parkingMatch =
          srv.category === 'garaza'
            ? (srv.spokenText || srv.title || '').match(/(\d+)\s+slobodn\w*\s+mest/i)
            : null;
        const parkingCount = parkingMatch ? parkingMatch[1] : null;
        const isParkingFull =
          srv.category === 'garaza' && !parkingCount && /popunjen/i.test(srv.spokenText || '');

        const pinIcon = L.divIcon({
          className: '',
          html:
            srv.category === 'garaza' && (parkingCount || isParkingFull)
              ? `<div style="height:26px;padding:0 8px;border-radius:9999px;background:#090d16;border:2px solid ${meta.hex};box-shadow:0 0 14px ${meta.hex}99;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-size:11px;font-weight:800;color:#ffffff;white-space:nowrap;cursor:pointer;">
                  <span style="color:${meta.hex};">P</span>
                  <span>${parkingCount ?? '0'}</span>
                </div>`
              : `<div style="width:28px;height:28px;border-radius:9999px;background:#090d16;border:2.5px solid ${meta.hex};box-shadow:0 0 14px ${meta.hex}99;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#ffffff;cursor:pointer;">
                  ${meta.badge}
                </div>`,
          iconSize: srv.category === 'garaza' && (parkingCount || isParkingFull) ? [54, 26] : [28, 28],
          iconAnchor: srv.category === 'garaza' && (parkingCount || isParkingFull) ? [27, 13] : [14, 14],
        });

        const marker = L.marker(itemLatLng, { icon: pinIcon }).addTo(nodesGroup);
        marker.on('click', () => {
          setSelectedItemId(srv.id);
          if (onPlayAlertAudio) {
            onPlayAlertAudio(srv);
          }
        });
      });
      if (!selectedItemId && serviceRadar[0]) {
        setSelectedItemId(serviceRadar[0].id);
      }
    }

    itemCoordsMapRef.current = newCoordsMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRadar, resolvedPathCoords]);

  // Effect 3: Live Driver GPS Position Marker ("VI")
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !coords) return;

    const pos: [number, number] = [coords.lat, coords.lng];
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(pos);
    } else {
      const userIcon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:9999px;background:#06b6d4;border:3px solid #090d16;box-shadow:0 0 16px rgba(6,182,212,0.9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#090d16;">VI</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      userMarkerRef.current = L.marker(pos, {
        icon: userIcon,
        zIndexOffset: 900,
      })
        .bindPopup('<strong>Vaša trenutna lokacija</strong>')
        .addTo(map);
    }
  }, [coords?.lat, coords?.lng]);

  const handleSelectPin = (id: string, srv?: ServiceAlertItem, node?: TrafficNode) => {
    setSelectedItemId(id);
    const map = mapInstanceRef.current;
    const targetLatLng = itemCoordsMapRef.current[id];
    if (map && targetLatLng) {
      map.flyTo(targetLatLng, Math.max(map.getZoom(), 15), { duration: 0.5 });
    }
    if (srv && onPlayAlertAudio) {
      onPlayAlertAudio(srv);
    } else if (node && onPlayNodeAudio) {
      onPlayNodeAudio(node);
    }
  };

  const handleCenterOnUser = () => {
    if (onLocateUser) {
      onLocateUser();
    }
    const map = mapInstanceRef.current;
    const pos = coords || startCoords;
    if (map && pos) {
      map.flyTo([pos.lat, pos.lng], 15, { duration: 0.5 });
    } else if (map && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (geo) => {
          map.flyTo([geo.coords.latitude, geo.coords.longitude], 15, { duration: 0.5 });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 7000 }
      );
    }
  };

  const activeAlert =
    serviceRadar.find((s) => s.id === selectedItemId) || serviceRadar[0] || null;

  const [liveWeather, setLiveWeather] = useState<WeatherSummary | undefined>(weather);

  useEffect(() => {
    if (weather) {
      setLiveWeather(weather);
      return;
    }
    let mounted = true;
    const lat = startCoords?.lat || coords?.lat || 44.8176;
    const lng = startCoords?.lng || coords?.lng || 20.4569;
    import('../services/browserLiveEngine')
      .then((m) => m.fetchWeatherInBrowser(lat, lng))
      .then((w) => {
        if (mounted && w) setLiveWeather(w);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [weather, startCoords?.lat, startCoords?.lng, coords?.lat, coords?.lng]);

  const activeWeather = weather || liveWeather;

  return (
    <div className="space-y-3">
      {/* Real Interactive Leaflet Map Viewport (no outer frame or 'Moja lokacija' header above) */}
      <div className="relative">
        <div className="relative rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-[390px] sm:h-[450px] z-10" />

          {/* Bottom-left semi-transparent Temperature Badge (visible without obstructing map) */}
          {activeWeather && (
            <div
              className="absolute bottom-2.5 left-2.5 z-[420] pointer-events-none px-2.5 py-1 rounded-xl bg-slate-900/55 backdrop-blur-sm border border-slate-700/45 flex items-center gap-1.5 text-xs text-slate-100 shadow-sm"
              title={activeWeather.condition}
            >
              <Thermometer className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="tabular-nums font-semibold">{activeWeather.tempC}°C</span>
            </div>
          )}

          {/* Map Floating Controls (bottom-right): Zoom +/- and icon-only My Location */}
          <div className="absolute bottom-6 right-2.5 z-[420] flex flex-col items-end gap-2">
            <div className="flex flex-col rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shadow-lg">
              <button
                type="button"
                onClick={() => mapInstanceRef.current?.zoomIn()}
                className="w-9 h-9 hover:bg-slate-800 active:bg-slate-700 text-slate-100 flex items-center justify-center transition-colors border-b border-slate-700/80"
                title="Uvećaj mapu (+)"
                aria-label="Uvećaj mapu"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => mapInstanceRef.current?.zoomOut()}
                className="w-9 h-9 hover:bg-slate-800 active:bg-slate-700 text-slate-100 flex items-center justify-center transition-colors"
                title="Umanji mapu (-)"
                aria-label="Umanji mapu"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCenterOnUser}
              className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-700 text-cyan-400 hover:text-cyan-300 flex items-center justify-center shadow-lg transition-colors"
              title="Moja trenutna lokacija"
              aria-label="Moja trenutna lokacija"
            >
              <Crosshair className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Floating Search Bar & Shortcut Icons overlaid at top of map (outside overflow-hidden so autocomplete dropdown is never clipped) */}
        {mapOverlayTop && (
          <div className="absolute top-2.5 left-2.5 right-2.5 z-[450] pointer-events-none">
            {mapOverlayTop}
          </div>
        )}
      </div>
    </div>
  );
};
