import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

// NFC imports - conditionally loaded for native platforms
let NfcManager: any = null;
let NfcTech: any = null;
let NfcEvents: any = null;

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default;
    NfcTech = nfcModule.NfcTech;
    NfcEvents = nfcModule.NfcEvents;
  } catch {
    console.log("NFC module not available");
  }
}

interface TicketInfo {
  // Basic card info
  cardId: string;
  uid: string;

  // Card technical info
  cardType: string;
  cardKind: string; // "Plastic personalised" or "Plastic anonymous"
  manufacturer: string;
  capacity: string;
  productionDate: string;

  // Ticket info (may be unavailable if encrypted)
  tripsRemaining: number | "unlimited" | "encrypted";
  activeProducts: ProductInfo[];
  expiredProducts: ProductInfo[];
  unusedProducts: ProductInfo[];
  userCategory: string;
  isActive: boolean;
  remainingTimeSeconds: number;
  expiryDate: string | null;
  loadDate: string | null;
  cashBalance: number; // in euros

  // Legacy fields for compatibility
  activeProduct: ProductInfo | null;
  expiredProduct: ProductInfo | null;

  // Status flags
  isEncrypted: boolean;
  applicationId: string;
}

interface ProductInfo {
  name: string;
  fareType: string;
  status: "active" | "expired" | "unused";
  validUntil?: Date;
  trips?: number;
  productCode?: number;
}

// DESFire version data parser
function parseDESFireVersion(versionData: number[]): {
  cardType: string;
  manufacturer: string;
  capacity: string;
  productionDate: string;
} {
  let cardType = "DESFire";
  let manufacturer = "Unknown";
  let capacity = "Unknown";
  let productionDate = "";

  if (versionData.length >= 7) {
    // Hardware info
    const hwVendor = versionData[0];
    const hwType = versionData[1];
    const hwSubType = versionData[2];
    const hwMajor = versionData[3];
    const hwMinor = versionData[4];
    const hwStorageSize = versionData[5];

    // Manufacturer
    if (hwVendor === 0x04) {
      manufacturer = "NXP Semiconductors";
    }

    // Card type based on hw type and subtype
    if (hwType === 0x01) {
      if (hwSubType === 0x01) {
        cardType = `DESFire EV1`;
      } else if (hwSubType === 0x02) {
        cardType = `DESFire EV2`;
      } else if (hwSubType === 0x03) {
        cardType = `DESFire EV3`;
      } else {
        cardType = `DESFire (${hwMajor}.${hwMinor})`;
      }
    }

    // Storage size: 2^(storageSize/2) bytes
    const storagePower = hwStorageSize >> 1;
    const storageBytes = 1 << storagePower;
    if (storageBytes >= 1024) {
      capacity = `${storageBytes / 1024} KB`;
    } else {
      capacity = `${storageBytes} bytes`;
    }
  }

  // Production date (if we have full version data)
  if (versionData.length >= 28) {
    const prodWeek = versionData[26];
    const prodYear = versionData[27];
    if (prodWeek > 0 && prodWeek <= 53 && prodYear > 0) {
      const year = prodYear < 50 ? 2000 + prodYear : 1900 + prodYear;
      productionDate = `Week ${prodWeek}, ${year}`;
    }
  }

  return { cardType, manufacturer, capacity, productionDate };
}

// ATH.ENA User category codes (per protocol specification)
// 0x00, 0x01, 0x30: Adult (Standard)
// 0x10: Student
// 0x20: Senior (65+)
// 0x40: Child
// 0x50: Disabled
// 0x60: Military
// 0x70: Unemployed
// 0x80: University Student
const USER_CATEGORIES: { [key: number]: string } = {
  0x00: "Adult",
  0x01: "Adult",
  0x10: "Student",
  0x20: "Senior (65+)",
  0x30: "Adult",
  0x40: "Child",
  0x50: "Disabled",
  0x60: "Military",
  0x70: "Unemployed",
  0x80: "University Student",
};

// ATH.ENA Product/Fare type codes (bytes 4-5 of product record)
// These determine the product name and fare type shown
const PRODUCT_CODES: { [key: number]: { name: string; fareType: string } } = {
  // Count-based products
  0x0134: { name: "trips", fareType: "REDUCED FARE" }, // 308 - Student/reduced trips
  0x013c: { name: "trips", fareType: "REDUCED FARE" }, // 316 - Student/reduced trips (variant)
  0x0140: { name: "trips", fareType: "" }, // 320 - Standard trips
  0x0148: { name: "trips", fareType: "" }, // 328 - Standard trips

  // Monthly/period passes
  0x025a: { name: "MONTHLY", fareType: "AIRPORT" }, // 602 - Airport monthly
  0x0258: { name: "MONTHLY", fareType: "" }, // 600 - Standard monthly
  0x0260: { name: "MONTHLY", fareType: "" }, // 608 - Monthly variant
  0x0270: { name: "WEEKLY", fareType: "" }, // 624 - Weekly pass
  0x0280: { name: "DAILY", fareType: "" }, // 640 - Daily pass
};

// Get product info from product code
function getProductInfo(
  productCode: number,
  productType: number,
  tripCount: number,
): { name: string; fareType: string } {
  const known = PRODUCT_CODES[productCode];
  if (known) {
    // For count-based products, prepend the trip count
    if (productType === 0x32 && tripCount > 0) {
      return {
        name: `${tripCount} ${known.name}`,
        fareType: known.fareType,
      };
    }
    return known;
  }

  // Fallback based on product type
  if (productType === 0x31) {
    return { name: "MONTHLY", fareType: "" };
  } else if (productType === 0x32) {
    return { name: `${tripCount} trips`, fareType: "" };
  }
  return { name: "Unknown", fareType: "" };
}

// ATH.ENA Ticket data parser
function parseAthenaTicketData(
  data: number[],
  tagId?: string,
  desfireInfo?: {
    cardType: string;
    manufacturer: string;
    capacity: string;
    productionDate: string;
  },
  applicationId?: string,
  isEncrypted?: boolean,
  fileData?: { [fileId: number]: number[] },
): TicketInfo {
  console.log("=== parseAthenaTicketData called ===");
  console.log("Parsing ticket data, length:", data.length);
  console.log("tagId:", tagId);
  console.log("isEncrypted:", isEncrypted);

  if (fileData) {
    console.log(
      "File data available, file IDs:",
      Object.keys(fileData).join(", "),
    );
    Object.entries(fileData).forEach(([id, bytes]) => {
      console.log(
        `  File ${id} (${bytes.length} bytes): ${bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
      );
    });
  } else {
    console.log("NO fileData provided!");
  }

  // Use provided DESFire info or defaults
  const versionInfo = desfireInfo || {
    cardType: "Unknown",
    manufacturer: "Unknown",
    capacity: "Unknown",
    productionDate: "",
  };

  const uid = tagId || "";
  let cardId = uid;
  let cardKind = "Unknown"; // Will be set to "Plastic personalised" or "Plastic anonymous"
  let tripsRemaining: number | "unlimited" | "encrypted" = isEncrypted
    ? "encrypted"
    : 0;
  let userCategory = "Unknown";
  const activeProducts: ProductInfo[] = [];
  const expiredProducts: ProductInfo[] = [];
  const unusedProducts: ProductInfo[] = [];
  let isActive = false;
  let remainingTimeSeconds = 0;
  let expiryDate: string | null = null;
  let loadDate: string | null = null;
  let cashBalance = 0;
  let lastValidationTimestamp: number | null = null;

  if (fileData && !isEncrypted) {
    // === PARSE FILE 02: Card Identity - Base User Category & Card Serial Number ===
    // Per ATH.ENA Protocol Specification:
    // - Card Number: Bytes 12-16 are BCD (Binary Coded Decimal) suffix
    // - Prefix: Always prepend "3001 0100"
    // - User Category: Byte 9 contains the base category
    const file2 = fileData[2];
    if (file2 && file2.length >= 17) {
      // Card ID construction: The BCD suffix is 4 bytes starting at index 13
      // Example: If bytes 13-16 are [02, 16, 39, 54] -> ID: "3001 0100 0216 3954"
      // Note: slice(13, 17) gives indices 13, 14, 15, 16 = 4 bytes = 8 hex chars
      const cardSuffix = file2.slice(13, 17);
      const suffixHex = cardSuffix
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      // Prepend the fixed ATH.ENA card prefix (8 chars) + suffix (8 chars) = 16 chars
      const fullCardNum = "30010100" + suffixHex;
      // Format as: 3001 0100 XXXX XXXX (groups of 4)
      cardId = fullCardNum
        .toUpperCase()
        .replace(/(.{4})/g, "$1 ")
        .trim();
      console.log(`Parsed Card ID (BCD format): ${cardId}`);

      // Base User Category from Byte 9 of File 02
      const baseCategoryByte = file2[9];
      userCategory = USER_CATEGORIES[baseCategoryByte] || "Unknown";
      console.log(
        `Base User Category (File 02, Byte 9): 0x${baseCategoryByte.toString(16)} -> ${userCategory}`,
      );
    }

    // === PARSE FILE 04: Personalization - "PKP" vs "ZLZ" flags ===
    // Per ATH.ENA Protocol Specification:
    // - Bytes 4-6: Type code string ("PKP" = Personalized, "ZLZ" = Anonymous)
    // - Override Check: If "PKP" and Byte 9 is non-zero, override base category
    const file4 = fileData[4];
    if (file4 && file4.length >= 10) {
      const typeCode = String.fromCharCode(file4[4], file4[5], file4[6]);
      console.log(`Card personalization code (File 04, Bytes 4-6): "${typeCode}"`);

      // Set card kind based on personalization
      if (typeCode === "PKP") {
        cardKind = "Plastic personalised";
        // PKP = Personalized card - check for category override
        const overrideCategory = file4[9];
        if (overrideCategory !== 0) {
          const overrideCat = USER_CATEGORIES[overrideCategory];
          if (overrideCat) {
            userCategory = overrideCat;
            console.log(
              `Personalized category override (File 04, Byte 9): 0x${overrideCategory.toString(16)} -> ${userCategory}`,
            );
          }
        }
      } else if (typeCode === "ZLZ") {
        cardKind = "Plastic anonymous";
        console.log("Anonymous card detected (ZLZ)");
      } else {
        // Unknown type, default to personalised display
        cardKind = "Plastic personalised";
      }
    }

    // === PARSE FILE 12: Remaining trips (value file) ===
    const file12 = fileData[12];
    console.log(
      `File 12 data: ${file12 ? file12.map((b) => b.toString(16).padStart(2, "0")).join(" ") : "not found"}`,
    );
    if (file12 && file12.length >= 4) {
      // Parse as unsigned 32-bit little endian
      const trips =
        (file12[0] & 0xff) |
        ((file12[1] & 0xff) << 8) |
        ((file12[2] & 0xff) << 16) |
        ((file12[3] & 0xff) << 24);
      tripsRemaining = trips >>> 0; // Ensure unsigned
      console.log(
        `Remaining trips from File 12: ${tripsRemaining} (raw bytes: ${file12[0]}, ${file12[1]}, ${file12[2]}, ${file12[3]})`,
      );
    }

    // === PARSE FILE 5: Cash balance (value file) ===
    const file5 = fileData[5];
    if (file5 && file5.length >= 4) {
      const balanceRaw =
        (file5[0] & 0xff) |
        ((file5[1] & 0xff) << 8) |
        ((file5[2] & 0xff) << 16) |
        ((file5[3] & 0xff) << 24);
      cashBalance = (balanceRaw >>> 0) / 100; // Convert cents to euros
      console.log(`Cash balance: ${cashBalance}€`);
    }

    // === PARSE FILE 06: Event Log (Cyclic Records) - Last Validation Heuristic ===
    // Per ATH.ENA Protocol Specification:
    // - Heuristic Scan: Scan 4-byte windows for integers between 1704067200 (Jan 1 2024) and 1798761600 (Jan 1 2027)
    // - The LARGEST value found is the "Last Validation" timestamp
    const file6 = fileData[6];
    // Timestamp range constants per protocol spec
    const TIMESTAMP_MIN = 1704067200; // Jan 1, 2024 00:00:00 UTC
    const TIMESTAMP_MAX = 1798761600; // Jan 1, 2027 00:00:00 UTC

    if (file6 && file6.length >= 4) {
      console.log(
        `File 06 (Event Log): ${file6.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
      );

      console.log(`\n=== HEURISTIC SCAN FILE 06 FOR TIMESTAMPS ===`);
      console.log(`Scanning for Unix timestamps in range [${TIMESTAMP_MIN}, ${TIMESTAMP_MAX}]`);

      for (let pos = 0; pos <= file6.length - 4; pos++) {
        const bytes = file6.slice(pos, pos + 4);
        const valLE =
          (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>>
          0;

        // Check if value falls within the valid timestamp range (as per protocol spec)
        if (valLE >= TIMESTAMP_MIN && valLE < TIMESTAMP_MAX) {
          const dateStr = new Date(valLE * 1000).toISOString();
          console.log(
            `  Found timestamp at pos ${pos}: ${valLE} = ${dateStr}`,
          );
          // Per spec: largest value found is the "Last Validation"
          if (!lastValidationTimestamp || valLE > lastValidationTimestamp) {
            lastValidationTimestamp = valLE;
          }
        }
      }

      if (lastValidationTimestamp) {
        console.log(
          `Last Validation (largest timestamp): ${new Date(lastValidationTimestamp * 1000).toISOString()}`,
        );
      } else {
        console.log(`No timestamps found in valid range`);
      }
      console.log(`=== END HEURISTIC SCAN ===\n`);
    }

    // === PARSE FILE 16: Product Slots (Linear Record File) ===
    // Per ATH.ENA Protocol Specification:
    // - Slot Structure: Each slot is 32 bytes
    // - Product Code: Bytes 4-5 (Little Endian)
    // - Status Logic:
    //   * Active: Slot 0 is occupied AND (Current Time < Calculated Expiry)
    //   * Expired: Expiry time has passed
    //   * Unused: Trip count > 0 but no validation timestamp exists in range
    // - Validity Duration:
    //   * Count-based tickets: Last Validation + 90 minutes (5400 seconds)
    //   * Airport Monthly: Load Date + 10 days
    //   * Standard Monthly: End of the calendar month of the Load Date
    const file16 = fileData[16];
    
    // Validity duration constants (in seconds)
    const VALIDITY_COUNT_BASED = 5400; // 90 minutes per protocol spec
    const VALIDITY_AIRPORT_DAYS = 10; // 10 days for airport monthly
    
    if (file16 && file16.length >= 32) {
      console.log(`\n=== PARSING FILE 16: PRODUCT SLOTS ===`);

      const now = Math.floor(Date.now() / 1000);

      // Parse each product slot (32 bytes each)
      const numProducts = Math.min(Math.floor(file16.length / 32), 4);

      for (let slotIndex = 0; slotIndex < numProducts; slotIndex++) {
        const offset = slotIndex * 32;
        const productBytes = file16.slice(offset, offset + 32);

        // Skip empty product slots (all zeros or 0xFF status)
        if (productBytes[0] === 0xff || productBytes.every((b) => b === 0)) {
          console.log(`Slot ${slotIndex}: Empty (skipping)`);
          continue;
        }

        console.log(
          `Slot ${slotIndex}: ${productBytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
        );

        const productType = productBytes[1];
        // Product Code: Bytes 4-5, Little Endian (per spec)
        const productCode = (productBytes[4] | (productBytes[5] << 8)) >>> 0;
        const tripCount = productBytes[16];

        console.log(
          `  Type: 0x${productType.toString(16)}, Code: 0x${productCode.toString(16).padStart(4, "0")} (${productCode}), Trips: ${tripCount}`,
        );

        // Get product name and fare type from product code lookup table
        const prodInfo = getProductInfo(productCode, productType, tripCount);

        // Determine product type classification
        const isMonthlyPass = productType === 0x31;
        const isCountBased = productType === 0x32;

        // Parse timestamps and calculate expiry
        let productLoadDate: string | null = null;
        let productExpiryDate: string | null = null;
        let productValidUntil: Date | undefined = undefined;
        let calculatedExpiry: number | null = null;

        if (isMonthlyPass) {
          // Monthly/Period passes - parse load timestamp from bytes 6-9
          const bytes6to9 = productBytes.slice(6, 10);
          const loadTimestampLE =
            (bytes6to9[0] |
              (bytes6to9[1] << 8) |
              (bytes6to9[2] << 16) |
              (bytes6to9[3] << 24)) >>>
            0;

          console.log(
            `  Monthly pass bytes 6-9: ${bytes6to9.map((b) => b.toString(16).padStart(2, "0")).join(" ")} = ${loadTimestampLE}`,
          );

          // Determine reference timestamp (load date)
          let refTimestamp: number | null = null;
          if (loadTimestampLE >= TIMESTAMP_MIN && loadTimestampLE < TIMESTAMP_MAX) {
            refTimestamp = loadTimestampLE;
            console.log(`  Load timestamp (File 16): ${new Date(refTimestamp * 1000).toISOString()}`);
          } else if (lastValidationTimestamp) {
            // Fall back to last validation from File 06
            refTimestamp = lastValidationTimestamp;
            console.log(`  Using File 06 validation as reference: ${new Date(refTimestamp * 1000).toISOString()}`);
          }

          if (refTimestamp) {
            productLoadDate = formatTimestamp(refTimestamp);

            // Calculate expiry based on product code
            if (productCode === 0x025a) {
              // Airport Monthly: Load Date + 10 days (per spec)
              const expiryUnix = refTimestamp + VALIDITY_AIRPORT_DAYS * 24 * 60 * 60;
              const expiryDateObj = new Date(expiryUnix * 1000);
              expiryDateObj.setHours(23, 59, 59, 0); // End of day
              calculatedExpiry = Math.floor(expiryDateObj.getTime() / 1000);
              console.log(`  Airport Monthly expiry (Load + ${VALIDITY_AIRPORT_DAYS} days): ${expiryDateObj.toISOString()}`);
            } else {
              // Standard Monthly: End of the calendar month of the Load Date (per spec)
              const loadDateObj = new Date(refTimestamp * 1000);
              const endOfMonth = new Date(
                loadDateObj.getFullYear(),
                loadDateObj.getMonth() + 1,
                0, // Day 0 of next month = last day of current month
                23,
                59,
                59,
              );
              calculatedExpiry = Math.floor(endOfMonth.getTime() / 1000);
              console.log(`  Monthly expiry (end of month): ${endOfMonth.toISOString()}`);
            }

            if (calculatedExpiry) {
              productExpiryDate = formatTimestamp(calculatedExpiry);
              productValidUntil = new Date(calculatedExpiry * 1000);
            }
          }

          // Monthly passes have unlimited trips
          if (slotIndex === 0) {
            tripsRemaining = "unlimited";
          }
        } else if (isCountBased) {
          // Count-based product
          // For count-based: Expiry = Last Validation + 90 minutes (5400 seconds) per spec
          console.log(`  Count-based product`);

          if (lastValidationTimestamp) {
            calculatedExpiry = lastValidationTimestamp + VALIDITY_COUNT_BASED;
            productExpiryDate = formatTimestamp(calculatedExpiry);
            productValidUntil = new Date(calculatedExpiry * 1000);
            console.log(`  Expiry (Last Validation + ${VALIDITY_COUNT_BASED / 60} min): ${new Date(calculatedExpiry * 1000).toISOString()}`);
          }
        }

        // Create product info object
        const product: ProductInfo = {
          name: prodInfo.name,
          fareType: prodInfo.fareType,
          status: "unused", // Default, will be determined below
          validUntil: productValidUntil,
          trips: isMonthlyPass ? undefined : tripCount,
          productCode: productCode,
        };

        // Determine product status per ATH.ENA Protocol Specification:
        // - Active: Slot 0 is occupied AND (Current Time < Calculated Expiry)
        // - Expired: Expiry time has passed
        // - Unused: Trip count > 0 but no validation timestamp exists in range
        if (slotIndex === 0) {
          // Slot 0 (primary product)
          if (calculatedExpiry && now < calculatedExpiry) {
            // Active: Slot 0 occupied AND current time < expiry
            product.status = "active";
            activeProducts.push(product);
            isActive = true;
            remainingTimeSeconds = calculatedExpiry - now;
            expiryDate = productExpiryDate;
            loadDate = productLoadDate;
          } else if (calculatedExpiry) {
            // Expired: Expiry time has passed
            product.status = "expired";
            expiredProducts.push(product);
            expiryDate = productExpiryDate;
            loadDate = productLoadDate;
          } else if (isCountBased && tripCount > 0 && !lastValidationTimestamp) {
            // Unused: Trip count > 0 but no validation timestamp exists
            product.status = "unused";
            unusedProducts.push(product);
          } else {
            // Default to active for display purposes
            product.status = "active";
            activeProducts.push(product);
          }
        } else {
          // Secondary product slots
          if (calculatedExpiry && now < calculatedExpiry) {
            // Still active (rare case - multiple active products)
            product.status = "active";
            activeProducts.push(product);
          } else if (calculatedExpiry) {
            // Expired
            product.status = "expired";
            expiredProducts.push(product);
          } else if (isCountBased && tripCount > 0) {
            // Has trips but no activation timestamp = unused
            product.status = "unused";
            unusedProducts.push(product);
          } else if (isMonthlyPass) {
            // Monthly pass in secondary slot
            const bytes6to9 = productBytes.slice(6, 10);
            const val6_9_LE =
              (bytes6to9[0] |
                (bytes6to9[1] << 8) |
                (bytes6to9[2] << 16) |
                (bytes6to9[3] << 24)) >>>
              0;
            // Check if it has been activated (has valid timestamp)
            if (val6_9_LE >= TIMESTAMP_MIN && val6_9_LE < TIMESTAMP_MAX) {
              product.status = "expired";
              expiredProducts.push(product);
            } else {
              product.status = "unused";
              unusedProducts.push(product);
            }
          }
        }

        console.log(
          `  -> Status: ${product.status.toUpperCase()} | ${product.name} ${product.fareType ? `(${product.fareType})` : ""}`,
        );
      }

      console.log(`=== END PRODUCT SLOTS ===\n`);
    }
  }

  // Legacy: Set activeProduct and expiredProduct for backward compatibility
  const activeProduct = activeProducts.length > 0 ? activeProducts[0] : null;
  const expiredProduct = expiredProducts.length > 0 ? expiredProducts[0] : null;

  const result: TicketInfo = {
    cardId,
    uid,
    cardType: versionInfo.cardType,
    cardKind,
    manufacturer: versionInfo.manufacturer,
    capacity: versionInfo.capacity,
    productionDate: versionInfo.productionDate,
    tripsRemaining,
    activeProducts,
    expiredProducts,
    unusedProducts,
    activeProduct,
    expiredProduct,
    userCategory,
    isActive,
    remainingTimeSeconds,
    expiryDate,
    loadDate,
    cashBalance,
    isEncrypted: isEncrypted || false,
    applicationId: applicationId || "",
  };

  return result;
}

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "00:00";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export default function TicketScreen() {
  const { theme: colorScheme } = useTheme();
  const { t } = useLanguage();
  const colors = Colors[colorScheme];

  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [nfcEnabled, setNfcEnabled] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isReading, setIsReading] = useState(false); // True when actively reading card data
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(0);

  const checkNfcStatus = React.useCallback(async () => {
    if (Platform.OS === "web") {
      setNfcSupported(false);
      return;
    }

    if (!NfcManager) {
      setNfcSupported(false);
      return;
    }

    try {
      const supported = await NfcManager.isSupported();
      setNfcSupported(supported);

      if (supported) {
        await NfcManager.start();
        const enabled = await NfcManager.isEnabled();
        setNfcEnabled(enabled);
      }
    } catch (e) {
      console.error("NFC check error:", e);
      setNfcSupported(false);
    }
  }, []);

  // Check NFC support on mount and whenever app state changes
  useEffect(() => {
    checkNfcStatus();

    // Listener for NFC State changes (on/off)
    if (NfcManager && NfcEvents) {
      NfcManager.setEventListener(NfcEvents.StateChanged, () => {
        checkNfcStatus();
      });
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkNfcStatus();
      }
    });

    // Cleanup subscription
    return () => {
      subscription.remove();
      if (NfcManager) {
        if (NfcEvents) {
          NfcManager.setEventListener(NfcEvents.StateChanged, null);
        }
        NfcManager.cancelTechnologyRequest().catch(() => {});
      }
    };
  }, [checkNfcStatus]);

  // Also check when the screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      checkNfcStatus();
    }, [checkNfcStatus])
  );

  // Countdown timer for active tickets
  useEffect(() => {
    if (ticketInfo?.isActive && ticketInfo.remainingTimeSeconds > 0) {
      setRemainingTime(ticketInfo.remainingTimeSeconds);

      const interval = setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [ticketInfo]);

  // Start NFC scanning
  useEffect(() => {
    if (!nfcSupported || !nfcEnabled || Platform.OS === "web") return;

    let isMounted = true;
    let scanTimeout: ReturnType<typeof setTimeout> | null = null;

    const readWithIsoDep = async (
      tag: any,
      pages: number[],
      alreadyConnected: boolean = false,
    ): Promise<{
      versionData: number[];
      applicationId: string;
      isEncrypted: boolean;
      fileData: { [fileId: number]: number[] };
    }> => {
      console.log("=".repeat(50));
      console.log("STARTING ISODEP READ");
      console.log("=".repeat(50));
      console.log("Tag info:", JSON.stringify(tag, null, 2));

      let versionData: number[] = [];
      let applicationId = "";
      let isEncrypted = false;
      const fileData: { [fileId: number]: number[] } = {};

      // Only request IsoDep if not already connected
      if (!alreadyConnected) {
        await NfcManager.cancelTechnologyRequest().catch(() => {});
        await NfcManager.requestTechnology(NfcTech.IsoDep);
      }

      const tryCommand = async (name: string, apdu: number[]) => {
        try {
          console.log(
            `\n[${name}] Sending: ${apdu.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
          );
          const resp = await NfcManager.isoDepHandler.transceive(apdu);
          console.log(
            `[${name}] Response: ${resp ? resp.map((b: number) => b.toString(16).padStart(2, "0")).join(" ") : "null"}`,
          );
          if (resp && resp.length > 0) {
            // Check status bytes (last 2 bytes)
            const sw1 = resp[resp.length - 2];
            const sw2 = resp[resp.length - 1];
            console.log(
              `[${name}] Status: ${sw1?.toString(16).padStart(2, "0")} ${sw2?.toString(16).padStart(2, "0")}`,
            );
            // ISO7816 success
            if (sw1 === 0x90 && sw2 === 0x00) {
              console.log(`[${name}] SUCCESS (ISO7816)!`);
              pages.push(...resp.slice(0, -2)); // Add data without status bytes
              return resp;
            }
            // DESFire success (91 00)
            if (sw1 === 0x91 && sw2 === 0x00) {
              console.log(`[${name}] SUCCESS (DESFire)!`);
              return resp;
            }
            // DESFire more frames available (91 AF)
            if (sw1 === 0x91 && sw2 === 0xaf) {
              console.log(`[${name}] DESFire: More frames available`);
              return resp;
            }
            // ISO7816 more data available
            if (sw1 === 0x61) {
              console.log(`[${name}] More data available: ${sw2} bytes`);
              return resp;
            }
            // Return response anyway for other status codes so caller can handle
            return resp;
          }
          return null;
        } catch (e: any) {
          console.log(`[${name}] Error: ${e?.message || e}`);
          return null;
        }
      };

      try {
        // 1. Try SELECT with different AIDs
        console.log("\n--- SELECTING APPLICATIONS ---");

        // Calypso AID (European transit)
        await tryCommand(
          "SELECT Calypso",
          [
            0x00, 0xa4, 0x04, 0x00, 0x0a, 0xa0, 0x00, 0x00, 0x04, 0x04, 0x01,
            0x25, 0x09, 0x01, 0x01,
          ],
        );

        // Intercode AID (French transit)
        await tryCommand(
          "SELECT Intercode",
          [
            0x00, 0xa4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2e, 0x49,
            0x43, 0x41,
          ],
        );

        // Generic transit AID
        await tryCommand(
          "SELECT Transit",
          [
            0x00, 0xa4, 0x04, 0x00, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10,
            0x10,
          ],
        );

        // Master File
        await tryCommand(
          "SELECT MF",
          [0x00, 0xa4, 0x00, 0x00, 0x02, 0x3f, 0x00],
        );

        // ============================================
        // MIFARE DESFire COMMANDS (this card is DESFire!)
        // ============================================
        console.log("\n--- DESFIRE FULL READ ---");

        // DESFire native commands wrapped in ISO 7816-4
        // Command structure: 90 [CMD] 00 00 [Lc] [Data...] 00

        // GetVersion - Part 1
        let resp = await tryCommand(
          "DESFire GetVersion (Part 1)",
          [0x90, 0x60, 0x00, 0x00, 0x00],
        );
        if (resp) {
          const sw1 = resp[resp.length - 2];
          const sw2 = resp[resp.length - 1];
          versionData.push(...resp.slice(0, -2));

          // If status is 91 AF, continue with additional frame
          if (sw1 === 0x91 && sw2 === 0xaf) {
            resp = await tryCommand(
              "DESFire GetVersion (Part 2)",
              [0x90, 0xaf, 0x00, 0x00, 0x00],
            );
            if (resp) {
              versionData.push(...resp.slice(0, -2));
              const sw1b = resp[resp.length - 2];
              const sw2b = resp[resp.length - 1];
              if (sw1b === 0x91 && sw2b === 0xaf) {
                resp = await tryCommand(
                  "DESFire GetVersion (Part 3)",
                  [0x90, 0xaf, 0x00, 0x00, 0x00],
                );
                if (resp) {
                  versionData.push(...resp.slice(0, -2));
                }
              }
            }
          }
        }

        if (versionData.length > 0) {
          console.log("\n*** DESFIRE VERSION DATA ***");
          console.log(
            "Full version:",
            versionData.map((b) => b.toString(16).padStart(2, "0")).join(" "),
          );

          // Parse version info
          if (versionData.length >= 7) {
            const hwVendor = versionData[0];
            const hwType = versionData[1];
            const hwSubType = versionData[2];
            const hwMajor = versionData[3];
            const hwMinor = versionData[4];
            const hwStorageSize = versionData[5];
            const hwProtocol = versionData[6];

            console.log(
              `Hardware: Vendor=${hwVendor === 0x04 ? "NXP" : hwVendor}, Type=${hwType}, SubType=${hwSubType}`,
            );
            console.log(
              `HW Version: ${hwMajor}.${hwMinor}, Storage: ${1 << (hwStorageSize >> 1)} bytes, Protocol: ${hwProtocol}`,
            );
          }
          if (versionData.length >= 14) {
            const swVendor = versionData[7];
            const swType = versionData[8];
            const swSubType = versionData[9];
            const swMajor = versionData[10];
            const swMinor = versionData[11];
            const swStorageSize = versionData[12];
            const swProtocol = versionData[13];

            console.log(
              `Software: Vendor=${swVendor === 0x04 ? "NXP" : swVendor}, Type=${swType}, SubType=${swSubType}`,
            );
            console.log(
              `SW Version: ${swMajor}.${swMinor}, Storage: ${1 << (swStorageSize >> 1)} bytes, Protocol: ${swProtocol}`,
            );
          }
          if (versionData.length >= 21) {
            const uid = versionData.slice(14, 21);
            console.log(
              `Card UID: ${uid.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
            );
          }
          if (versionData.length >= 26) {
            const batchNo = versionData.slice(21, 26);
            console.log(
              `Batch No: ${batchNo.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
            );
          }
          if (versionData.length >= 28) {
            const prodWeek = versionData[26];
            const prodYear = versionData[27];
            console.log(
              `Production: Week ${prodWeek}, Year 20${prodYear < 50 ? prodYear : prodYear - 100}`,
            );
          }

          pages.push(...versionData);
        }

        // Get Card UID (more reliable method)
        await tryCommand("DESFire GetCardUID", [0x90, 0x51, 0x00, 0x00, 0x00]);

        // Get Key Settings for PICC (master application)
        await tryCommand(
          "DESFire GetKeySettings",
          [0x90, 0x45, 0x00, 0x00, 0x00],
        );

        // Get Free Memory
        await tryCommand("DESFire FreeMem", [0x90, 0x6e, 0x00, 0x00, 0x00]);

        // Get Application IDs - lists all apps on the card
        console.log("\n--- DESFIRE APPLICATION IDs ---");
        let appIds: number[][] = [];
        resp = await tryCommand(
          "DESFire GetApplicationIDs",
          [0x90, 0x6a, 0x00, 0x00, 0x00],
        );
        // Note: For DESFire, success status is 91 00, not 90 00
        // tryCommand might not return the data, so let's do a direct transceive
        try {
          const appIdResp = await NfcManager.isoDepHandler.transceive([
            0x90, 0x6a, 0x00, 0x00, 0x00,
          ]);
          console.log(
            "GetApplicationIDs raw response:",
            appIdResp
              ?.map((b: number) => b.toString(16).padStart(2, "0"))
              .join(" "),
          );

          if (appIdResp && appIdResp.length > 2) {
            const sw1 = appIdResp[appIdResp.length - 2];
            const sw2 = appIdResp[appIdResp.length - 1];

            if (sw1 === 0x91 && sw2 === 0x00) {
              // Parse AIDs (3 bytes each)
              const data = appIdResp.slice(0, -2);
              console.log(
                "Application data bytes:",
                data
                  ?.map((b: number) => b.toString(16).padStart(2, "0"))
                  .join(" "),
              );

              for (let i = 0; i < data.length; i += 3) {
                if (i + 3 <= data.length) {
                  const aid = [data[i], data[i + 1], data[i + 2]];
                  appIds.push(aid);
                  // DESFire stores AIDs in little-endian, so reverse for display
                  const aidStr = aid
                    .map((b: number) => b.toString(16).padStart(2, "0"))
                    .join("");
                  const aidAscii = String.fromCharCode(
                    ...aid.filter((b: number) => b >= 32 && b < 127),
                  );
                  console.log(
                    `*** Found Application AID: ${aidStr} (ASCII: "${aidAscii}") ***`,
                  );

                  // Store first application ID found (ATH.ENA uses "1TA" = 0x315441)
                  if (!applicationId) {
                    applicationId = aidAscii || aidStr;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log("Error getting app IDs:", e);
        }

        // Try to select and read each application
        for (const aid of appIds) {
          console.log(
            `\n--- Selecting Application ${aid.map((b) => b.toString(16).padStart(2, "0")).join("")} ---`,
          );

          // Select Application
          const selectApp = await tryCommand(
            `DESFire SelectApp ${aid.map((b) => b.toString(16)).join("")}`,
            [0x90, 0x5a, 0x00, 0x00, 0x03, ...aid, 0x00],
          );

          if (selectApp) {
            const sw1 = selectApp[selectApp.length - 2];
            const sw2 = selectApp[selectApp.length - 1];

            // Check if we got authentication error (91 CA)
            if (sw1 === 0x91 && sw2 === 0xca) {
              console.log(
                "Application requires authentication - data is encrypted",
              );
              isEncrypted = true;
            }

            if (sw1 === 0x91 && sw2 === 0x00) {
              console.log("Application selected successfully!");

              // Get File IDs in this application
              const fileIdsResp = await tryCommand(
                "DESFire GetFileIDs",
                [0x90, 0x6f, 0x00, 0x00, 0x00],
              );
              if (fileIdsResp && fileIdsResp.length > 2) {
                const fSw1 = fileIdsResp[fileIdsResp.length - 2];
                const fSw2 = fileIdsResp[fileIdsResp.length - 1];
                if (fSw1 === 0x91 && fSw2 === 0x00) {
                  const fileIds = fileIdsResp.slice(0, -2);
                  console.log(`Files in app: ${fileIds.join(", ")}`);

                  // Try to read each file
                  for (const fileId of fileIds) {
                    // Get file settings first
                    const settingsResp = await tryCommand(
                      `DESFire GetFileSettings ${fileId}`,
                      [0x90, 0xf5, 0x00, 0x00, 0x01, fileId, 0x00],
                    );

                    // Parse file settings to determine file type
                    let fileType = 0; // 0=Standard, 1=Backup, 2=Value, 3=Linear, 4=Cyclic
                    if (settingsResp && settingsResp.length > 2) {
                      const sSw1 = settingsResp[settingsResp.length - 2];
                      const sSw2 = settingsResp[settingsResp.length - 1];
                      if (sSw1 === 0x91 && sSw2 === 0x00) {
                        fileType = settingsResp[0];
                        console.log(
                          `File ${fileId} type: ${fileType} (0=Std, 1=Backup, 2=Value, 3=Linear, 4=Cyclic)`,
                        );
                      }
                    }

                    // Try to read file based on type
                    if (fileType === 2) {
                      // Value file - use GetValue command
                      const valueResp = await tryCommand(
                        `DESFire GetValue ${fileId}`,
                        [0x90, 0x6c, 0x00, 0x00, 0x01, fileId, 0x00],
                      );
                      if (valueResp && valueResp.length > 2) {
                        const vSw1 = valueResp[valueResp.length - 2];
                        const vSw2 = valueResp[valueResp.length - 1];
                        if (vSw1 === 0x91 && vSw2 === 0x00) {
                          const valueBytes = valueResp.slice(0, -2);
                          fileData[fileId] = valueBytes;
                          console.log(
                            `File ${fileId} value: ${valueBytes.map((b: number) => b.toString(16).padStart(2, "0")).join(" ")}`,
                          );
                          // Parse as signed 32-bit little endian
                          if (valueBytes.length >= 4) {
                            const value =
                              valueBytes[0] |
                              (valueBytes[1] << 8) |
                              (valueBytes[2] << 16) |
                              (valueBytes[3] << 24);
                            console.log(
                              `File ${fileId} value (decimal): ${value}`,
                            );
                          }
                        } else {
                          // Check for encryption status codes per ATH.ENA Protocol:
                          // 0x91 0xAE = Authentication Error
                          // 0x91 0xCA = Command Aborted (authentication required)
                          if (vSw1 === 0x91 && (vSw2 === 0xae || vSw2 === 0xca)) {
                            console.log(
                              `File ${fileId}: Authentication required (encrypted)`,
                            );
                            isEncrypted = true;
                          } else {
                            console.log(
                              `File ${fileId} GetValue failed with status: ${vSw1.toString(16)} ${vSw2.toString(16)}`,
                            );
                          }
                        }
                      } else {
                        console.log(
                          `File ${fileId} GetValue returned null or too short`,
                        );
                      }
                    } else if (fileType === 3 || fileType === 4) {
                      // Record file - use ReadRecords
                      const recordResp = await tryCommand(
                        `DESFire ReadRecords ${fileId}`,
                        [
                          0x90,
                          0xbb,
                          0x00,
                          0x00,
                          0x07,
                          fileId,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                        ],
                      );
                      if (recordResp && recordResp.length > 2) {
                        const rcSw1 = recordResp[recordResp.length - 2];
                        const rcSw2 = recordResp[recordResp.length - 1];
                        if (
                          rcSw1 === 0x91 &&
                          (rcSw2 === 0x00 || rcSw2 === 0xaf)
                        ) {
                          const recordBytes = recordResp.slice(0, -2);
                          fileData[fileId] = recordBytes;
                          console.log(
                            `File ${fileId} records: ${recordBytes.map((b: number) => b.toString(16).padStart(2, "0")).join(" ")}`,
                          );
                        } else if (rcSw1 === 0x91 && (rcSw2 === 0xae || rcSw2 === 0xca)) {
                          // Per ATH.ENA Protocol: 0x91 0xAE or 0x91 0xCA = encrypted
                          console.log(
                            `File ${fileId}: Authentication required (encrypted)`,
                          );
                          isEncrypted = true;
                        }
                      }
                    } else {
                      // Standard or Backup data file - use ReadData
                      const readResp = await tryCommand(
                        `DESFire ReadData ${fileId}`,
                        [
                          0x90,
                          0xbd,
                          0x00,
                          0x00,
                          0x07,
                          fileId,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                          0x00,
                        ],
                      );

                      if (readResp && readResp.length > 2) {
                        const rSw1 = readResp[readResp.length - 2];
                        const rSw2 = readResp[readResp.length - 1];
                        if (rSw1 === 0x91 && (rSw2 === 0x00 || rSw2 === 0xaf)) {
                          const dataBytes = readResp.slice(0, -2);
                          fileData[fileId] = dataBytes;
                          console.log(
                            `File ${fileId} data: ${dataBytes.map((b: number) => b.toString(16).padStart(2, "0")).join(" ")}`,
                          );
                          pages.push(...dataBytes);
                        } else if (rSw1 === 0x91 && (rSw2 === 0xae || rSw2 === 0xca)) {
                          // Per ATH.ENA Protocol: 0x91 0xAE or 0x91 0xCA = encrypted
                          console.log(
                            `File ${fileId}: Authentication required (encrypted)`,
                          );
                          isEncrypted = true;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // If no apps found, try selecting common transit app AIDs
        if (appIds.length === 0) {
          console.log("\n--- Trying common transit AIDs ---");
          // OASA might use specific AIDs
          await tryCommand(
            "Select AID 000001",
            [0x90, 0x5a, 0x00, 0x00, 0x03, 0x00, 0x00, 0x01, 0x00],
          );
          await tryCommand(
            "Select AID 000002",
            [0x90, 0x5a, 0x00, 0x00, 0x03, 0x00, 0x00, 0x02, 0x00],
          );
          await tryCommand(
            "Select AID 010000",
            [0x90, 0x5a, 0x00, 0x00, 0x03, 0x01, 0x00, 0x00, 0x00],
          );
          await tryCommand(
            "Select AID 020000",
            [0x90, 0x5a, 0x00, 0x00, 0x03, 0x02, 0x00, 0x00, 0x00],
          );
          await tryCommand(
            "Select AID F5F5F5",
            [0x90, 0x5a, 0x00, 0x00, 0x03, 0xf5, 0xf5, 0xf5, 0x00],
          );
        }
      } catch (isoErr) {
        console.log("IsoDep session error:", isoErr);
      }

      console.log("\n" + "=".repeat(50));
      console.log("ISODEP READ COMPLETE");
      console.log("Total data bytes collected:", pages.length);
      console.log(
        "Version data:",
        versionData.map((b) => b.toString(16).padStart(2, "0")).join(" "),
      );
      console.log("Application ID:", applicationId);
      console.log("Is Encrypted:", isEncrypted);
      console.log("Files read:", Object.keys(fileData).length);
      console.log("=".repeat(50));

      return { versionData, applicationId, isEncrypted, fileData };
    };

    const startScan = async () => {
      if (!isMounted) return;

      setIsScanning(true);
      setError(null);

      try {
        // Request IsoDep directly - this works for DESFire cards and we can still get tag info
        // This avoids needing to tap twice (once for NfcA, then again for IsoDep)
        await NfcManager.requestTechnology(NfcTech.IsoDep);

        if (!isMounted) return;

        console.log("NFC technology acquired: IsoDep");

        // Read tag
        const tag = await NfcManager.getTag();
        console.log("Tag detected:", JSON.stringify(tag, null, 2));

        if (tag && isMounted) {
          // Card detected - start reading data
          setIsReading(true);
          
          const pages: number[] = [];

          // First, use the tag's UID/ID if available - convert hex string to bytes
          if (tag.id) {
            let idBytes: number[] = [];
            if (typeof tag.id === "string") {
              // The ID is a hex string like "04942E6A264480" - convert to bytes
              const hexStr = tag.id.replace(/[^0-9A-Fa-f]/g, "");
              for (let i = 0; i < hexStr.length; i += 2) {
                idBytes.push(parseInt(hexStr.substr(i, 2), 16));
              }
            } else {
              idBytes = Array.from(tag.id);
            }
            console.log("ID bytes:", idBytes);
            pages.push(...idBytes);
          }

          // Variables to store card info from DESFire
          let versionData: number[] = [];
          let applicationId = "";
          let isEncrypted = false;
          let fileData: { [fileId: number]: number[] } = {};

          // Read DESFire card data - we already have IsoDep connected
          const result = await readWithIsoDep(tag, pages, true); // pass flag that IsoDep is already connected
          versionData = result.versionData;
          applicationId = result.applicationId;
          isEncrypted = result.isEncrypted;
          fileData = result.fileData;

          // If we still don't have data, try to read from ndefMessage
          if (tag.ndefMessage && tag.ndefMessage.length > 0) {
            console.log("NDEF message found:", tag.ndefMessage);
            for (const record of tag.ndefMessage) {
              if (record.payload) {
                const payloadArray = Array.isArray(record.payload)
                  ? record.payload
                  : Array.from(record.payload as Uint8Array);
                pages.push(...payloadArray.map((b: unknown) => Number(b)));
              }
            }
          }

          // Also check techTypes for additional data
          if (tag.techTypes) {
            console.log("Tech types:", tag.techTypes);
          }

          console.log("Total bytes read:", pages.length);
          console.log("=== ABOUT TO PARSE ===");
          console.log("fileData keys:", Object.keys(fileData));
          console.log(
            "fileData[12]:",
            fileData[12]
              ? fileData[12]
                  .map((b: number) => b.toString(16).padStart(2, "0"))
                  .join(" ")
              : "MISSING",
          );
          console.log(
            "fileData[16]:",
            fileData[16] ? `${fileData[16].length} bytes` : "MISSING",
          );
          console.log("isEncrypted:", isEncrypted);

          if (isMounted) {
            // Parse the DESFire version data for card info
            const desfireInfo = parseDESFireVersion(versionData);

            // Always try to parse and show something
            const parsed = parseAthenaTicketData(
              pages,
              tag.id,
              desfireInfo,
              applicationId,
              isEncrypted,
              fileData,
            );
            if (parsed) {
              setTicketInfo(parsed);
              setError(null);
            } else if (tag.id) {
              // Show basic info with just the card ID
              setTicketInfo({
                cardId: tag.id,
                uid: tag.id,
                cardType: desfireInfo?.cardType || "Unknown",
                cardKind: "Unknown",
                manufacturer: desfireInfo?.manufacturer || "Unknown",
                capacity: desfireInfo?.capacity || "Unknown",
                productionDate: desfireInfo?.productionDate || "Unknown",
                isEncrypted: isEncrypted,
                applicationId: applicationId,
                tripsRemaining: 0,
                activeProducts: [],
                expiredProducts: [],
                unusedProducts: [],
                activeProduct: null,
                expiredProduct: null,
                userCategory: "Unknown",
                isActive: false,
                remainingTimeSeconds: 0,
                expiryDate: null,
                loadDate: null,
                cashBalance: 0,
              });
              setError(null);
            } else {
              setError(t.ticketReadError);
            }
          }
        }
      } catch (e: any) {
        // Check for user cancel or component unmount - these are not real errors
        const isUserCancel =
          e?.constructor?.name === "UserCancel" ||
          e?.message?.includes("cancelled") ||
          e?.message?.includes("UserCancel");

        if (!isUserCancel && isMounted) {
          console.error("NFC scan error:", e);
          setError(t.ticketReadError);
        }
      } finally {
        await NfcManager.cancelTechnologyRequest().catch(() => {});

        if (isMounted) {
          setIsScanning(false);
          setIsReading(false); // Hide reading overlay

          // Restart scanning after a short delay
          scanTimeout = setTimeout(() => {
            if (isMounted && nfcEnabled) {
              startScan();
            }
          }, 1000);
        }
      }
    };

    startScan();

    return () => {
      isMounted = false;
      if (scanTimeout) {
        clearTimeout(scanTimeout);
      }
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, [nfcSupported, nfcEnabled, t]);

  // Render NFC not supported state
  if (nfcSupported === false || Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <View style={[styles.iconCircle, { backgroundColor: colors.card }]}>
            <Ionicons
              name="alert-circle-outline"
              size={64}
              color={colors.textSecondary}
            />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {t.nfcNotSupported}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t.nfcNotSupportedDesc}
          </Text>
        </View>
      </View>
    );
  }

  // Render NFC disabled state
  if (nfcEnabled === false) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <View style={[styles.iconCircle, { backgroundColor: colors.card }]}>
            <Ionicons
              name="wifi-outline"
              size={64}
              color={colors.textSecondary}
            />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {t.nfcDisabled}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t.nfcDisabledDesc}
          </Text>
        </View>
      </View>
    );
  }

  // Render loading state
  if (nfcSupported === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Render ticket info if scanned
  if (ticketInfo) {
    const statusColor = ticketInfo.isActive ? "#22C55E" : "#EF4444";
    const statusBgColor = ticketInfo.isActive ? "#22C55E20" : "#EF444420";

    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          style={[styles.container]}
          contentContainerStyle={styles.scrollContent}
        >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t.ticketInfo}
          </Text>
        </View>

        <View style={styles.ticketContainer}>
          {/* Encryption Notice (if data is encrypted) */}
          {ticketInfo.isEncrypted && (
            <View
              style={[styles.statusBadge, { backgroundColor: "#F59E0B20" }]}
            >
              <Ionicons name="lock-closed" size={20} color="#F59E0B" />
              <Text style={[styles.statusText, { color: "#F59E0B" }]}>
                {t.encryptedData}
              </Text>
            </View>
          )}

          {/* Status Badge */}
          {!ticketInfo.isEncrypted && (
            <View
              style={[styles.statusBadge, { backgroundColor: statusBgColor }]}
            >
              <Ionicons
                name={ticketInfo.isActive ? "checkmark-circle" : "close-circle"}
                size={20}
                color={statusColor}
              />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {ticketInfo.isActive ? t.ticketActive : t.ticketExpired}
              </Text>
            </View>
          )}

          {/* Timer (if active) */}
          {ticketInfo.isActive && remainingTime > 0 && (
            <View
              style={[styles.timerContainer, { backgroundColor: "#22C55E20" }]}
            >
              <Ionicons name="time-outline" size={24} color="#22C55E" />
              <Text style={[styles.timerText, { color: "#22C55E" }]}>
                {formatRemainingTime(remainingTime)}
              </Text>
              <Text
                style={[styles.timerLabel, { color: colors.textSecondary }]}
              >
                {t.timeRemaining}
              </Text>
            </View>
          )}

          {/* Trips Remaining - Big display */}
          <View
            style={[
              styles.tripsCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="ticket-outline" size={32} color={colors.accent} />
            <Text style={[styles.tripsLabel, { color: colors.textSecondary }]}>
              {t.tripsRemaining}
            </Text>
            <Text style={[styles.tripsValue, { color: colors.text }]}>
              {ticketInfo.tripsRemaining === "unlimited"
                ? t.unlimited
                : ticketInfo.tripsRemaining === "encrypted"
                  ? "🔒"
                  : ticketInfo.tripsRemaining}
            </Text>
          </View>

          {/* Card ID */}
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.infoRow}>
              <Ionicons name="card-outline" size={24} color={colors.accent} />
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  {t.cardId}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {ticketInfo.cardId}
                </Text>
              </View>
            </View>
            {/* Card Kind */}
            {ticketInfo.cardKind && ticketInfo.cardKind !== "Unknown" && (
              <View style={[styles.infoRow, { marginTop: 12 }]}>
                <Ionicons
                  name="pricetag-outline"
                  size={24}
                  color={colors.accent}
                />
                <View style={styles.infoContent}>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    Kind
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {ticketInfo.cardKind}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* User Category */}
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={24} color={colors.accent} />
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  {t.userCategory}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {ticketInfo.userCategory}
                </Text>
              </View>
            </View>
          </View>

          {/* Expiry Date */}
          {ticketInfo.expiryDate && (
            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.infoRow}>
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={ticketInfo.isActive ? "#22C55E" : "#EF4444"}
                />
                <View style={styles.infoContent}>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    {t.expiryDate}
                  </Text>
                  <Text
                    style={[
                      styles.infoValue,
                      { color: ticketInfo.isActive ? "#22C55E" : "#EF4444" },
                    ]}
                  >
                    {ticketInfo.expiryDate}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Load Date */}
          {ticketInfo.loadDate && (
            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.infoRow}>
                <Ionicons
                  name="download-outline"
                  size={24}
                  color={colors.accent}
                />
                <View style={styles.infoContent}>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    {t.loadDate}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {ticketInfo.loadDate}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Products Section */}
          {(ticketInfo.activeProducts?.length > 0 ||
            ticketInfo.expiredProducts?.length > 0 ||
            ticketInfo.unusedProducts?.length > 0 ||
            ticketInfo.activeProduct ||
            ticketInfo.expiredProduct) && (
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginTop: 16 },
              ]}
            >
              {t.ticketData}
            </Text>
          )}

          {/* Active Products */}
          {ticketInfo.activeProducts?.map((product, index) => (
            <View
              key={`active-${index}`}
              style={[
                styles.productCard,
                { backgroundColor: "#22C55E20", borderColor: "#22C55E" },
              ]}
            >
              <View style={styles.productHeader}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={[styles.productTitle, { color: "#22C55E" }]}>
                  {t.activeProduct}
                </Text>
              </View>
              <Text style={[styles.productName, { color: colors.text }]}>
                {product.name}
                {product.fareType ? ` (${product.fareType})` : ""}
              </Text>
            </View>
          ))}

          {/* Unused Products */}
          {ticketInfo.unusedProducts?.map((product, index) => (
            <View
              key={`unused-${index}`}
              style={[
                styles.productCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.productHeader}>
                <Ionicons
                  name="pause-circle"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.productTitle, { color: colors.textSecondary }]}
                >
                  Unused
                </Text>
              </View>
              <Text
                style={[styles.productName, { color: colors.textSecondary }]}
              >
                {product.name}
                {product.fareType ? ` (${product.fareType})` : ""}
              </Text>
            </View>
          ))}

          {/* Expired Products */}
          {ticketInfo.expiredProducts?.map((product, index) => (
            <View
              key={`expired-${index}`}
              style={[
                styles.productCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.productHeader}>
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.productTitle, { color: colors.textSecondary }]}
                >
                  {t.expiredProduct}
                </Text>
              </View>
              <Text
                style={[styles.productName, { color: colors.textSecondary }]}
              >
                {product.name}
                {product.fareType ? ` (${product.fareType})` : ""}
              </Text>
            </View>
          ))}

          {/* Legacy Active Product (fallback) */}
          {!ticketInfo.activeProducts?.length && ticketInfo.activeProduct && (
            <View
              style={[
                styles.productCard,
                { backgroundColor: "#22C55E20", borderColor: "#22C55E" },
              ]}
            >
              <View style={styles.productHeader}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={[styles.productTitle, { color: "#22C55E" }]}>
                  {t.activeProduct}
                </Text>
              </View>
              <Text style={[styles.productName, { color: colors.text }]}>
                {ticketInfo.activeProduct.name}
              </Text>
            </View>
          )}

          {/* Legacy Expired Product (fallback) */}
          {!ticketInfo.expiredProducts?.length && ticketInfo.expiredProduct && (
            <View
              style={[
                styles.productCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.productHeader}>
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.productTitle, { color: colors.textSecondary }]}
                >
                  {t.expiredProduct}
                </Text>
              </View>
              <Text
                style={[styles.productName, { color: colors.textSecondary }]}
              >
                {ticketInfo.expiredProduct.name}
              </Text>
            </View>
          )}

          {/* Cash Balance */}
          {ticketInfo.cashBalance !== undefined && (
            <View style={[styles.infoRow, { marginTop: 12 }]}>
              <Ionicons name="cash-outline" size={20} color={colors.accent} />
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  Cash
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {ticketInfo.cashBalance.toFixed(1)}€
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Scan Again Hint */}
        <View style={styles.scanHint}>
          <Ionicons
            name="scan-outline"
            size={20}
            color={colors.textSecondary}
          />
          <Text style={[styles.scanHintText, { color: colors.textSecondary }]}>
            {t.tapToScanAgain}
          </Text>
        </View>
      </ScrollView>

      {/* Reading Overlay - shows while card data is being read */}
      {isReading && (
        <View style={styles.readingOverlay}>
          <View style={[styles.readingModal, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.readingTitle, { color: colors.text }]}>
              {t.readingCard}
            </Text>
            <Text style={[styles.readingSubtitle, { color: colors.textSecondary }]}>
              {t.keepCardClose}
            </Text>
          </View>
        </View>
      )}
    </View>
    );
  }

  // Render scan prompt
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.centerContent}>
        <View style={[styles.scanAnimation, { borderColor: colors.accent }]}>
          <Ionicons name="card-outline" size={80} color={colors.accent} />
          {isScanning && (
            <View style={styles.pulseRing}>
              <View style={[styles.pulse, { borderColor: colors.accent }]} />
            </View>
          )}
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t.scanTicket}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t.scanTicketDesc}
        </Text>
        {error && (
          <View
            style={[styles.errorContainer, { backgroundColor: "#EF444420" }]}
          >
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {/* Reading Overlay - shows while card data is being read */}
      {isReading && (
        <View style={styles.readingOverlay}>
          <View style={[styles.readingModal, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.readingTitle, { color: colors.text }]}>
              {t.readingCard || "Reading card..."}
            </Text>
            <Text style={[styles.readingSubtitle, { color: colors.textSecondary }]}>
              {t.keepCardClose || "Keep card close to the device"}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === "ios" ? 100 : 80,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  scanAnimation: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  pulseRing: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  pulse: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    opacity: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
  },
  ticketContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 20,
    borderRadius: 16,
    marginBottom: 8,
  },
  timerText: {
    fontSize: 48,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    fontSize: 14,
    position: "absolute",
    bottom: 8,
  },
  tripsCard: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    marginVertical: 8,
  },
  tripsLabel: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  tripsValue: {
    fontSize: 48,
    fontWeight: "700",
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  productCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  productName: {
    fontSize: 18,
    fontWeight: "600",
  },
  scanHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  scanHintText: {
    fontSize: 14,
  },
  // Reading overlay styles
  readingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  readingModal: {
    width: "80%",
    maxWidth: 300,
    padding: 32,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  readingTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 20,
    textAlign: "center",
  },
  readingSubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});
