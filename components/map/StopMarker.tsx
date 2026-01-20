import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

interface StopMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  stopCode: string;
  stopName?: string;
  isSelected?: boolean;
  onPress?: () => void;
}

export function StopMarker({ 
  coordinate, 
  stopCode, 
  stopName,
  isSelected = false, 
  onPress 
}: StopMarkerProps) {
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={styles.container}>
        <View style={[
          styles.pin,
          isSelected && styles.pinSelected
        ]}>
          <View style={styles.pinInner} />
        </View>
        <View style={[
          styles.pinShadow,
          isSelected && styles.pinShadowSelected
        ]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  pinSelected: {
    backgroundColor: '#A78BFA',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
  },
  pinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  pinShadow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#8B5CF6',
    marginTop: -2,
  },
  pinShadowSelected: {
    borderTopColor: '#A78BFA',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
  },
});
