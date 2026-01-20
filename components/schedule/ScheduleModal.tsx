import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import type { LineScheduleResult } from '@/lib/api';

interface ScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  schedule: LineScheduleResult | null | undefined;
  lineId: string;
  routeName: string;
  colorScheme: 'light' | 'dark' | null;
}

export function ScheduleModal({
  visible,
  onClose,
  schedule,
  lineId,
  routeName,
  colorScheme,
}: ScheduleModalProps) {
  const colors = Colors[colorScheme ?? 'dark'];
  const [currentScheduleIndex, setCurrentScheduleIndex] = useState(0);
  
  // Get current time in HH:MM format
  const currentTime = useMemo(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  // Find the next departure index for highlighting
  const findNextDepartureIndex = (times: string[]) => {
    return times.findIndex(time => time >= currentTime);
  };

  if (!schedule) return null;

  const departureTimes = schedule.departure;
  const returnTimes = schedule.return;
  const maxRows = Math.max(departureTimes.length, returnTimes.length);

  const nextDepartureIdx = findNextDepartureIndex(departureTimes);
  const nextReturnIdx = findNextDepartureIndex(returnTimes);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.navButton} onPress={onClose}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            
            <View style={styles.headerCenter}>
              <Text style={[styles.lineTitle, { color: colors.text }]}>
                Line {lineId} Schedule
              </Text>
              <Text style={[styles.routeTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {routeName}
              </Text>
              <Text style={[styles.scheduleType, { color: colors.textSecondary }]}>
                1 / 3
              </Text>
            </View>
            
            <TouchableOpacity style={styles.navButton} onPress={onClose}>
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Table Header */}
          <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.columnHeader, { color: colors.textSecondary }]}>
              Departure
            </Text>
            <Text style={[styles.columnHeader, { color: colors.textSecondary }]}>
              Return
            </Text>
          </View>

          {/* Schedule Table */}
          <ScrollView style={styles.tableScroll} showsVerticalScrollIndicator={false}>
            {Array.from({ length: maxRows }).map((_, i) => {
              const depTime = departureTimes[i];
              const retTime = returnTimes[i];
              const isDepNext = i === nextDepartureIdx;
              const isRetNext = i === nextReturnIdx;
              const isDepPast = depTime && depTime < currentTime;
              const isRetPast = retTime && retTime < currentTime;

              return (
                <View key={i} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.tableCell}>
                    {depTime && (
                      <Text style={[
                        styles.timeText,
                        isDepNext && styles.nextTime,
                        isDepNext && { color: colors.accent },
                        isDepPast && styles.pastTime,
                      ]}>
                        {depTime}
                      </Text>
                    )}
                  </View>
                  <View style={styles.tableCell}>
                    {retTime && (
                      <Text style={[
                        styles.timeText,
                        isRetNext && styles.nextTime,
                        isRetNext && { color: colors.accent },
                        isRetPast && styles.pastTime,
                      ]}>
                        {retTime}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  lineTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  routeTitle: {
    fontSize: 13,
    marginTop: 2,
  },
  scheduleType: {
    fontSize: 12,
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  columnHeader: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableScroll: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableCell: {
    flex: 1,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  nextTime: {
    fontWeight: '700',
    fontSize: 17,
  },
  pastTime: {
    color: '#666',
  },
});
