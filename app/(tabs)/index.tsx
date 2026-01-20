import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBusLocations, useClosestStops, useRouteDetails, useStops } from '@/lib/queries';
import type { Stop } from '@/lib/types';

import { ArrivalsSheet } from '@/components/arrivals/ArrivalsSheet';
import { NearbyStopsCards } from '@/components/map/NearbyStopsCards';
import { MapMarker, OpenStreetMap, OpenStreetMapRef } from '@/components/map/OpenStreetMap';
import { SettingsModal } from '@/components/settings/SettingsModal';

// Athens center coordinates
const ATHENS_CENTER = {
  latitude: 37.9838,
  longitude: 23.7275,
};

export default function StopsScreen() {
  const { theme: colorScheme } = useTheme();
  const { t } = useLanguage();
  const colors = Colors[colorScheme];
  
  const bottomSheetRef = useRef<BottomSheet>(null);
  const mapRef = useRef<OpenStreetMapRef>(null);
  const [isLocating, setIsLocating] = useState(false);
  
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number }>(ATHENS_CENTER);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedRouteCode, setSelectedRouteCode] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Queries - use mapCenter for fetching stops (updates when map moves)
  const { data: nearbyStops } = useClosestStops(
    mapCenter.latitude,
    mapCenter.longitude
  );
  
  const { data: routeDetails } = useRouteDetails(selectedRouteCode);
  const { data: busLocations } = useBusLocations(selectedRouteCode, { enabled: isMapReady });
  const { data: routeStops } = useStops(selectedRouteCode);

  // Get user location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const userLoc = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(userLoc);
      setMapCenter(userLoc); // Start centered on user
    })();
  }, []);

  // Handle stop press from nearby cards
  const handleStopPress = useCallback((stop: Stop) => {
    setSelectedStop(stop);
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  // Handle marker press from map
  const handleMarkerPress = useCallback((markerId: string) => {
    const stops = routeStops || nearbyStops || [];
    const stop = stops.find(s => s.StopCode === markerId);
    if (stop) {
      setSelectedStop(stop);
      bottomSheetRef.current?.snapToIndex(0);
    }
  }, [routeStops, nearbyStops]);

  // Handle sheet close
  const handleSheetClose = useCallback(() => {
    setSelectedStop(null);
  }, []);

  // Handle map region change - load stops for new area
  const handleRegionChange = useCallback((center: { latitude: number; longitude: number }) => {
    setMapCenter(center);
  }, []);

  // Get stops to display (nearby or route stops)
  const stopsToDisplay = routeStops || nearbyStops || [];

  // Convert stops to map markers
  const mapMarkers: MapMarker[] = stopsToDisplay.slice(0, 30).map((stop) => ({
    id: stop.StopCode,
    latitude: parseFloat(stop.StopLat),
    longitude: parseFloat(stop.StopLng),
    type: 'stop' as const,
    label: stop.StopDescrEng || stop.StopDescr,
    selected: selectedStop?.StopCode === stop.StopCode,
  }));

  // Add bus markers
  const busMarkers: MapMarker[] = (busLocations || []).map((bus) => ({
    id: bus.VEH_NO,
    latitude: parseFloat(bus.CS_LAT),
    longitude: parseFloat(bus.CS_LNG),
    type: 'bus' as const,
    label: bus.VEH_NO,
  }));

  const allMarkers = [...mapMarkers, ...busMarkers];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t.athensBuses}</Text>
        <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* OpenStreetMap */}
      <OpenStreetMap
        ref={mapRef}
        center={mapCenter}
        zoom={15}
        markers={allMarkers}
        userLocation={userLocation}
        onMarkerPress={handleMarkerPress}
        onMapReady={() => setIsMapReady(true)}
        onRegionChange={handleRegionChange}
        darkMode={colorScheme === 'dark'}
      />

      {/* Current location button */}
      <TouchableOpacity 
        style={[styles.locationButton, { backgroundColor: colors.card, borderColor: colors.border }]}
        disabled={isLocating}
        onPress={async () => {
          if (isLocating) return;
          setIsLocating(true);
          try {
            if (userLocation) {
              mapRef.current?.centerOnLocation(userLocation.latitude, userLocation.longitude);
              setMapCenter(userLocation);
            } else {
              // Try to get location again
              const location = await Location.getCurrentPositionAsync({});
              const newLoc = { latitude: location.coords.latitude, longitude: location.coords.longitude };
              setUserLocation(newLoc);
              mapRef.current?.centerOnLocation(newLoc.latitude, newLoc.longitude);
              setMapCenter(newLoc);
            }
          } finally {
            setTimeout(() => setIsLocating(false), 500);
          }
        }}
      >
        <Ionicons name={isLocating ? 'locate-outline' : 'locate'} size={22} color={colors.accent} />
      </TouchableOpacity>

      {/* Nearby stops cards */}
      <NearbyStopsCards
        userLocation={userLocation}
        onStopPress={handleStopPress}
      />

      {/* Arrivals bottom sheet */}
      <ArrivalsSheet
        ref={bottomSheetRef}
        stop={selectedStop}
        onClose={handleSheetClose}
      />

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  settingsButton: {
    padding: 8,
    borderRadius: 20,
  },
  locationButton: {
    position: 'absolute',
    right: 16,
    bottom: 140,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
