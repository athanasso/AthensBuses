import { Colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useClosestStops } from '@/lib/queries';
import type { Stop } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

interface NearbyStopsCardsProps {
  userLocation: { latitude: number; longitude: number } | null;
  onStopPress: (stop: Stop) => void;
}

export function NearbyStopsCards({ 
  userLocation, 
  onStopPress,
}: NearbyStopsCardsProps) {
  const { theme: colorScheme } = useTheme();
  const { localize } = useLanguage();
  const { data: stops, isLoading } = useClosestStops(
    userLocation?.latitude ?? null,
    userLocation?.longitude ?? null
  );

  const colors = Colors[colorScheme];

  if (!userLocation) {
    return null;
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!stops || stops.length === 0) {
    return null;
  }

  // Take first 4 closest stops
  const nearbyStops = stops.slice(0, 4);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {nearbyStops.map((stop) => (
          <TouchableOpacity
            key={stop.StopCode}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => onStopPress(stop)}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <Ionicons name="bus" size={16} color={colors.accent} style={styles.icon} />
              <View style={styles.textContainer}>
                <Text 
                  style={[styles.stopName, { color: colors.text }]} 
                  numberOfLines={1}
                >
                  {localize(stop.StopDescrEng, stop.StopDescr)}
                </Text>
                <Text style={[styles.distance, { color: colors.textSecondary }]}>
                  {formatDistance(stop.distance)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function formatDistance(distance?: string): string {
  if (!distance) return '';
  
  const meters = parseFloat(distance);
  if (isNaN(meters)) return '';
  
  // API returns distance in meters
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 150,
    maxWidth: 200,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '600',
  },
  distance: {
    fontSize: 12,
    marginTop: 2,
  },
});
