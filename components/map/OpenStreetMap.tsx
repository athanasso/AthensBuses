import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  type: 'stop' | 'bus';
  label?: string;
  selected?: boolean;
}

export interface OpenStreetMapProps {
  center: { latitude: number; longitude: number };
  zoom?: number;
  markers?: MapMarker[];
  userLocation?: { latitude: number; longitude: number } | null;
  onMarkerPress?: (markerId: string) => void;
  onMapReady?: () => void;
  onRegionChange?: (center: { latitude: number; longitude: number }) => void;
  darkMode?: boolean;
}

export interface OpenStreetMapRef {
  centerOnLocation: (lat: number, lng: number) => void;
}

export const OpenStreetMap = forwardRef<OpenStreetMapRef, OpenStreetMapProps>(({
  center,
  zoom = 15,
  markers = [],
  userLocation,
  onMarkerPress,
  onMapReady,
  onRegionChange,
  darkMode = true,
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  // Expose centerOnLocation method to parent
  useImperativeHandle(ref, () => ({
    centerOnLocation: (lat: number, lng: number) => {
      if (mapReady && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          map.setView([${lat}, ${lng}], 15);
          true;
        `);
      }
    }
  }), [mapReady]);

  // Dark tile layer from CartoDB
  const tileLayer = darkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Memoize the initial HTML - only recreate when center/zoom/darkMode changes
  const mapHtml = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; background: ${darkMode ? '#1a1a2e' : '#f0f0f0'}; }
    .leaflet-control-attribution { display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${center.latitude}, ${center.longitude}], ${zoom});
    
    L.tileLayer('${tileLayer}', {
      maxZoom: 19
    }).addTo(map);
    
    var markersLayer = L.layerGroup().addTo(map);
    
    // Create custom pin icon for stops
    function createPinIcon(color, selected) {
      var size = selected ? 36 : 28;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24">' +
        '<path fill="' + color + '" stroke="#fff" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>' +
        '<circle cx="12" cy="9" r="3" fill="#fff"/>' +
        '</svg>';
      return L.divIcon({
        html: svg,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size/2, size]
      });
    }
    
    function updateMarkers(markersData, userLoc) {
      markersLayer.clearLayers();
      
      if (markersData && markersData.length > 0) {
        markersData.forEach(function(m) {
          var color = m.type === 'stop' ? '#8B5CF6' : '#22c55e';
          
          if (m.type === 'stop') {
            // Use pin icon for stops
            var icon = createPinIcon(color, m.selected);
            L.marker([m.latitude, m.longitude], { icon: icon })
              .addTo(markersLayer)
              .on('click', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({type: 'markerPress', id: m.id}));
              });
          } else {
            // Use circle for buses
            L.circleMarker([m.latitude, m.longitude], {
              radius: 10,
              fillColor: color,
              color: '#fff',
              weight: 2,
              fillOpacity: 0.9
            }).addTo(markersLayer).on('click', function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({type: 'markerPress', id: m.id}));
            });
          }
        });
      }
      
      if (userLoc) {
        L.circleMarker([userLoc.latitude, userLoc.longitude], {
          radius: 8,
          fillColor: '#3b82f6',
          color: '#fff',
          weight: 3,
          fillOpacity: 1
        }).addTo(markersLayer);
      }
    }
    
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'mapReady'}));
    
    // Track last reported center to avoid unnecessary updates
    var lastReportedCenter = { lat: ${center.latitude}, lng: ${center.longitude} };
    
    // Calculate distance between two points in meters (Haversine formula)
    function getDistance(lat1, lng1, lat2, lng2) {
      var R = 6371000; // Earth's radius in meters
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }
    
    // Only notify when map is panned more than 500m, not on zoom
    map.on('moveend', function() {
      var center = map.getCenter();
      var distance = getDistance(lastReportedCenter.lat, lastReportedCenter.lng, center.lat, center.lng);
      
      // Only trigger if moved more than 500 meters
      if (distance > 500) {
        lastReportedCenter = { lat: center.lat, lng: center.lng };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'regionChange',
          latitude: center.lat,
          longitude: center.lng
        }));
      }
    });
  </script>
</body>
</html>`;
  }, [center.latitude, center.longitude, zoom, darkMode, tileLayer]);

  // Update markers when they change
  useEffect(() => {
    if (mapReady && webViewRef.current) {
      const markersJson = JSON.stringify(markers);
      const userLocJson = userLocation ? JSON.stringify(userLocation) : 'null';
      
      webViewRef.current.injectJavaScript(`
        updateMarkers(${markersJson}, ${userLocJson});
        true;
      `);
    }
  }, [markers, userLocation, mapReady]);

  // Center map on user location when it first becomes available
  const hasInitialCentered = useRef(false);
  useEffect(() => {
    if (mapReady && userLocation && webViewRef.current && !hasInitialCentered.current) {
      hasInitialCentered.current = true;
      webViewRef.current.injectJavaScript(`
        map.setView([${userLocation.latitude}, ${userLocation.longitude}], 15);
        true;
      `);
    }
  }, [mapReady, userLocation]);

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'markerPress' && onMarkerPress) {
          onMarkerPress(data.id);
        } else if (data.type === 'mapReady') {
          setIsLoading(false);
          setMapReady(true);
          onMapReady?.();
        } else if (data.type === 'regionChange' && onRegionChange) {
          onRegionChange({ latitude: data.latitude, longitude: data.longitude });
        }
      } catch (e) {
        // Silently ignore parse errors
      }
    },
    [onMarkerPress, onMapReady, onRegionChange]
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
