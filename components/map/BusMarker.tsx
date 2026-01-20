import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';

interface BusMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  rotation?: number;
  vehicleNo?: string;
  onPress?: () => void;
}

export function BusMarker({ coordinate, rotation = 0, vehicleNo, onPress }: BusMarkerProps) {
  return (
    <Marker
      coordinate={coordinate}
      rotation={rotation}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={styles.container}>
        <Svg width={32} height={32} viewBox="0 0 24 24">
          {/* Bus body */}
          <Path
            d="M4 16V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
            fill="#8B5CF6"
            stroke="#fff"
            strokeWidth={1}
          />
          {/* Windows */}
          <Path
            d="M6 6h12v4H6z"
            fill="#fff"
            opacity={0.9}
          />
          {/* Front indicator (direction arrow) */}
          <Path
            d="M12 2l3 2H9l3-2z"
            fill="#fff"
          />
          {/* Wheels */}
          <Circle cx={7} cy={18} r={2} fill="#333" stroke="#fff" strokeWidth={0.5} />
          <Circle cx={17} cy={18} r={2} fill="#333" stroke="#fff" strokeWidth={0.5} />
        </Svg>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
