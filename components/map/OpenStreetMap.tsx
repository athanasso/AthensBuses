import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

// MapTiler API Key from environment variable
const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY || "";

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  type: "stop" | "bus";
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

export const OpenStreetMap = forwardRef<OpenStreetMapRef, OpenStreetMapProps>(
  (
    {
      center,
      zoom = 15,
      markers = [],
      userLocation,
      onMarkerPress,
      onMapReady,
      onRegionChange,
      darkMode = true,
    },
    ref
  ) => {
    const webViewRef = useRef<WebView>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);

    // Expose centerOnLocation method to parent
    useImperativeHandle(
      ref,
      () => ({
        centerOnLocation: (lat: number, lng: number) => {
          if (mapReady && webViewRef.current) {
            webViewRef.current.injectJavaScript(`
          map.flyTo({ center: [${lng}, ${lat}], zoom: 15 });
          true;
        `);
          }
        },
      }),
      [mapReady]
    );

    // MapTiler style - streets for light mode, streets-dark for dark mode (Google Maps-like appearance)
    const mapStyle = darkMode
      ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_API_KEY}`
      : `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_API_KEY}`;

    // Memoize the initial HTML - only recreate when center/zoom/darkMode changes
    const mapHtml = useMemo(() => {
      return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link href="https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; background: ${
      darkMode ? "#1a1a2e" : "#f0f0f0"
    }; }
    .maplibregl-ctrl-attrib { display: none !important; }
    .maplibregl-ctrl-logo { display: none !important; }
    
    /* Custom marker styles */
    .marker-stop {
      cursor: pointer;
    }
    .marker-bus {
      cursor: pointer;
    }
    .marker-user {
      width: 20px;
      height: 20px;
      background: #3b82f6;
      border: 3px solid #fff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = new maplibregl.Map({
      container: 'map',
      style: '${mapStyle}',
      center: [${center.longitude}, ${center.latitude}],
      zoom: ${zoom},
      attributionControl: false,
      logoPosition: 'bottom-left'
    });
    
    var currentMarkers = [];
    
    // Create SVG for stop pin marker
    function createStopPinSVG(color, selected) {
      var size = selected ? 36 : 28;
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24">' +
        '<path fill="' + color + '" stroke="#fff" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>' +
        '<circle cx="12" cy="9" r="3" fill="#fff"/>' +
        '</svg>';
    }
    
    // Create SVG for bus marker
    function createBusMarkerSVG() {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
        '<circle cx="12" cy="12" r="10" fill="#22c55e" stroke="#fff" stroke-width="2"/>' +
        '<text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">🚌</text>' +
        '</svg>';
    }
    
    function clearMarkers() {
      currentMarkers.forEach(function(marker) {
        marker.remove();
      });
      currentMarkers = [];
    }
    
    function updateMarkers(markersData, userLoc) {
      clearMarkers();
      
      if (markersData && markersData.length > 0) {
        markersData.forEach(function(m) {
          var el = document.createElement('div');
          
          if (m.type === 'stop') {
            var color = '#8B5CF6';
            el.className = 'marker-stop';
            el.innerHTML = createStopPinSVG(color, m.selected);
            var offset = m.selected ? [0, -18] : [0, -14];
            
            var marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
              .setLngLat([m.longitude, m.latitude])
              .addTo(map);
          } else {
            // Bus marker - circle style
            el.className = 'marker-bus';
            el.style.width = '24px';
            el.style.height = '24px';
            el.style.background = '#22c55e';
            el.style.border = '2px solid #fff';
            el.style.borderRadius = '50%';
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            
            var marker = new maplibregl.Marker({ element: el })
              .setLngLat([m.longitude, m.latitude])
              .addTo(map);
          }
          
          el.addEventListener('click', function(e) {
            e.stopPropagation();
            window.ReactNativeWebView.postMessage(JSON.stringify({type: 'markerPress', id: m.id}));
          });
          
          currentMarkers.push(marker);
        });
      }
      
      // Add user location marker
      if (userLoc) {
        var userEl = document.createElement('div');
        userEl.className = 'marker-user';
        
        var userMarker = new maplibregl.Marker({ element: userEl })
          .setLngLat([userLoc.longitude, userLoc.latitude])
          .addTo(map);
        
        currentMarkers.push(userMarker);
      }
    }
    
    map.on('load', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'mapReady'}));
    });
    
    // Track last reported center to avoid unnecessary updates
    var lastReportedCenter = { lat: ${center.latitude}, lng: ${
        center.longitude
      } };
    
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
    }, [center.latitude, center.longitude, zoom, darkMode, mapStyle]);

    // Update markers when they change
    useEffect(() => {
      if (mapReady && webViewRef.current) {
        const markersJson = JSON.stringify(markers);
        const userLocJson = userLocation
          ? JSON.stringify(userLocation)
          : "null";

        webViewRef.current.injectJavaScript(`
        updateMarkers(${markersJson}, ${userLocJson});
        true;
      `);
      }
    }, [markers, userLocation, mapReady]);

    // Center map on user location when it first becomes available
    const hasInitialCentered = useRef(false);
    useEffect(() => {
      if (
        mapReady &&
        userLocation &&
        webViewRef.current &&
        !hasInitialCentered.current
      ) {
        hasInitialCentered.current = true;
        webViewRef.current.injectJavaScript(`
        map.flyTo({ center: [${userLocation.longitude}, ${userLocation.latitude}], zoom: 15 });
        true;
      `);
      }
    }, [mapReady, userLocation]);

    const handleMessage = useCallback(
      (event: any) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === "markerPress" && onMarkerPress) {
            onMarkerPress(data.id);
          } else if (data.type === "mapReady") {
            setIsLoading(false);
            setMapReady(true);
            onMapReady?.();
          } else if (data.type === "regionChange" && onRegionChange) {
            onRegionChange({
              latitude: data.latitude,
              longitude: data.longitude,
            });
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
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
});
