import { Region } from '../types'
import { logger } from './logger/LoggerService';

type ViewportCallback = (region: Region) => void;

class MapViewportStore {
  private currentRegion: Region = {
    latitude: 55.751244,
    longitude: 37.618423,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  private subscribers: Map<string, ViewportCallback> = new Map();

  setRegion(region: Region) {
    // V11: Increased significance threshold to prevent micro-movements from triggering expensive recalculations
    const SIGNIFICANT_MOVE = 0.0005;
    const isSignificant =
      Math.abs(this.currentRegion.latitude - region.latitude) > SIGNIFICANT_MOVE ||
      Math.abs(this.currentRegion.longitude - region.longitude) > SIGNIFICANT_MOVE ||
      Math.abs(this.currentRegion.latitudeDelta - region.latitudeDelta) > (SIGNIFICANT_MOVE * 2);

    if (isSignificant) {
        this.currentRegion = region;
        logger.trace('MAP_VIEWPORT_CHANGED', {
            source: 'system',
            lat: region.latitude.toFixed(3),
            lng: region.longitude.toFixed(3),
            delta: region.latitudeDelta.toFixed(3)
        });
        this.notify();
    }
  }

  getRegion(): Region {
    return this.currentRegion;
  }

  subscribe(callback: ViewportCallback, source: string) {
    this.subscribers.set(source, callback);
    logger.debug('MAP_VIEWPORT_SUBSCRIBE', { source, total: this.subscribers.size });

    // Immediate callback with current value
    callback(this.currentRegion);

    return () => {
        this.subscribers.delete(source);
        logger.debug('MAP_VIEWPORT_UNSUBSCRIBE', { source, remaining: this.subscribers.size });
    };
  }

  private notify() {
    logger.trace('MAP_VIEWPORT_NOTIFY', { count: this.subscribers.size });
    this.subscribers.forEach(cb => cb(this.currentRegion));
  }
}

export const mapViewportStore = new MapViewportStore();
