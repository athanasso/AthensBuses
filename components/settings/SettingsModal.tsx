import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const colors = Colors[theme];

  const handleGithubPress = () => {
    Linking.openURL("https://github.com/athanasso/AthensBuses");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />

        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t.settings}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Appearance Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.accent }]}>
                {t.appearance.toUpperCase()}
              </Text>

              <View style={styles.themeOptions}>
                <TouchableOpacity
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor:
                        themeMode === "light" ? colors.accent : colors.card,
                      borderColor:
                        themeMode === "light" ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setThemeMode("light")}
                >
                  <Ionicons
                    name="sunny"
                    size={24}
                    color={themeMode === "light" ? "#fff" : colors.text}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: themeMode === "light" ? "#fff" : colors.text },
                    ]}
                  >
                    {t.lightMode}
                  </Text>
                  {themeMode === "light" && (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor:
                        themeMode === "dark" ? colors.accent : colors.card,
                      borderColor:
                        themeMode === "dark" ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setThemeMode("dark")}
                >
                  <Ionicons
                    name="moon"
                    size={24}
                    color={themeMode === "dark" ? "#fff" : colors.text}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: themeMode === "dark" ? "#fff" : colors.text },
                    ]}
                  >
                    {t.darkMode}
                  </Text>
                  {themeMode === "dark" && (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor:
                        themeMode === "system" ? colors.accent : colors.card,
                      borderColor:
                        themeMode === "system" ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setThemeMode("system")}
                >
                  <Ionicons
                    name="phone-portrait"
                    size={24}
                    color={themeMode === "system" ? "#fff" : colors.text}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: themeMode === "system" ? "#fff" : colors.text },
                    ]}
                  >
                    {t.systemDefault}
                  </Text>
                  {themeMode === "system" && (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Language Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.accent }]}>
                {t.language.toUpperCase()}
              </Text>

              <View style={styles.languageContainer}>
                <TouchableOpacity
                  style={[
                    styles.langButton,
                    {
                      backgroundColor:
                        language === "en" ? colors.accent : "transparent",
                      borderColor:
                        language === "en" ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setLanguage("en")}
                >
                  <Text
                    style={[
                      styles.langText,
                      { color: language === "en" ? "#fff" : colors.text },
                    ]}
                  >
                    English
                  </Text>
                  {language === "en" && (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.langButton,
                    {
                      backgroundColor:
                        language === "el" ? colors.accent : "transparent",
                      borderColor:
                        language === "el" ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setLanguage("el")}
                >
                  <Text
                    style={[
                      styles.langText,
                      { color: language === "el" ? "#fff" : colors.text },
                    ]}
                  >
                    Ελληνικά
                  </Text>
                  {language === "el" && (
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* About Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.accent }]}>
                {t.about.toUpperCase()}
              </Text>

              <View style={styles.aboutCard}>
                <Ionicons
                  name="code-slash"
                  size={32}
                  color={colors.accent}
                  style={{ marginBottom: 8 }}
                />
                <Text style={[styles.devName, { color: colors.text }]}>
                  {t.developedBy} athanasso
                </Text>
                <Text style={[styles.version, { color: colors.textSecondary }]}>
                  {t.version} 1.2.1
                </Text>

                <TouchableOpacity
                  style={[
                    styles.githubButton,
                    { backgroundColor: colors.card },
                  ]}
                  onPress={handleGithubPress}
                >
                  <Ionicons name="logo-github" size={20} color={colors.text} />
                  <Text style={[styles.githubText, { color: colors.text }]}>
                    {t.viewOnGithub}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
  },
  themeOptions: {
    gap: 10,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  themeOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  languageContainer: {
    flexDirection: "row",
    gap: 12,
  },
  langButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  langText: {
    fontSize: 15,
    fontWeight: "600",
  },
  aboutCard: {
    alignItems: "center",
    padding: 20,
    gap: 8,
  },
  devName: {
    fontSize: 16,
    fontWeight: "600",
  },
  version: {
    fontSize: 14,
  },
  githubButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
    gap: 8,
  },
  githubText: {
    fontWeight: "500",
  },
});
