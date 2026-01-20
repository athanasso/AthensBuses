/**
 * TypeScript types for OASA Telematics API
 */

// Bus line information
export interface Line {
  LineCode: string;
  LineID: string;
  LineDescr: string;
  LineDescrEng: string;
}

// Route information for a line
export interface Route {
  RouteCode: string;
  LineCode: string;
  RouteDescr: string;
  RouteDescrEng: string;
  RouteType?: string;
  RouteDistance?: string;
}

// Route geometry point (for polyline)
export interface RoutePoint {
  routed_x: string;
  routed_y: string;
  routed_order: string;
}

// Live bus location
export interface BusLocation {
  VEH_NO: string;
  CS_DATE: string;
  CS_LAT: string;
  CS_LNG: string;
  ROUTE_CODE: string;
}

// Bus arrival at a stop
export interface StopArrival {
  route_code: string;
  veh_code: string;
  btime2: string; // minutes until arrival
}

// Bus stop information
export interface Stop {
  StopCode: string;
  StopID: string;
  StopDescr: string;
  StopDescrEng: string;
  StopStreet: string | null;
  StopStreetEng: string | null;
  StopHeading: string;
  StopLat: string;
  StopLng: string;
  RouteStopOrder?: string;
  StopType?: string;
  StopAmea?: string;
  distance?: string; // Only for closest stops
}

// Search result types
export type SearchResultType = 'line' | 'stop' | 'street';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  data: Line | Stop;
}

// Favorite item
export interface FavoriteItem {
  id: string;
  type: 'line' | 'stop';
  name: string;
  code: string;
  addedAt: number;
}
