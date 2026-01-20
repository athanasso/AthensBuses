/**
 * OASA Telematics API Client
 * Handles all API calls with proper UTF-8 encoding for Greek text
 */

import type { BusLocation, Line, Route, RoutePoint, Stop, StopArrival } from './types';

const BASE_URL = 'http://telematics.oasa.gr/api/';

/**
 * Fetch with UTF-8 decoding to handle Greek text properly
 */
async function fetchAPI<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE_URL);
  url.searchParams.set('act', action);
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Charset': 'utf-8',
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  // Ensure proper UTF-8 decoding
  const text = await response.text();
  
  // Handle empty responses
  if (!text || text === 'null') {
    return [] as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.error('Failed to parse API response:', text);
    throw new Error('Failed to parse API response');
  }
}

/**
 * Get all bus lines
 */
export async function getLines(): Promise<Line[]> {
  return fetchAPI<Line[]>('webGetLines');
}

/**
 * Get routes for a specific line
 */
export async function getRoutesForLine(lineCode: string): Promise<Route[]> {
  return fetchAPI<Route[]>('webGetRoutes', { p1: lineCode });
}

/**
 * Get route details (polyline points)
 */
export async function getRouteDetails(routeCode: string): Promise<RoutePoint[]> {
  return fetchAPI<RoutePoint[]>('webRouteDetails', { p1: routeCode });
}

/**
 * Get live bus locations for a route
 */
export async function getBusLocations(routeCode: string): Promise<BusLocation[]> {
  return fetchAPI<BusLocation[]>('getBusLocation', { p1: routeCode });
}

/**
 * Get arrivals at a stop
 */
export async function getStopArrivals(stopCode: string): Promise<StopArrival[]> {
  console.log('Fetching arrivals for stop:', stopCode);
  
  // API works with numeric stop codes like "10001" 
  const result = await fetchAPI<StopArrival[]>('getStopArrivals', { p1: stopCode });
  console.log('Arrivals for', stopCode, ':', result?.length || 0, 'buses');
  return result;
}

/**
 * Get stops for a route
 */
export async function getStops(routeCode: string): Promise<Stop[]> {
  return fetchAPI<Stop[]>('webGetStops', { p1: routeCode });
}

/**
 * Get closest stops to a location
 */
export async function getClosestStops(lat: number, lng: number): Promise<Stop[]> {
  return fetchAPI<Stop[]>('getClosestStops', { 
    p1: lat.toString(),
    p2: lng.toString()
  });
}

/**
 * Get route name by code
 */
export async function getRouteName(routeCode: string): Promise<{ route_descr: string; route_descr_eng: string }[]> {
  return fetchAPI('getRouteName', { p1: routeCode });
}

/**
 * Get all routes that serve a stop
 */
export interface StopRoute {
  RouteCode: string;
  RouteDescr: string;
  RouteDescrEng: string;
  RouteType: string;
  LineCode: string;
  LineID: string;
  LineDescr: string;
  LineDescrEng: string;
  MasterLineCode: string;
}

export async function getRoutesForStop(stopCode: string): Promise<StopRoute[]> {
  return fetchAPI<StopRoute[]>('webRoutesForStop', { p1: stopCode });
}

/**
 * Get schedule days/types for a masterline (step 1)
 */
export interface ScheduleDay {
  sdc_code: string;
  sdc_descr: string;
  sdc_descr_eng: string;
}

export async function getScheduleDaysMasterline(mlCode: string): Promise<ScheduleDay[]> {
  return fetchAPI<ScheduleDay[]>('getScheduleDaysMasterline', { p1: mlCode });
}

/**
 * Get schedule times (step 2 - requires sdc_code from step 1)
 */
export interface ScheduleLine {
  sde_start1: string | null; // Departure time direction 1
  sde_start2: string | null; // Departure time direction 2
  sde_line1: string | null;
  sde_line2: string | null;
}

export interface SchedLinesResponse {
  come: ScheduleLine[];
  go: ScheduleLine[];
}

export async function getSchedLines(mlCode: string, sdcCode: string, lineCode: string): Promise<SchedLinesResponse | null> {
  return fetchAPI<SchedLinesResponse>('getSchedLines', { 
    p1: mlCode,
    p2: sdcCode,
    p3: lineCode
  });
}

/**
 * Schedule result with both directions
 */
export interface LineScheduleResult {
  departure: string[];  // "come" direction
  return: string[];     // "go" direction
}

/**
 * Combined function to get schedule for a line (handles 2-step process)
 * Returns separate schedules for departure and return directions
 */
export async function getLineSchedule(mlCode: string, lineCode: string): Promise<LineScheduleResult> {
  try {
    // Step 1: Get available schedule days (uses lineCode)
    const scheduleDays = await getScheduleDaysMasterline(lineCode);
    
    if (!scheduleDays || scheduleDays.length === 0) {
      return { departure: [], return: [] };
    }
    
    // Use the first schedule type (usually daily)
    const sdcCode = scheduleDays[0].sdc_code;
    
    // Step 2: Get schedule times
    const response = await getSchedLines(lineCode, sdcCode, lineCode);
    
    if (!response) {
      return { departure: [], return: [] };
    }
    
    // Helper to extract HH:MM from datetime string like "1900-01-01 05:30:00"
    const extractTime = (datetime: string | null): string | null => {
      if (!datetime) return null;
      if (datetime.includes(' ')) {
        const timePart = datetime.split(' ')[1];
        if (timePart) {
          return timePart.substring(0, 5);
        }
      }
      if (datetime.length > 5) {
        return datetime.substring(0, 5);
      }
      return datetime;
    };
    
    // Process "come" direction (departure)
    const departureTimes = new Set<string>();
    if (response.come && Array.isArray(response.come)) {
      response.come.forEach(line => {
        const t1 = extractTime(line?.sde_start1);
        const t2 = extractTime(line?.sde_start2);
        if (t1) departureTimes.add(t1);
        if (t2) departureTimes.add(t2);
      });
    }
    
    // Process "go" direction (return)
    const returnTimes = new Set<string>();
    if (response.go && Array.isArray(response.go)) {
      response.go.forEach(line => {
        const t1 = extractTime(line?.sde_start1);
        const t2 = extractTime(line?.sde_start2);
        if (t1) returnTimes.add(t1);
        if (t2) returnTimes.add(t2);
      });
    }
    
    return {
      departure: Array.from(departureTimes).sort(),
      return: Array.from(returnTimes).sort()
    };
  } catch (e) {
    return { departure: [], return: [] };
  }
}


