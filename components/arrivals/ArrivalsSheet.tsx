import { ScheduleModal } from '@/components/schedule/ScheduleModal';
import { ArrivalSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { StopRoute } from '@/lib/api';
import { useRoutesForStop, useSchedule, useStopArrivals } from '@/lib/queries';
import type { Stop, StopArrival } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface ArrivalsSheetProps {
  stop: Stop | null;
  onClose: () => void;
}

export const ArrivalsSheet = forwardRef<BottomSheet, ArrivalsSheetProps>(
  ({ stop, onClose }, ref) => {
    const router = useRouter();
    const { theme: colorScheme } = useTheme();
    const { localize, t } = useLanguage();
    const snapPoints = useMemo(() => ['45%', '85%'], []);
    const colors = Colors[colorScheme];
    const [isFavorite, setIsFavorite] = useState(false);
    const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
    const [selectedMlCode, setSelectedMlCode] = useState<string | null>(null);
    const [selectedLineCode, setSelectedLineCode] = useState<string | null>(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleLineId, setScheduleLineId] = useState('');
    const [scheduleRouteName, setScheduleRouteName] = useState('');

    // Fetch data
    const { data: arrivals } = useStopArrivals(stop?.StopCode ?? null);
    const { data: routes, isLoading: routesLoading } = useRoutesForStop(stop?.StopCode ?? null);
    const { data: schedule, isLoading: scheduleLoading } = useSchedule(selectedLineCode);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      []
    );

    // Group arrivals by line
    const arrivalsByLine = useMemo(() => {
      if (!arrivals) return new Map<string, StopArrival[]>();
      
      const map = new Map<string, StopArrival[]>();
      arrivals.forEach(arr => {
        const existing = map.get(arr.route_code) || [];
        existing.push(arr);
        map.set(arr.route_code, existing);
      });
      
      // Sort each group by time
      map.forEach((arrs) => {
        arrs.sort((a, b) => (parseInt(a.btime2) || 999) - (parseInt(b.btime2) || 999));
      });
      
      return map;
    }, [arrivals]);

    // Get unique lines from routes
    const uniqueLines = useMemo(() => {
      if (!routes) return [];
      const seen = new Set<string>();
      return routes.filter(r => {
        if (seen.has(r.LineID)) return false;
        seen.add(r.LineID);
        return true;
      });
    }, [routes]);

    const toggleFavorite = () => {
      setIsFavorite(!isFavorite);
      // TODO: Save to AsyncStorage
    };

    const formatTime = (minutes: number): string => {
      if (minutes < 1) return 'Now';
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    };

    // Get current time in HH:MM format for comparison
    const getCurrentTimeStr = (): string => {
      const now = new Date();
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    };

    const renderLineCard = (route: StopRoute) => {
      const lineArrivals = arrivalsByLine.get(route.RouteCode) || [];
      const nextArrival = lineArrivals[0];
      const secondArrival = lineArrivals[1];
      const nextMinutes = nextArrival ? parseInt(nextArrival.btime2) || 0 : null;
      const secondMinutes = secondArrival ? parseInt(secondArrival.btime2) || 0 : null;
      const isSelected = selectedRoute === route.RouteCode;
      const currentTime = getCurrentTimeStr();

      return (
        <View key={route.RouteCode} style={styles.lineCardContainer}>
          <TouchableOpacity
            style={[
              styles.lineCard,
              { 
                backgroundColor: isSelected ? colors.accent + '15' : colors.card,
                borderColor: isSelected ? colors.accent : colors.border,
              }
            ]}
            onPress={() => {
              if (isSelected) {
                setSelectedRoute(null);
                setSelectedMlCode(null);
                setSelectedLineCode(null);
              } else {
                setSelectedRoute(route.RouteCode);
                setSelectedMlCode(route.MasterLineCode);
                setSelectedLineCode(route.LineCode);
              }
            }}
            activeOpacity={0.7}
          >
            {/* Line badge */}
            <View style={[styles.lineBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.lineBadgeText}>{route.LineID}</Text>
            </View>

            {/* Line info */}
            <View style={styles.lineInfo}>
              <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
                {localize(route.RouteDescrEng, route.RouteDescr)}
              </Text>
              <Text style={[styles.lineSubtitle, { color: colors.textSecondary }]}>
                {lineArrivals.length > 0 
                  ? `${lineArrivals.length} ${lineArrivals.length > 1 ? t.lines : t.lines} ${t.arriving.toLowerCase()}`
                  : t.schedule}
              </Text>
            </View>

            {/* Next arrival with "also in X'" */}
            {nextMinutes !== null ? (
              <View style={styles.arrivalContainer}>
                {nextMinutes < 2 ? (
                  <MotiView
                    from={{ opacity: 0.5 }}
                    animate={{ opacity: 1 }}
                    transition={{ type: 'timing', duration: 800, loop: true }}
                  >
                    <Text style={styles.arrivingNow}>Now</Text>
                  </MotiView>
                ) : (
                  <View style={styles.arrivalTimes}>
                    <Text style={[styles.arrivalTime, { color: colors.accent }]}>
                      {nextMinutes}'
                    </Text>
                    {secondMinutes !== null && (
                      <Text style={[styles.alsoIn, { color: colors.textSecondary }]}>
                        {t.alsoIn} {secondMinutes}'
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <Ionicons 
                name={isSelected ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color={colors.textSecondary} 
              />
            )}
          </TouchableOpacity>

          {/* Expanded content - arrivals and schedule */}
          {isSelected && (
            <View style={[styles.expandedContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Link to Line Details */}
              <TouchableOpacity
                style={[styles.viewScheduleButton, { borderColor: colors.accent, marginBottom: 12 }]}
                onPress={() => {
                  router.push({
                    pathname: '/line/[lineCode]',
                    params: { 
                      lineCode: route.LineCode, 
                      lineId: route.LineID, 
                      lineName: localize(route.RouteDescrEng, route.RouteDescr) 
                    }
                  });
                }}
              >
                 <Ionicons name="map-outline" size={16} color={colors.accent} />
                 <Text style={[styles.viewScheduleText, { color: colors.accent }]}>{t.viewLineDetails}</Text>
              </TouchableOpacity>

              {/* Live arrivals for this line */}
              {lineArrivals.length > 0 && (
                <View style={styles.arrivalsSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                    Live Arrivals
                  </Text>
                  {lineArrivals.map((arr, i) => {
                    const mins = parseInt(arr.btime2) || 0;
                    return (
                      <View key={`${arr.veh_code}-${i}`} style={styles.arrivalRow}>
                        <View style={styles.arrivalRowLeft}>
                          <View style={[styles.busIcon, { backgroundColor: colors.accent + '25' }]}>
                            <Ionicons name="bus" size={14} color={colors.accent} />
                          </View>
                          <Text style={[styles.vehicleText, { color: colors.textSecondary }]}>
                            Bus #{arr.veh_code}
                          </Text>
                        </View>
                        {mins < 2 ? (
                          <Text style={styles.arrivingNowSmall}>Arriving</Text>
                        ) : (
                          <Text style={[styles.arrivalTimeSmall, i === 0 && { color: colors.accent, fontWeight: '700' }]}>
                            {formatTime(mins)}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Timetable */}
              {scheduleLoading ? (
                <View style={styles.scheduleSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                    Schedule
                  </Text>
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    Loading timetable...
                  </Text>
                </View>
              ) : schedule && (schedule.departure.length > 0 || schedule.return.length > 0) ? (
                <View style={styles.scheduleSection}>
                  {/* Departure schedule */}
                  {schedule.departure.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                        {t.departure} ({schedule.departure.length})
                      </Text>
                      <View style={styles.scheduleGrid}>
                        {schedule.departure.map((time, i) => {
                          const isNext = time >= currentTime && 
                            (i === 0 || schedule.departure[i - 1] < currentTime);
                          const isPast = time < currentTime;
                          
                          return (
                            <View 
                              key={`dep-${i}`} 
                              style={[
                                styles.scheduleItem,
                                { 
                                  backgroundColor: isNext ? colors.accent : isPast ? colors.border : colors.background,
                                  borderColor: isNext ? colors.accent : colors.border,
                                }
                              ]}
                            >
                              <Text style={[
                                styles.scheduleTime,
                                { color: isNext ? '#fff' : isPast ? colors.textSecondary : colors.text }
                              ]}>
                                {time}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )}
                  
                  {/* Return schedule */}
                  {schedule.return.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                        {t.returnTrip} ({schedule.return.length})
                      </Text>
                      <View style={styles.scheduleGrid}>
                        {schedule.return.map((time, i) => {
                          const isNext = time >= currentTime && 
                            (i === 0 || schedule.return[i - 1] < currentTime);
                          const isPast = time < currentTime;
                          
                          return (
                            <View 
                              key={`ret-${i}`} 
                              style={[
                                styles.scheduleItem,
                                { 
                                  backgroundColor: isNext ? '#22c55e' : isPast ? colors.border : colors.background,
                                  borderColor: isNext ? '#22c55e' : colors.border,
                                }
                              ]}
                            >
                              <Text style={[
                                styles.scheduleTime,
                                { color: isNext ? '#fff' : isPast ? colors.textSecondary : colors.text }
                              ]}>
                                {time}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              ) : null}

              {lineArrivals.length === 0 && (!schedule || (schedule.departure.length === 0 && schedule.return.length === 0)) && !scheduleLoading && (
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  No schedule data available
                </Text>
              )}
            </View>
          )}
        </View>
      );
    };

    return (
      <>
        <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={() => {
          setSelectedRoute(null);
          setSelectedMlCode(null);
          setSelectedLineCode(null);
          onClose();
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      >
        <BottomSheetScrollView style={styles.content}>
          {stop && (
            <>
              {/* Header */}
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity 
                  style={styles.headerLeft}
                  onPress={() => {
                    // Navigate to full details
                     router.push({
                      pathname: '/stop/[stopCode]',
                      params: { 
                        stopCode: stop.StopCode, 
                        stopName: localize(stop.StopDescrEng, stop.StopDescr) 
                      }
                    });
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.stopName, { color: colors.text }]}>
                      {localize(stop.StopDescrEng, stop.StopDescr)}
                    </Text>
                    <Ionicons name="chevron-forward-circle" size={20} color={colors.accent} />
                  </View>
                  <Text style={[styles.stopCode, { color: colors.textSecondary }]}>
                    {t.stops} #{stop.StopCode}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.favoriteButton, { backgroundColor: isFavorite ? colors.accent : colors.card }]}
                  onPress={toggleFavorite}
                >
                  <Ionicons 
                    name={isFavorite ? 'heart' : 'heart-outline'} 
                    size={22} 
                    color={isFavorite ? '#fff' : colors.accent} 
                  />
                </TouchableOpacity>
              </View>

              {/* Section title */}
              <View style={styles.sectionHeader}>
                <Ionicons name="bus-outline" size={18} color={colors.accent} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Bus Lines at this Stop
                </Text>
              </View>

              {/* Content */}
              {routesLoading ? (
                <View style={styles.loadingContainer}>
                  {[1, 2, 3].map((i) => (
                    <ArrivalSkeleton key={i} colorScheme={colorScheme} />
                  ))}
                </View>
              ) : uniqueLines.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="bus-outline" size={48} color={colors.textSecondary} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No bus lines found
                  </Text>
                </View>
              ) : (
                <View style={styles.linesList}>
                  {uniqueLines.map(route => renderLineCard(route))}
                </View>
              )}
            </>
          )}
        </BottomSheetScrollView>
        </BottomSheet>
        
        <ScheduleModal
          visible={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          schedule={schedule}
          lineId={scheduleLineId}
          routeName={scheduleRouteName}
          colorScheme={colorScheme}
        />
      </>
    );
  }
);

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  stopInfo: {
    flex: 1,
    marginRight: 16,
  },
  stopCode: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  stopName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  stopStreet: {
    fontSize: 14,
  },
  favoriteButton: {
    padding: 8,
  },
  linesBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  linesLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linesLabelText: {
    fontSize: 13,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lineBadgeSmall: {
    backgroundColor: '#333',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  lineBadgeSmallText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  lineCardContainer: {
    marginBottom: 12,
  },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  lineBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 48,
    alignItems: 'center',
  },
  lineBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  lineInfo: {
    flex: 1,
  },
  lineName: {
    fontSize: 15,
    fontWeight: '600',
  },
  lineSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  arrivalTime: {
    fontSize: 22,
    fontWeight: '700',
  },
  arrivingNow: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ef4444',
  },
  expandedContent: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  arrivalsSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  arrivalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  arrivalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  busIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleText: {
    fontSize: 13,
  },
  arrivalTimeSmall: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  arrivingNowSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  scheduleSection: {
    gap: 6,
  },
  scheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  scheduleItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 52,
    alignItems: 'center',
  },
  scheduleTime: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  noDataText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  loadingContainer: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
  linesList: {
    gap: 4,
  },
  arrivalContainer: {
    alignItems: 'flex-end',
  },
  arrivalTimes: {
    alignItems: 'flex-end',
  },
  alsoIn: {
    fontSize: 11,
    marginTop: 2,
  },
  viewScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  viewScheduleText: {
    fontSize: 14,
    fontWeight: '600',
  },
});


