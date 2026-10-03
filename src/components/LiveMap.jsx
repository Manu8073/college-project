import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation2, Crosshair, Layers } from 'lucide-react';

// Actual Google Maps tile services (Roadmap & Satellite)
const GOOGLE_TILES = {
  roadmap: {
    url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    label: 'Map',
  },
  satellite: {
    url: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    label: 'Satellite',
  },
};

const SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'];

export function LiveMap({
  userLocation,
  compassHeading,
  route,
  destination,
  navState,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const polylineOuterRef = useRef(null);
  const polylineInnerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const hasFittedRouteRef = useRef(false);

  const [autoFollow, setAutoFollow] = useState(true);
  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite'

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultCenter = userLocation
      ? [userLocation.lat, userLocation.lng]
      : [12.9716, 77.5946];

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    // Add Actual Google Maps Roadmap Tile Layer
    const tileLayer = L.tileLayer(GOOGLE_TILES.roadmap.url, {
      maxZoom: 20,
      subdomains: SUBDOMAINS,
      attribution: '&copy; Google Maps',
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    // Zoom control at top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Attribution control minimal at bottom
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

    // Detect manual user dragging to pause auto-follow
    map.on('dragstart', () => {
      setAutoFollow(false);
    });

    mapInstanceRef.current = map;

    // Fix map sizing issues if rendered in flex/absolute containers or on rotate
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Map Type Switching (Roadmap vs Satellite)
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const map = mapInstanceRef.current;

    map.removeLayer(tileLayerRef.current);
    const newTileLayer = L.tileLayer(GOOGLE_TILES[mapType].url, {
      maxZoom: 20,
      subdomains: SUBDOMAINS,
      attribution: '&copy; Google Maps',
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
    newTileLayer.bringToBack();
  }, [mapType]);

  // Recenter handler
  const handleRecenter = useCallback(() => {
    setAutoFollow(true);
    if (mapInstanceRef.current && userLocation) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 18, {
        animate: true,
      });
    }
  }, [userLocation]);

  // Toggle Map Type (Roadmap / Satellite)
  const toggleMapType = () => {
    setMapType((prev) => (prev === 'roadmap' ? 'satellite' : 'roadmap'));
  };

  // Update Live User Marker and Heading
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;

    const pos = [userLocation.lat, userLocation.lng];
    const headingDeg = compassHeading?.deg ?? userLocation.headingDeg ?? 0;

    // 1. User Location Pulse Dot + Heading Cone (Google Maps Style)
    const userIconHtml = `
      <div class="leaflet-user-marker-wrap">
        <div class="leaflet-user-pulse"></div>
        <div class="leaflet-user-dot"></div>
        ${
          compassHeading?.deg != null || userLocation.headingDeg != null
            ? `<div class="leaflet-user-heading" style="transform: rotate(${Math.round(
                headingDeg
              )}deg);">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L17.5 11.5H6.5L12 2Z" fill="#1a73e8" stroke="#ffffff" stroke-width="1.5"/>
                </svg>
              </div>`
            : ''
        }
      </div>
    `;

    const userIcon = L.divIcon({
      className: 'leaflet-user-marker-container',
      html: userIconHtml,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(pos, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(pos);
      userMarkerRef.current.setIcon(userIcon);
    }

    // 2. Accuracy Halo Circle
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(pos, {
        radius: userLocation.accuracyM || 15,
        color: '#1a73e8',
        fillColor: '#1a73e8',
        fillOpacity: 0.15,
        weight: 1.5,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(pos);
      if (userLocation.accuracyM) {
        accuracyCircleRef.current.setRadius(userLocation.accuracyM);
      }
    }

    // Auto-follow: pan smoothly if enabled
    if (autoFollow) {
      map.panTo(pos, { animate: true, duration: 0.5 });
    }
  }, [userLocation, compassHeading, autoFollow]);

  // Update Route Polyline & Destination Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up old polylines if route changed or idle
    if (polylineOuterRef.current) {
      map.removeLayer(polylineOuterRef.current);
      polylineOuterRef.current = null;
    }
    if (polylineInnerRef.current) {
      map.removeLayer(polylineInnerRef.current);
      polylineInnerRef.current = null;
    }
    if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    if (navState === 'idle' || !route?.path || route.path.length === 0) {
      hasFittedRouteRef.current = false;
      return;
    }

    const latlngs = route.path.map((p) => [p.lat, p.lng]);

    // Render Dual-Layer Polyline in Google Maps Signature Navigation Blue
    polylineOuterRef.current = L.polyline(latlngs, {
      color: '#0d47a1',
      weight: 9,
      opacity: 0.6,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    polylineInnerRef.current = L.polyline(latlngs, {
      color: '#1a73e8',
      weight: 5.5,
      opacity: 1.0,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Google Maps Classic Red Destination Pin
    const destLoc = destination?.location || route.path[route.path.length - 1];
    if (destLoc) {
      const destIcon = L.divIcon({
        className: 'leaflet-dest-marker-container',
        html: `
          <div class="leaflet-dest-pin">
            <svg width="34" height="42" viewBox="0 0 24 28" fill="none">
              <path d="M12 2C7.03 2 3 6.03 3 11C3 17.5 12 26 12 26C12 26 21 17.5 21 11C21 6.03 16.97 2 12 2Z" fill="#ea4335" stroke="#ffffff" stroke-width="1.8"/>
              <circle cx="12" cy="11" r="3.5" fill="#ffffff"/>
            </svg>
          </div>
        `,
        iconSize: [34, 42],
        iconAnchor: [17, 42],
      });

      destMarkerRef.current = L.marker([destLoc.lat, destLoc.lng], {
        icon: destIcon,
        zIndexOffset: 800,
      }).addTo(map);

      if (destination?.name) {
        destMarkerRef.current.bindTooltip(destination.name, {
          permanent: false,
          direction: 'top',
          className: 'leaflet-dest-tooltip',
        });
      }
    }

    // Fit map bounds to show route overview when route is newly set
    if (!hasFittedRouteRef.current) {
      const bounds = L.latLngBounds(latlngs);
      if (userLocation) {
        bounds.extend([userLocation.lat, userLocation.lng]);
      }
      map.fitBounds(bounds, {
        paddingTopLeft: [50, 100],
        paddingBottomRight: [50, 180],
        animate: true,
      });
      hasFittedRouteRef.current = true;
    }
  }, [route, destination, navState, userLocation]);

  return (
    <div className="live-map-container" aria-label="Visual Navigation Map">
      <div ref={mapContainerRef} className="live-map-canvas" />

      {/* Map Layer Switcher (Roadmap vs Satellite) */}
      <button
        onClick={toggleMapType}
        className="map-layer-btn"
        title={`Switch to ${mapType === 'roadmap' ? 'Satellite' : 'Map'} view`}
        aria-label="Toggle map view"
      >
        <Layers size={17} color="var(--accent-cyan)" />
        <span>{mapType === 'roadmap' ? 'Satellite' : 'Roadmap'}</span>
      </button>

      {/* Recenter Button for Accompanying Assistant */}
      {!autoFollow && userLocation && (
        <button
          onClick={handleRecenter}
          className="map-recenter-btn"
          title="Recenter map on user location"
          aria-label="Recenter map on current location"
        >
          <Crosshair size={18} color="var(--accent-cyan)" />
          <span>Recenter on User</span>
        </button>
      )}

      {/* Compass Orientation Indicator */}
      {compassHeading?.deg != null && (
        <div className="map-compass-badge" title="Facing direction">
          <Navigation2
            size={16}
            style={{
              transform: `rotate(${Math.round(compassHeading.deg)}deg)`,
              transition: 'transform 0.25s ease',
              color: '#38bdf8',
            }}
          />
          <span>{Math.round(compassHeading.deg)}°</span>
        </div>
      )}
    </div>
  );
}
