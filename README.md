# Athens Buses 🚌

A modern React Native mobile app for tracking Athens public transportation in real-time. Built with Expo and powered by the OASA Telematics API.

![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-blue)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-black)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🗺️ Interactive Map

- Real-time bus stop locations powered by MapLibre GL JS + MapTiler
- Google Maps-like styling with smooth vector tiles
- Dynamic stop loading as you pan the map
- Live bus positions with automatic updates
- Nearby stops cards for quick access

### 🚏 Stop Details

- Complete list of bus lines at each stop
- Real-time arrival predictions
- Timetable schedules with departure/return times
- Navigate to line details from any stop
- **Share stop** - Share stop location via native share sheet
- **Get directions** - Open Google Maps for walking directions to the stop

### 🚌 Bus Lines

- Searchable list of all Athens bus lines
- Route information with distance
- Full daily schedules for each line
- Stops list with distance from your location

### ⭐ Favorites

- Save your frequently used stops and lines
- Quick access from the Favorites tab

### 🎫 NFC Ticket Scanner

- Scan ATH.ENA transit cards using NFC
- View remaining trips on your card
- See user category (Student, Regular, etc.)
- Check active and expired products
- Works with MIFARE DESFire EV1 cards

### ⚙️ Settings

- **Dark/Light/System theme** - Persisted preference
- **Language switching** - English & Greek (Ελληνικά)
- All stop and route names display in selected language

## Tech Stack

- **Framework**: [Expo](https://expo.dev) (SDK 54)
- **Navigation**: [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routing)
- **State Management**: [TanStack Query](https://tanstack.com/query) (React Query)
- **UI Components**: Custom components with [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- **Maps**: [MapLibre GL JS](https://maplibre.org/) + [MapTiler](https://www.maptiler.com/) (Google Maps-like styling)
- **Storage**: AsyncStorage for preferences
- **NFC**: [react-native-nfc-manager](https://github.com/revtel/react-native-nfc-manager) for ATH.ENA card reading

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- Android Studio (for Android) or Xcode (for iOS)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/athanasso/OasaTelematics.git
   cd OasaTelematics
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your MapTiler API key:

   ```env
   EXPO_PUBLIC_MAPTILER_API_KEY=your_maptiler_api_key
   ```

   Get a free API key at [maptiler.com](https://www.maptiler.com/cloud/)

4. Start the development server:

   ```bash
   npx expo start
   ```

5. Run on a device/emulator:
   - Press `a` for Android
   - Press `i` for iOS
   - Scan QR code with Expo Go app

### Building for Production

```bash
# Create development build
npx expo run:android
npx expo run:ios

# Build APK/IPA
eas build --platform android
eas build --platform ios
```

## Project Structure

```text
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── index.tsx      # Stops/Map screen
│   │   ├── lines.tsx      # Bus Lines screen
│   │   ├── favorites.tsx  # Favorites screen
│   │   ├── ticket.tsx     # NFC Ticket Scanner
│   │   └── _layout.tsx    # Tab layout
│   ├── line/[lineCode].tsx    # Line details screen
│   ├── stop/[stopCode].tsx    # Stop details screen
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
│   ├── arrivals/          # Arrivals bottom sheet
│   ├── map/               # Map components
│   ├── schedule/          # Schedule modal
│   ├── settings/          # Settings modal
│   └── ui/                # UI primitives
├── contexts/              # React Context providers
│   ├── ThemeContext.tsx   # Dark/Light mode
│   └── LanguageContext.tsx # i18n translations
├── lib/                   # Utilities
│   ├── api.ts             # API client
│   ├── queries.ts         # TanStack Query hooks
│   └── types.ts           # TypeScript types
└── constants/             # Theme colors, config
```

## API

This app uses the [OASA Telematics API](https://telematics.oasa.gr/) to fetch:

- Bus stops and routes
- Real-time arrivals
- Live bus locations
- Daily schedules

## Screenshots

| Map Screen                     | Lines Screen          | Stop Details             |
| ------------------------------ | --------------------- | ------------------------ |
| Interactive map with bus stops | Searchable lines list | Live arrivals & schedule |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Author

Developed by [athanasso](https://github.com/athanasso)

---

Made with ❤️ in Athens, Greece
