import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

type Language = "en" | "el";

interface Translations {
  // Navigation
  stops: string;
  lines: string;
  favorites: string;
  ticket: string;
  settings: string;

  // Common
  loading: string;
  noData: string;
  error: string;
  retry: string;
  close: string;
  back: string;
  tapForSchedule: string;

  // Map/Stops
  athensBuses: string;
  stopDetails: string;
  nearbyStops: string;
  liveArrivals: string;
  noArrivals: string;
  arriving: string;
  now: string;
  alsoIn: string;
  busesComingFormat: string;
  kmAway: string;
  busLinesAtStop: string;
  noRoutesFound: string;

  // Lines
  busLines: string;
  lineDetails: string;
  searchLines: string;
  routes: string;
  direction: string;
  schedule: string;
  departure: string;
  returnTrip: string;
  noSchedule: string;
  viewFullSchedule: string;
  viewLineDetails: string;
  noStopsFound: string;
  loadingSchedule: string;

  // Favorites
  noFavoritesYet: string;
  noFavoritesDescription: string;
  line: string;
  stop: string;

  // Settings
  appearance: string;
  darkMode: string;
  lightMode: string;
  systemDefault: string;
  language: string;
  about: string;
  developedBy: string;
  version: string;
  viewOnGithub: string;

  // Ticket Scanner
  scanTicket: string;
  scanTicketDesc: string;
  ticketInfo: string;
  ticketActive: string;
  ticketExpired: string;
  tripsRemaining: string;
  unlimited: string;
  cardId: string;
  uid: string;
  cardType: string;
  manufacturer: string;
  cardCapacity: string;
  productionDate: string;
  encryptedData: string;
  userCategory: string;
  activeProduct: string;
  expiredProduct: string;
  expiryDate: string;
  loadDate: string;
  timeRemaining: string;
  tapToScanAgain: string;
  nfcNotSupported: string;
  nfcNotSupportedDesc: string;
  nfcDisabled: string;
  nfcDisabledDesc: string;
  ticketReadError: string;
  cardDetails: string;
  ticketData: string;
}

const translations: Record<Language, Translations> = {
  en: {
    // Navigation
    stops: "Stops",
    lines: "Lines",
    favorites: "Favorites",
    ticket: "Ticket",
    settings: "Settings",

    // Common
    loading: "Loading...",
    noData: "No data available",
    error: "An error occurred",
    retry: "Retry",
    close: "Close",
    back: "Back",
    tapForSchedule: "Tap for schedule",

    // Map/Stops
    athensBuses: "Athens Buses",
    stopDetails: "Stop Details",
    nearbyStops: "Nearby Stops",
    liveArrivals: "Live Arrivals",
    noArrivals: "No arrivals scheduled",
    arriving: "Arriving",
    now: "Now",
    alsoIn: "also in",
    busesComingFormat: "{count} bus{plural} coming",
    kmAway: "km away",
    busLinesAtStop: "Bus lines at this stop",
    noRoutesFound: "No routes found for this stop.",

    // Lines
    busLines: "Bus Lines",
    lineDetails: "Line Details",
    searchLines: "Search lines or routes...",
    routes: "Routes",
    direction: "Direction",
    schedule: "Schedule",
    departure: "Departure",
    returnTrip: "Return",
    noSchedule: "No schedule available",
    viewFullSchedule: "View Full Schedule",
    viewLineDetails: "View Line Details",
    noStopsFound: "No stops found.",
    loadingSchedule: "Loading schedule...",

    // Favorites
    noFavoritesYet: "No favorites yet",
    noFavoritesDescription:
      "Tap the heart icon to add stops or lines to your favorites",
    line: "Line",
    stop: "Stop",

    // Settings
    appearance: "Appearance",
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    systemDefault: "System Default",
    language: "Language",
    about: "About",
    developedBy: "Developed by",
    version: "Version",
    viewOnGithub: "View on GitHub",

    // Ticket Scanner
    scanTicket: "Scan Your Ticket",
    scanTicketDesc:
      "Hold your ATH.ENA ticket or card against the back of your phone to read ticket information.",
    ticketInfo: "Ticket Information",
    ticketActive: "Active",
    ticketExpired: "Expired",
    tripsRemaining: "Trips Remaining",
    unlimited: "Unlimited",
    cardId: "Card ID",
    uid: "UID",
    cardType: "Card Type",
    manufacturer: "Manufacturer",
    cardCapacity: "Capacity",
    productionDate: "Manufactured",
    encryptedData: "Data Encrypted",
    userCategory: "User Category",
    activeProduct: "Active Product",
    expiredProduct: "Expired Product",
    expiryDate: "End of Trip",
    loadDate: "Load Date",
    timeRemaining: "remaining",
    tapToScanAgain: "Tap another ticket to scan again",
    nfcNotSupported: "NFC Not Supported",
    nfcNotSupportedDesc:
      "Your device does not support NFC. This feature requires an NFC-enabled Android device.",
    nfcDisabled: "NFC Disabled",
    nfcDisabledDesc:
      "Please enable NFC in your device settings to scan tickets.",
    ticketReadError: "Could not read ticket. Please try again.",
    cardDetails: "Card Details",
    ticketData: "Ticket Data",
  },
  el: {
    // Navigation
    stops: "Στάσεις",
    lines: "Γραμμές",
    favorites: "Αγαπημένα",
    ticket: "Εισιτήριο",
    settings: "Ρυθμίσεις",

    // Common
    loading: "Φόρτωση...",
    noData: "Δεν υπάρχουν δεδομένα",
    error: "Προέκυψε σφάλμα",
    retry: "Επανάληψη",
    close: "Κλείσιμο",
    back: "Πίσω",
    tapForSchedule: "Πατήστε για πρόγραμμα",

    // Map/Stops
    athensBuses: "Λεωφορεία Αθήνας",
    stopDetails: "Λεπτομέρειες Στάσης",
    nearbyStops: "Κοντινές Στάσεις",
    liveArrivals: "Αφίξεις σε Πραγματικό Χρόνο",
    noArrivals: "Δεν υπάρχουν προγραμματισμένες αφίξεις",
    arriving: "Έρχεται",
    now: "Τώρα",
    alsoIn: "επίσης σε",
    busesComingFormat: "{count} λεωφορεί{plural} έρχ{plural2}",
    kmAway: "χλμ μακριά",
    busLinesAtStop: "Γραμμές σε αυτή τη στάση",
    noRoutesFound: "Δεν βρέθηκαν διαδρομές για αυτή τη στάση.",

    // Lines
    busLines: "Γραμμές Λεωφορείων",
    lineDetails: "Λεπτομέρειες Γραμμής",
    searchLines: "Αναζήτηση γραμμών ή διαδρομών...",
    routes: "Διαδρομές",
    direction: "Κατεύθυνση",
    schedule: "Πρόγραμμα",
    departure: "Αναχώρηση",
    returnTrip: "Επιστροφή",
    noSchedule: "Δεν υπάρχει διαθέσιμο πρόγραμμα",
    viewFullSchedule: "Δείτε το Πλήρες Πρόγραμμα",
    viewLineDetails: "Δείτε Λεπτομέρειες Γραμμής",
    noStopsFound: "Δεν βρέθηκαν στάσεις.",
    loadingSchedule: "Φόρτωση προγράμματος...",

    // Favorites
    noFavoritesYet: "Δεν έχετε αγαπημένα ακόμα",
    noFavoritesDescription:
      "Πατήστε το εικονίδιο καρδιάς για να προσθέσετε στάσεις ή γραμμές στα αγαπημένα σας",
    line: "Γραμμή",
    stop: "Στάση",

    // Settings
    appearance: "Εμφάνιση",
    darkMode: "Σκοτεινή Λειτουργία",
    lightMode: "Φωτεινή Λειτουργία",
    systemDefault: "Προεπιλογή Συστήματος",
    language: "Γλώσσα",
    about: "Σχετικά",
    developedBy: "Ανάπτυξη από",
    version: "Έκδοση",
    viewOnGithub: "Δείτε στο GitHub",

    // Ticket Scanner
    scanTicket: "Σαρώστε το Εισιτήριο",
    scanTicketDesc:
      "Ακουμπήστε το ATH.ENA εισιτήριο ή την κάρτα σας στο πίσω μέρος του τηλεφώνου για να διαβάσετε τις πληροφορίες.",
    ticketInfo: "Πληροφορίες Εισιτηρίου",
    ticketActive: "Ενεργό",
    ticketExpired: "Ληγμένο",
    tripsRemaining: "Υπόλοιπες Διαδρομές",
    unlimited: "Απεριόριστες",
    cardId: "Αριθμός Κάρτας",
    uid: "UID",
    cardType: "Τύπος Κάρτας",
    manufacturer: "Κατασκευαστής",
    cardCapacity: "Χωρητικότητα",
    productionDate: "Ημ/νία Κατασκευής",
    encryptedData: "Κρυπτογραφημένα Δεδομένα",
    userCategory: "Κατηγορία Χρήστη",
    activeProduct: "Ενεργό Προϊόν",
    expiredProduct: "Ληγμένο Προϊόν",
    expiryDate: "Λήξη Διαδρομής",
    loadDate: "Ημερομηνία Φόρτισης",
    timeRemaining: "απομένουν",
    tapToScanAgain: "Ακουμπήστε άλλο εισιτήριο για νέα σάρωση",
    nfcNotSupported: "Το NFC Δεν Υποστηρίζεται",
    nfcNotSupportedDesc:
      "Η συσκευή σας δεν υποστηρίζει NFC. Αυτή η λειτουργία απαιτεί συσκευή Android με NFC.",
    nfcDisabled: "Το NFC είναι Απενεργοποιημένο",
    nfcDisabledDesc:
      "Παρακαλώ ενεργοποιήστε το NFC στις ρυθμίσεις της συσκευής σας για να σαρώσετε εισιτήρια.",
    ticketReadError:
      "Δεν ήταν δυνατή η ανάγνωση του εισιτηρίου. Δοκιμάστε ξανά.",
    cardDetails: "Στοιχεία Κάρτας",
    ticketData: "Δεδομένα Εισιτηρίου",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  isGreek: boolean;
  /** Helper to get localized text - pass (englishText, greekText) */
  localize: (
    en: string | undefined | null,
    el: string | undefined | null,
  ) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

const LANGUAGE_STORAGE_KEY = "@app_language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved language preference
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved && ["en", "el"].includes(saved)) {
          setLanguageState(saved as Language);
        }
      } catch (e) {
        console.warn("Failed to load language preference:", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadLanguage();
  }, []);

  // Save language preference
  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (e) {
      console.warn("Failed to save language preference:", e);
    }
  };

  // Helper to get localized text
  const localize = (
    en: string | undefined | null,
    el: string | undefined | null,
  ): string => {
    if (language === "el") {
      return el || en || "";
    }
    return en || el || "";
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
    isGreek: language === "el",
    localize,
  };

  // Don't render until language is loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
