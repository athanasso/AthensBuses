import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default;
    NfcTech = nfcModule.NfcTech;
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
  manufacturer: string;
  capacity: string;
  productionDate: string;

  // Ticket info (may be unavailable if encrypted)
  tripsRemaining: number | "unlimited" | "encrypted";
  activeProduct: ProductInfo | null;
  expiredProduct: ProductInfo | null;
  userCategory: string;
  isActive: boolean;
  remainingTimeSeconds: number;
  expiryDate: string | null;
  loadDate: string | null;

  // Status flags
  isEncrypted: boolean;
  applicationId: string;
}

interface ProductInfo {
  name: string;
  status?: "active" | "expired" | "inactive";
  validUntil?: Date;
  trips?: number;
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

// ATH.ENA User category codes
const USER_CATEGORIES: { [key: number]: string } = {
  0x00: "Adult",
  0x01: "Adult",
  0x10: "Student",
  0x20: "Senior",
  0x30: "Adult", // Personalized adult card
  0x40: "Child",
  0x50: "Disabled",
  0x60: "Military",
  0x70: "Unemployed",
  0x80: "University student",
};

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
  let tripsRemaining: number | "unlimited" | "encrypted" = isEncrypted
    ? "encrypted"
    : 0;
  let userCategory = "Unknown";
  let activeProduct: ProductInfo | null = null;
  let expiredProduct: ProductInfo | null = null;
  let isActive = false;
  let remainingTimeSeconds = 0;
  let expiryDate: string | null = null;
  let loadDate: string | null = null;

  if (fileData && !isEncrypted) {
    // === PARSE FILE 2: Card info and user category ===
    const file2 = fileData[2];
    if (file2 && file2.length >= 20) {
      // Card ID is at bytes 12-16: 00 02 16 39 54 -> "3001 0100 0216 3954"
      // The format seems to be: [prefix bytes] [card number in BCD]
      // Looking at: b0 32 01 83 01 1a 01 01 01 30 01 01 00 02 16 39 54
      // Bytes 12-16 contain part of card number
      const cardBytes = file2.slice(12, 17);
      let cardNum = "3001 0100 "; // Prefix for ATH.ENA cards
      for (const b of cardBytes) {
        cardNum += b.toString(16).padStart(2, "0");
      }
      // Format as: 3001 0100 0216 3954
      cardId = cardNum
        .toUpperCase()
        .replace(/(.{4})/g, "$1 ")
        .trim();
      console.log(`Parsed Card ID: ${cardId}`);

      // User category from byte 9 of File 2
      const categoryByte = file2[9];
      userCategory = USER_CATEGORIES[categoryByte] || "Regular";
      console.log(
        `User category byte (File 2): 0x${categoryByte.toString(16)} -> ${userCategory}`,
      );
    }

    // === PARSE FILE 4: Card personalization and user type ===
    // File 4 contains card type info - bytes 4-6 contain a type code
    // PKP = Personalized card (University student, etc.)
    // ZLZ = Anonymous/Regular card
    const file4 = fileData[4];
    if (file4 && file4.length >= 10) {
      const typeCode = String.fromCharCode(file4[4], file4[5], file4[6]);
      console.log(`Card type code (File 4): ${typeCode}`);

      // Check for personalized card indicators
      if (typeCode === "PKP" || file4[3] === 0x37) {
        // Personalized card - check File 4 bytes 9-14 for category data
        // Personalized cards often have specific user categories
        const persCategory = file4[9];
        if (persCategory !== 0) {
          // Override with personalized category if available
          const persUserCat = USER_CATEGORIES[persCategory];
          if (persUserCat) {
            userCategory = persUserCat;
            console.log(
              `Personalized user category: 0x${persCategory.toString(16)} -> ${userCategory}`,
            );
          }
        }
        // If PKP code and no specific category, likely University student
        if (userCategory === "Adult" && typeCode === "PKP") {
          userCategory = "University student";
          console.log(`Detected University student card (PKP type)`);
        }
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
    } else {
      console.log(
        `File 12 not available or too short, length: ${file12?.length || 0}`,
      );
    }

    // === PARSE FILE 16: Products ===
    // Each product is 32 bytes. File 16 contains active products.
    const file16 = fileData[16];
    if (file16 && file16.length >= 32) {
      console.log(
        `File 16 (products): ${file16
          .slice(0, 32)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`,
      );

      // Product type byte helps determine if it's period-based or count-based
      // 0x31 (49) = Monthly pass, 0x32 (50) = Count-based trips
      const prodType = file16[1]; // Product type indicator
      const prod1Trips = file16[16]; // Trip count at byte 16

      // If trips is 0 but product exists, it's likely a period-based pass (monthly, etc.)
      const isPeriodPass = prod1Trips === 0 && file16[0] !== 0xff;

      if (isPeriodPass || prodType === 0x31) {
        // Period-based pass (monthly)
        activeProduct = {
          name: "Monthly",
          trips: 0,
        };
        // For period passes, trips are unlimited
        tripsRemaining = "unlimited";
        console.log(`Active period pass detected, type: ${prodType}`);
      } else if (prod1Trips > 0) {
        // Count-based product
        activeProduct = {
          name: `${prod1Trips} trips`,
          trips: prod1Trips,
        };
        console.log(`Active product: ${prod1Trips} trips`);
      }

      // Second product (bytes 32-63)
      if (file16.length >= 64) {
        const prod2Type = file16[33];
        const prod2Trips = file16[32 + 16]; // Trip count at byte 48
        const isPeriodPass2 = prod2Trips === 0 && file16[32] !== 0xff;

        if (isPeriodPass2 || prod2Type === 0x31) {
          expiredProduct = {
            name: "Monthly",
            trips: 0,
          };
          console.log(`Second period pass detected, type: ${prod2Type}`);
        } else if (prod2Trips > 0) {
          expiredProduct = {
            name: `${prod2Trips} trips`,
            trips: prod2Trips,
          };
          console.log(`Expired product: ${prod2Trips} trips`);
        }
      }

      // Fallback: if File 12 didn't give us trips but we have an active count-based product
      if (
        tripsRemaining === 0 &&
        activeProduct &&
        activeProduct.trips &&
        activeProduct.trips > 0
      ) {
        console.log(
          `Using active product trips as fallback: ${activeProduct.trips}`,
        );
        tripsRemaining = activeProduct.trips;
      }
    }

    // === PARSE FILE 6: Trip history (cyclic records) ===
    // This contains trip validation records with timestamps
    const file6 = fileData[6];
    if (file6 && file6.length >= 10) {
      console.log(
        `File 6 (trip history): ${file6.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
      );
    }

    // === PARSE PRODUCT TIMESTAMPS from File 16 ===
    // File 16 structure per product (32 bytes each):
    // Bytes 0: Status byte
    // Bytes 1: Product type (0x31=Monthly, 0x32=Count-based trips, etc.)
    // Bytes 4-7: Load/validation timestamp
    // Bytes 8-11: Expiry info (format varies by product type)
    if (file16 && file16.length >= 12) {
      const athenaEpoch = 852076800; // 1997-01-01 00:00:00 UTC
      const now = Math.floor(Date.now() / 1000);
      const prodType = file16[1];
      const isPeriodPass = prodType === 0x31; // Monthly pass

      // Parse load timestamp (bytes 4-7) - little-endian
      const loadBytes = file16.slice(4, 8);
      const loadRaw =
        (loadBytes[0] & 0xff) |
        ((loadBytes[1] & 0xff) << 8) |
        ((loadBytes[2] & 0xff) << 16) |
        ((loadBytes[3] & 0xff) << 24);
      const loadTimestamp = loadRaw >>> 0; // unsigned

      console.log(`Product load raw: ${loadTimestamp}`);

      // Check if load timestamp is a valid Unix timestamp (2015-2040)
      if (loadTimestamp > 1420070400 && loadTimestamp < 2208988800) {
        loadDate = formatTimestamp(loadTimestamp);
        console.log(`Load date (Unix): ${loadDate}`);
      } else if (loadTimestamp > 0) {
        // Try with ATH.ENA epoch
        const loadUnix = athenaEpoch + loadTimestamp;
        if (loadUnix > 1420070400 && loadUnix < 2208988800) {
          loadDate = formatTimestamp(loadUnix);
          console.log(`Load date (1997 epoch): ${loadDate}`);
        }
      }

      // Parse expiry based on product type
      if (isPeriodPass) {
        // For monthly passes, expiry is end of calendar month (23:59:59)
        // Calculate from load date or current date
        const refDate =
          loadTimestamp > 1420070400
            ? new Date(loadTimestamp * 1000)
            : new Date();

        // Get end of current month at 23:59:59
        const endOfMonth = new Date(
          refDate.getFullYear(),
          refDate.getMonth() + 1, // Next month
          0, // Day 0 = last day of previous month
          23,
          59,
          59,
        );
        const endOfMonthUnix = Math.floor(endOfMonth.getTime() / 1000);

        expiryDate = formatTimestamp(endOfMonthUnix);
        if (endOfMonthUnix > now) {
          isActive = true;
          remainingTimeSeconds = endOfMonthUnix - now;
          console.log(
            `Monthly pass ACTIVE, expires end of month: ${expiryDate}, remaining: ${remainingTimeSeconds}s`,
          );
        } else {
          console.log(`Monthly pass EXPIRED: ${expiryDate}`);
        }
      } else {
        // For count-based trips, parse expiry from bytes 8-11
        // This represents the trip validation expiry (90 minutes from tap)
        const expiryBytes = file16.slice(8, 12);
        const expiryRaw =
          (expiryBytes[0] & 0xff) |
          ((expiryBytes[1] & 0xff) << 8) |
          ((expiryBytes[2] & 0xff) << 16) |
          ((expiryBytes[3] & 0xff) << 24);
        const expiryTimestamp = expiryRaw >>> 0;

        console.log(`Product expiry raw: ${expiryTimestamp}`);

        // Check if expiry looks like a valid Unix timestamp
        if (expiryTimestamp > 1420070400 && expiryTimestamp < 2208988800) {
          expiryDate = formatTimestamp(expiryTimestamp);
          if (expiryTimestamp > now) {
            isActive = true;
            remainingTimeSeconds = expiryTimestamp - now;
            console.log(
              `Trip validation ACTIVE (Unix), expires: ${expiryDate}, remaining: ${remainingTimeSeconds}s`,
            );
          } else {
            console.log(`Trip validation EXPIRED (Unix): ${expiryDate}`);
          }
        } else if (expiryTimestamp > 0) {
          // Try with ATH.ENA epoch
          const expiryUnix = athenaEpoch + expiryTimestamp;
          if (expiryUnix > 1420070400 && expiryUnix < 2208988800) {
            expiryDate = formatTimestamp(expiryUnix);
            if (expiryUnix > now) {
              isActive = true;
              remainingTimeSeconds = expiryUnix - now;
              console.log(
                `Trip validation ACTIVE (1997 epoch), expires: ${expiryDate}, remaining: ${remainingTimeSeconds}s`,
              );
            } else {
              console.log(
                `Trip validation EXPIRED (1997 epoch): ${expiryDate}`,
              );
            }
          }
        }
      }
    }
  }

  const result: TicketInfo = {
    cardId,
    uid,
    cardType: versionInfo.cardType,
    manufacturer: versionInfo.manufacturer,
    capacity: versionInfo.capacity,
    productionDate: versionInfo.productionDate,
    tripsRemaining,
    activeProduct,
    expiredProduct,
    userCategory,
    isActive,
    remainingTimeSeconds,
    expiryDate,
    loadDate,
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
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(0);

  // Check NFC support on mount
  useEffect(() => {
    if (Platform.OS === "web") {
      setNfcSupported(false);
      return;
    }

    if (!NfcManager) {
      setNfcSupported(false);
      return;
    }

    const checkNfc = async () => {
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
    };

    checkNfc();

    return () => {
      if (NfcManager) {
        NfcManager.cancelTechnologyRequest().catch(() => {});
      }
    };
  }, []);

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
                          console.log(
                            `File ${fileId} GetValue failed with status: ${vSw1.toString(16)} ${vSw2.toString(16)}`,
                          );
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
                        } else if (rSw1 === 0x91 && rSw2 === 0xae) {
                          console.log(
                            `File ${fileId}: Authentication required`,
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
                manufacturer: desfireInfo?.manufacturer || "Unknown",
                capacity: desfireInfo?.capacity || "Unknown",
                productionDate: desfireInfo?.productionDate || "Unknown",
                isEncrypted: isEncrypted,
                applicationId: applicationId,
                tripsRemaining: 0,
                activeProduct: null,
                expiredProduct: null,
                userCategory: "Unknown",
                isActive: false,
                remainingTimeSeconds: 0,
                expiryDate: null,
                loadDate: null,
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
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
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
          {(ticketInfo.activeProduct || ticketInfo.expiredProduct) && (
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginTop: 16 },
              ]}
            >
              {t.ticketData}
            </Text>
          )}

          {/* Active Product */}
          {ticketInfo.activeProduct && (
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

          {/* Expired Product */}
          {ticketInfo.expiredProduct && (
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
});
