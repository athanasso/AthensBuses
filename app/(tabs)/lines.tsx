import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { LineSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLines, useRoutes, useSchedule } from '@/lib/queries';
import type { Line, Route } from '@/lib/types';

export default function LinesScreen() {
  const { theme: colorScheme } = useTheme();
  const { localize, t } = useLanguage();
  const colors = Colors[colorScheme];
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [selectedLineCode, setSelectedLineCode] = useState<string | null>(null);

  const { data: lines, isLoading } = useLines();
  const { data: routes } = useRoutes(expandedLine);
  const { data: schedule, isLoading: scheduleLoading } = useSchedule(selectedLineCode);

  // Get current time in HH:MM format for comparison
  const getCurrentTimeStr = (): string => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const currentTime = getCurrentTimeStr();

  // Filter lines based on search query
  const filteredLines = useMemo(() => {
    if (!lines) return [];
    if (!searchQuery.trim()) return lines;

    const query = searchQuery.toLowerCase();
    return lines.filter(line => 
      line.LineID.toLowerCase().includes(query) ||
      line.LineDescr.toLowerCase().includes(query) ||
      line.LineDescrEng.toLowerCase().includes(query)
    );
  }, [lines, searchQuery]);

  // Group lines by LineID to avoid duplicates in display
  const groupedLines = useMemo(() => {
    const groups: { [key: string]: Line[] } = {};
    filteredLines.forEach(line => {
      if (!groups[line.LineID]) {
        groups[line.LineID] = [];
      }
      groups[line.LineID].push(line);
    });
    return Object.entries(groups).map(([lineId, lineGroup]) => ({
      lineId,
      lines: lineGroup,
      primaryLine: lineGroup[0],
    }));
  }, [filteredLines]);

  const handleLinePress = (line: Line) => {
    if (expandedLine === line.LineCode) {
      setExpandedLine(null);
      setSelectedLineCode(null);
    } else {
      setExpandedLine(line.LineCode);
      setSelectedLineCode(line.LineCode);
    }
  };

  const handleRoutePress = (route: Route) => {
    // Navigate to map with this route selected
    // For now, just collapse the expanded line
    setExpandedLine(null);
    setSelectedLineCode(null);
    // TODO: Navigate to map screen with route
  };

  const renderLine = ({ item }: { item: { lineId: string; lines: Line[]; primaryLine: Line } }) => {
    const isExpanded = item.lines.some(l => l.LineCode === expandedLine);
    const line = item.primaryLine;

    return (
      <View>
        <TouchableOpacity
          style={[styles.lineItem, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleLinePress(line)}
          activeOpacity={0.7}
        >
          <View style={[styles.lineBadge, { backgroundColor: colors.accent }]}>
            <Text style={styles.lineBadgeText}>{line.LineID}</Text>
          </View>
          <View style={styles.lineInfo}>
            <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={2}>
              {localize(line.LineDescrEng, line.LineDescr)}
            </Text>
          </View>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-forward"} 
            size={20} 
            color={colors.textSecondary} 
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContainer}>
            {/* View Details Button */}
            <TouchableOpacity 
              style={[
                styles.viewDetailsButton, 
                { borderColor: colors.accent, marginBottom: 12 }
              ]}
              onPress={() => {
                router.push({
                  pathname: '/line/[lineCode]',
                  params: { 
                    lineCode: line.LineCode, 
                    lineId: line.LineID, 
                    lineName: line.LineDescrEng || line.LineDescr 
                  }
                });
              }}
            >
              <Ionicons name="list" size={18} color={colors.accent} />
              <Text style={[styles.viewDetailsText, { color: colors.accent }]}>
                View Line Details & Stops
              </Text>
            </TouchableOpacity>

            {/* Routes */}
            {routes && routes.length > 0 && (
              <View style={styles.routesContainer}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                  {t.routes}
                </Text>
                {routes.map((route) => (
                  <TouchableOpacity
                    key={route.RouteCode}
                    style={[styles.routeItem, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                    onPress={() => handleRoutePress(route)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="git-branch-outline" size={16} color={colors.accent} />
                    <Text style={[styles.routeName, { color: colors.text }]} numberOfLines={1}>
                      {localize(route.RouteDescrEng, route.RouteDescr)}
                    </Text>
                    {route.RouteDistance && (
                      <Text style={[styles.routeDistance, { color: colors.textSecondary }]}>
                        {(parseFloat(route.RouteDistance) / 1000).toFixed(1)} km
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Schedule */}
            <View style={styles.scheduleSection}>
              {scheduleLoading ? (
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                  Loading schedule...
                </Text>
              ) : schedule && (schedule.departure.length > 0 || schedule.return.length > 0) ? (
                <>
                  {/* Departure schedule */}
                  {schedule.departure.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                        Departure ({schedule.departure.length})
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
                      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 10 }]}>
                        Return ({schedule.return.length})
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
                </>
              ) : (
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  No schedule available
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t.busLines}</Text>
        <TouchableOpacity 
          style={[styles.searchButton, { backgroundColor: colors.card }]}
          onPress={() => {/* Focus search input */}}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Search input */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t.searchLines}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Lines list */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <LineSkeleton key={i} colorScheme={colorScheme} />
          ))}
        </View>
      ) : (
        <FlatList
          data={groupedLines}
          keyExtractor={(item) => item.lineId}
          renderItem={renderLine}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  searchButton: {
    padding: 8,
    borderRadius: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  loadingContainer: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  lineBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 50,
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
    fontWeight: '500',
  },
  expandedContainer: {
    marginLeft: 20,
    marginBottom: 12,
    gap: 12,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  routesContainer: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  routeName: {
    flex: 1,
    fontSize: 13,
  },
  routeDistance: {
    fontSize: 12,
  },
  scheduleSection: {
    gap: 6,
  },
  scheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    fontSize: 13,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  noDataText: {
    fontSize: 13,
  },
});
