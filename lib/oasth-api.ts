/**
 * OASTH Telematics API Client (Thessaloniki)
 * Handles all API calls for Thessaloniki public transport
 * 
 * OASTH API returns gzip-compressed data in tuple format, not JSON
 */

import pako from 'pako';
import type { StopRoute } from './api';
import type { BusLocation, Line, Route, RoutePoint, Stop, StopArrival } from './types';

// OASTH API base URL
const BASE_URL = 'https://old.oasth.gr/el/api';

/**
 * Helper to build endpoint URLs
 */
function buildUrl(endpoint: string, param?: string): string {
  const path = param ? `${endpoint}/${param}` : endpoint;
  return `${BASE_URL}/${path}/?a=1`;
}

/**
 * Decompress gzip data using pako
 */
function decompressGzip(data: Uint8Array): string {
  try {
    if (data[0] === 0x1f && data[1] === 0x8b) {
      return pako.ungzip(data, { to: 'string' });
    }
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(data);
  } catch (e) {
    console.error('Decompression error:', e);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(data);
  }
}

/**
 * Parse OASTH tuple format to array of objects
 * Format: (val1, "val2", ...), (val1, "val2", ...), ...
 */
function parseTupleFormat(text: string): string[][] {
  const rows: string[][] = [];
  
  // Match all tuples: (...)
  const tupleRegex = /\(([^)]+)\)/g;
  let match;
  
  while ((match = tupleRegex.exec(text)) !== null) {
    const tupleContent = match[1];
    const values: string[] = [];
    
    // Parse values within the tuple (handle quoted strings and numbers)
    const valueRegex = /"([^"]*)"|-?\d+\.?\d*|None|null/g;
    let valueMatch;
    
    while ((valueMatch = valueRegex.exec(tupleContent)) !== null) {
      if (valueMatch[1] !== undefined) {
        values.push(valueMatch[1]); // Quoted string
      } else if (valueMatch[0] === 'None' || valueMatch[0] === 'null') {
        values.push('');
      } else {
        values.push(valueMatch[0]); // Number
      }
    }
    
    if (values.length > 0) {
      rows.push(values);
    }
  }
  
  return rows;
}

/**
 * Fetch and parse OASTH API response
 */
async function fetchAPI<T>(endpoint: string, param?: string): Promise<T> {
  const url = buildUrl(endpoint, param);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`OASTH API Error: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = decompressGzip(bytes);
    
    if (!text || text.trim() === '' || text === 'null' || text === '[]' || text === '()') {
      return [] as unknown as T;
    }

    // Try JSON first
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return JSON.parse(text) as T;
      } catch {
        // Fall through to tuple parsing
      }
    }
    
    // Parse as tuple format
    const rows = parseTupleFormat(text);
    return rows as unknown as T;
    
  } catch (error) {
    console.error('OASTH API fetch error:', error);
    return [] as unknown as T;
  }
}

/**
 * Get all bus stops
 */
export async function getStops(): Promise<Stop[]> {
  const rows = await fetchAPI<string[][]>('getStopsB');
  
  if (!Array.isArray(rows)) return [];
  
  return rows.map(row => ({
    StopCode: row[1] || '',
    StopID: row[0]?.toString() || '',
    StopDescr: row[2] || '',
    StopDescrEng: row[3] || row[2] || '',
    StopLat: row[8] || '0',   // Latitude is at index 8
    StopLng: row[7] || '0',   // Longitude is at index 7
    StopHeading: '0',
    StopStreet: row[4] || null,
    StopStreetEng: row[5] || null,
  }));
}

/**
 * Get all bus lines
 */
export async function getLines(): Promise<Line[]> {
  const rows = await fetchAPI<string[][]>('getLines');
  
  if (!Array.isArray(rows)) return [];
  
  return rows.map(row => ({
    LineCode: row[0]?.toString() || '',
    LineID: row[1] || '',
    LineDescr: row[2] || '',
    LineDescrEng: row[3] || row[2] || '',
  }));
}

/**
 * Get routes for a specific line
 */
export async function getRoutesForLine(lineCode: string): Promise<Route[]> {
  const rows = await fetchAPI<string[][]>('getRoutes');
  
  if (!Array.isArray(rows)) return [];
  
  // Filter by lineCode (first column is usually line ID)
  const lineRoutes = rows.filter(row => row[0]?.toString() === lineCode);
  
  return lineRoutes.map(row => ({
    RouteCode: row[1]?.toString() || '',
    LineCode: row[0]?.toString() || '',
    RouteDescr: row[2] || '',
    RouteDescrEng: row[3] || row[2] || '',
    RouteType: '1',
    RouteDistance: '',
  }));
}

/**
 * Get route polyline details
 */
export async function getRouteDetails(routeCode: string): Promise<RoutePoint[]> {
  const rows = await fetchAPI<string[][]>('getRouteDetailPerRoute', routeCode);
  
  if (!Array.isArray(rows)) return [];
  
  return rows.map((row, index) => ({
    routed_x: row[0] || '0',  // longitude
    routed_y: row[1] || '0',  // latitude
    routed_order: index.toString(),
  }));
}

/**
 * Get arrivals at a stop
 * OASTH returns arrivals as JSON objects: [{route_code, veh_code, btime2}, ...]
 */
export async function getStopArrivals(stopCode: string): Promise<StopArrival[]> {
  const arrivals = await fetchAPI<any[]>('getStopArrivals', stopCode);
  
  if (!Array.isArray(arrivals)) return [];
  
  return arrivals.map(arr => {
    // Handle JSON object format
    if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
      return {
        btime2: arr.btime2?.toString() || '',
        route_code: arr.route_code?.toString() || '',
        veh_code: arr.veh_code?.toString() || '',
      };
    }
    // Handle tuple array format
    return {
      btime2: arr[0] || '',
      route_code: arr[1] || '',
      veh_code: arr[2] || '',
    };
  });
}

/**
 * Get live bus locations for a route
 */
export async function getBusLocations(routeCode: string): Promise<BusLocation[]> {
  const rows = await fetchAPI<string[][]>('getBusLocation', routeCode);
  
  if (!Array.isArray(rows)) return [];
  
  return rows.map(row => ({
    VEH_NO: row[0] || '',
    CS_DATE: row[1] || '',
    CS_LAT: row[2] || '0',
    CS_LNG: row[3] || '0',
    ROUTE_CODE: routeCode,
  }));
}

/**
 * Get closest stops to a location
 */
export async function getClosestStops(lat: number, lng: number): Promise<Stop[]> {
  const allStops = await getStops();
  
  if (!Array.isArray(allStops) || allStops.length === 0) return [];
  
  const stopsWithDistance = allStops
    .filter(stop => stop.StopLat && stop.StopLng && stop.StopLat !== '0' && stop.StopLng !== '0')
    .map(stop => {
      const stopLat = parseFloat(stop.StopLat);
      const stopLng = parseFloat(stop.StopLng);
      
      if (isNaN(stopLat) || isNaN(stopLng)) {
        return { ...stop, distance: '999' };
      }
      
      const R = 6371;
      const dLat = (stopLat - lat) * Math.PI / 180;
      const dLng = (stopLng - lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat * Math.PI / 180) * Math.cos(stopLat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      return {
        ...stop,
        distance: distance.toFixed(2),
      };
    });
  
  stopsWithDistance.sort((a, b) => parseFloat(a.distance!) - parseFloat(b.distance!));
  return stopsWithDistance.slice(0, 30);
}

/**
 * Get routes for a stop
 * OASTH doesn't have a direct endpoint, so we use getRealTimeArrivals which returns route info
 */
export async function getRoutesForStop(stopCode: string): Promise<StopRoute[]> {
  // Fetch real-time arrivals which contains route information
  const arrivalsUrl = buildUrl('getStopArrivals', stopCode);
  
  try {
    const response = await fetch(arrivalsUrl, { headers: { 'Accept': '*/*' } });
    if (!response.ok) return [];
    
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = decompressGzip(bytes);
    
    if (!text || text.trim() === '') return [];
    
    // Parse arrivals - format can be JSON or tuples
    let arrivals: any[] = [];
    const trimmed = text.trim();
    
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        arrivals = JSON.parse(text);
      } catch {
        arrivals = parseTupleFormat(text);
      }
    } else {
      arrivals = parseTupleFormat(text);
    }
    
    if (!Array.isArray(arrivals)) return [];
    
    // Get unique route codes from arrivals
    const routeCodes = new Set<string>();
    arrivals.forEach((arr: any) => {
      if (arr.route_code) routeCodes.add(arr.route_code);
      else if (arr[1]) routeCodes.add(arr[1]); // tuple format
    });
    
    // Build minimal StopRoute objects
    const routes: StopRoute[] = [];
    for (const routeCode of routeCodes) {
      routes.push({
        RouteCode: routeCode,
        RouteDescr: `Route ${routeCode}`,
        RouteDescrEng: `Route ${routeCode}`,
        RouteType: '1',
        LineCode: routeCode,
        LineID: routeCode.slice(-2) || routeCode, // Use last 2 digits as display ID
        LineDescr: `Line ${routeCode}`,
        LineDescrEng: `Line ${routeCode}`,
        MasterLineCode: routeCode,
      });
    }
    
    return routes;
  } catch (error) {
    console.error('Error fetching routes for stop:', error);
    return [];
  }
}

/**
 * Get line schedule
 */
export async function getLineSchedule(_routeCode: string, _lineCode: string): Promise<{ departure: string[]; return: string[] }> {
  return { departure: [], return: [] };
}
