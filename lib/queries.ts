/**
 * TanStack Query hooks for OASA Telematics API
 */

import { useQuery } from '@tanstack/react-query';
import * as api from './api';
import type { BusLocation, Line, Route, RoutePoint, Stop, StopArrival } from './types';

// Query keys for cache management
export const queryKeys = {
  lines: ['lines'] as const,
  routes: (lineCode: string) => ['routes', lineCode] as const,
  routeDetails: (routeCode: string) => ['routeDetails', routeCode] as const,
  busLocations: (routeCode: string) => ['busLocations', routeCode] as const,
  stopArrivals: (stopCode: string) => ['stopArrivals', stopCode] as const,
  stops: (routeCode: string) => ['stops', routeCode] as const,
  closestStops: (lat: number, lng: number) => ['closestStops', lat, lng] as const,
};

/**
 * Get all bus lines
 * staleTime: Infinity - lines rarely change
 */
export function useLines() {
  return useQuery<Line[]>({
    queryKey: queryKeys.lines,
    queryFn: api.getLines,
    staleTime: Infinity, // Lines rarely change
  });
}

/**
 * Get routes for a line
 */
export function useRoutes(lineCode: string | null) {
  return useQuery<Route[]>({
    queryKey: queryKeys.routes(lineCode || ''),
    queryFn: () => api.getRoutesForLine(lineCode!),
    enabled: !!lineCode,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get route polyline details
 */
export function useRouteDetails(routeCode: string | null) {
  return useQuery<RoutePoint[]>({
    queryKey: queryKeys.routeDetails(routeCode || ''),
    queryFn: () => api.getRouteDetails(routeCode!),
    enabled: !!routeCode,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get live bus locations
 * refetchInterval: 10000 - poll every 10s when enabled
 */
export function useBusLocations(routeCode: string | null, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && !!routeCode;
  
  return useQuery<BusLocation[]>({
    queryKey: queryKeys.busLocations(routeCode || ''),
    queryFn: () => api.getBusLocations(routeCode!),
    enabled,
    refetchInterval: enabled ? 10000 : false, // Poll every 10s when map is open
    staleTime: 5000, // Consider stale after 5s
  });
}

/**
 * Get arrivals at a stop
 */
export function useStopArrivals(stopCode: string | null) {
  return useQuery<StopArrival[]>({
    queryKey: queryKeys.stopArrivals(stopCode || ''),
    queryFn: () => api.getStopArrivals(stopCode!),
    enabled: !!stopCode,
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 10000,
  });
}

/**
 * Get stops for a route
 */
export function useStops(routeCode: string | null) {
  return useQuery<Stop[]>({
    queryKey: queryKeys.stops(routeCode || ''),
    queryFn: () => api.getStops(routeCode!),
    enabled: !!routeCode,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get closest stops to user location
 */
export function useClosestStops(lat: number | null, lng: number | null) {
  const hasLocation = lat !== null && lng !== null;
  
  return useQuery<Stop[]>({
    queryKey: queryKeys.closestStops(lat || 0, lng || 0),
    queryFn: () => api.getClosestStops(lat!, lng!),
    enabled: hasLocation,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Get all routes serving a stop
 */
export function useRoutesForStop(stopCode: string | null) {
  return useQuery<api.StopRoute[]>({
    queryKey: ['routesForStop', stopCode || ''],
    queryFn: () => api.getRoutesForStop(stopCode!),
    enabled: !!stopCode,
    staleTime: 1000 * 60 * 60, // 1 hour - routes rarely change
  });
}

/**
 * Get schedule/timetable for a line
 */
export function useSchedule(lineCode: string | null) {
  return useQuery<api.LineScheduleResult>({
    queryKey: ['schedule', lineCode || ''],
    queryFn: () => api.getLineSchedule('', lineCode!),
    enabled: !!lineCode,
    staleTime: 1000 * 60 * 60, // 1 hour - schedules don't change often
  });
}
