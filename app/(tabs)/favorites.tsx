import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    FlatList,
    Platform,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

// TODO: Implement favorites storage with AsyncStorage
interface FavoriteItem {
  id: string;
  type: 'line' | 'stop';
  name: string;
  code: string;
}

export default function FavoritesScreen() {
  const { theme: colorScheme } = useTheme();
  const { t } = useLanguage();
  const colors = Colors[colorScheme];

  // TODO: Load favorites from AsyncStorage
  const favorites: FavoriteItem[] = [];

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {t.noFavoritesYet}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {t.noFavoritesDescription}
      </Text>
    </View>
  );

  const renderFavorite = ({ item }: { item: FavoriteItem }) => (
    <View style={[styles.favoriteItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconContainer, { backgroundColor: colors.accent + '20' }]}>
        <Ionicons 
          name={item.type === 'line' ? 'bus' : 'location'} 
          size={20} 
          color={colors.accent} 
        />
      </View>
      <View style={styles.favoriteInfo}>
        <Text style={[styles.favoriteName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.favoriteCode, { color: colors.textSecondary }]}>
          {item.type === 'line' ? t.line : t.stop} {item.code}
        </Text>
      </View>
      <Ionicons name="heart" size={20} color={colors.accent} />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t.favorites}</Text>
      </View>

      {/* Content */}
      {favorites.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={renderFavorite}
          contentContainerStyle={styles.listContent}
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  favoriteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteInfo: {
    flex: 1,
  },
  favoriteName: {
    fontSize: 15,
    fontWeight: '600',
  },
  favoriteCode: {
    fontSize: 13,
    marginTop: 2,
  },
});
