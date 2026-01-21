import { MotiView } from "moti";
import { Skeleton } from "moti/skeleton";
import React from "react";
import { DimensionValue, StyleSheet, View } from "react-native";

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  colorScheme?: "light" | "dark";
}

export function SkeletonLoader({
  width = "100%",
  height = 20,
  radius = 4,
  colorScheme = "dark",
}: SkeletonLoaderProps) {
  return (
    <MotiView
      transition={{ type: "timing" }}
      style={[styles.skeleton, { width, height, borderRadius: radius }]}
      animate={{
        backgroundColor: colorScheme === "dark" ? "#2a2a2a" : "#e5e5e5",
      }}
    >
      <Skeleton
        colorMode={colorScheme}
        width={typeof width === "number" ? width : undefined}
        height={height}
        radius={radius}
      />
    </MotiView>
  );
}

interface LineSkeletonProps {
  colorScheme?: "light" | "dark";
}

export function LineSkeleton({ colorScheme = "dark" }: LineSkeletonProps) {
  const colors = Colors[colorScheme];

  return (
    <View
      style={[
        styles.lineItem,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <SkeletonLoader
        width={50}
        height={32}
        radius={16}
        colorScheme={colorScheme}
      />
      <View style={styles.lineTextContainer}>
        <SkeletonLoader width={200} height={16} colorScheme={colorScheme} />
        <SkeletonLoader width={150} height={12} colorScheme={colorScheme} />
      </View>
    </View>
  );
}

export function ArrivalSkeleton({ colorScheme = "dark" }: LineSkeletonProps) {
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.arrivalItem, { borderColor: colors.border }]}>
      <SkeletonLoader
        width={48}
        height={24}
        radius={12}
        colorScheme={colorScheme}
      />
      <View style={styles.arrivalTextContainer}>
        <SkeletonLoader width={160} height={14} colorScheme={colorScheme} />
      </View>
      <SkeletonLoader
        width={60}
        height={20}
        radius={4}
        colorScheme={colorScheme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
  },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  lineTextContainer: {
    flex: 1,
    gap: 6,
  },
  arrivalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  arrivalTextContainer: {
    flex: 1,
  },
});
