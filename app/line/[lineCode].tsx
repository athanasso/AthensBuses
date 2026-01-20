import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRoutes, useStops } from '@/lib/queries';
import type { Stop } from '@/lib/types';

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export default function LineDetailsScreen() {
  const { lineCode, lineId, lineName } = useLocalSearchParams<{ lineCode: string; lineId: string; lineName: string }>();
  const router = useRouter();
  const { theme: colorScheme } = useTheme();
  const { localize, t } = useLanguage();
  const colors = Colors[colorScheme];
  
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Fetch routes
  const { data: routes, isLoading: routesLoading } = useRoutes(lineCode);
  
  // Get selected route code
  const selectedRouteCode = routes?.[selectedRouteIndex]?.RouteCode ?? null;

  // Fetch stops for selected route
  const { data: stops, isLoading: stopsLoading } = useStops(selectedRouteCode);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      let location = await Location.getCurrentPositionAsync({});
      setUserLocation(location.coords);
    })();
  }, []);

  const renderStopItem = ({ item, index }: { item: Stop; index: number }) => {
    let distance = null;
    if (userLocation && item.StopLat && item.StopLng) {
      distance = getDistanceFromLatLonInKm(
        userLocation.latitude,
        userLocation.longitude,
        parseFloat(item.StopLat),
        parseFloat(item.StopLng)
      );
    }

    return (
      <TouchableOpacity
        style={[styles.stopCard, { borderBottomColor: colors.border }]}
        onPress={() => {
          router.push({
            pathname: '/stop/[stopCode]',
            params: { stopCode: item.StopCode, stopName: item.StopDescr }
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.stopLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="bus" size={20} color={colors.accent} />
            <View style={[styles.timelineLine, { backgroundColor: colors.border, display: index === (stops?.length ?? 0) - 1 ? 'none' : 'flex' }]} />
          </View>
          
          <View style={styles.stopInfo}>
            <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={1}>
              {localize(item.StopDescrEng, item.StopDescr)}
            </Text>
            {item.StopStreet ? (
               <Text style={[styles.stopSubtitle, { color: colors.textSecondary }]}>
                 {item.StopStreet}
               </Text>
            ) : null}
             {distance !== null && (
              <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                {distance.toFixed(1)} {t.kmAway}
              </Text>
            )}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const getRouteDescription = () => {
    if (!routes || routes.length === 0) return '';
    const route = routes[selectedRouteIndex];
    return localize(route.RouteDescrEng, route.RouteDescr);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t.lineDetails}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {`${lineId || ''} ${lineName || ''}`}
          </Text>
        </View>

        <View style={styles.headerActions}>
           <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="map-outline" size={24} color={colors.text} />
           </TouchableOpacity>
           {/* Heart icon referenced in screenshot */}
           <TouchableOpacity onPress={() => setIsFavorite(!isFavorite)} style={styles.actionButton}>
              <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={24} color={isFavorite ? colors.accent : colors.text} />
           </TouchableOpacity>
        </View>
      </View>

      {/* Routes/Direction Selector */}
      {routes && routes.length > 0 && (
        <View style={[styles.routeSelector, { borderBottomColor: colors.border }]}>
            <TouchableOpacity 
              style={styles.routeSelectorButton}
              onPress={() => {
                if (routes.length > 1) {
                  setSelectedRouteIndex((prev) => (prev + 1) % routes.length);
                }
              }}
              disabled={routes.length <= 1}
            >
              <View style={styles.routeInfo}>
                <Text style={[styles.routeLabel, { color: colors.accent }]}>DIRECTION</Text>
                <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
                  {getRouteDescription()}
                </Text>
              </View>
              {routes.length > 1 && (
                <Ionicons name="swap-vertical" size={20} color={colors.text} />
              )}
            </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {(routesLoading || stopsLoading) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={stops}
          renderItem={renderStopItem}
          keyExtractor={(item) => item.StopCode}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <Text style={{ color: colors.textSecondary }}>No stops found.</Text>
            </View>
          }
        />
      )}
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
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitleContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  routeSelector: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  routeSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeInfo: {
    flex: 1,
    marginRight: 12,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  routeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    // paddingVertical: 8,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stopLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 20,
    borderRadius: 1,
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stopSubtitle: {
    fontSize: 13,
    marginBottom: 2,
  },
  distanceText: {
    fontSize: 12,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
});
