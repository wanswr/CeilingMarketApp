
import { Region } from 'react-native-maps';

class MapViewportStore {
    private currentRegion: Region = {
        latitude: 55.751244,
        longitude: 37.618423,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
    };

    private subscribers: Map<string, (region: Region) => void> = new Map();
    private debounceTimer: NodeJS.Timeout | null = null;

    setRegion(region: Region) {
        if (this.currentRegion.latitude === region.latitude &&
            this.currentRegion.longitude === region.longitude &&
            this.currentRegion.latitudeDelta === region.latitudeDelta &&
            this.currentRegion.longitudeDelta === region.longitudeDelta) {
            return;
        }

        // 1. Update state immediately so getRegion() is always current
        this.currentRegion = region;

        // 2. Debounce notification to prevent heavy subscriber logic during rapid movement
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            if (__DEV__) {
                console.log('MAP_VIEWPORT_CHANGED', {
                    lat: region.latitude.toFixed(3),
                    lng: region.longitude.toFixed(3),
                    delta: region.latitudeDelta.toFixed(3)
                });
            }
            this.notify();
        }, 250);
    }

    getRegion(): Region {
        return { ...this.currentRegion };
    }

    subscribe(callback: (region: Region) => void, source: string) {
        this.subscribers.set(source, callback);
        console.log('MAP_VIEWPORT_SUBSCRIBE', { source, total: this.subscribers.size });
        return () => {
            this.subscribers.delete(source);
            console.log('MAP_VIEWPORT_UNSUBSCRIBE', { source, remaining: this.subscribers.size });
        };
    }

    private notify() {
        console.log('[MapViewportStore] notify, count:', this.subscribers.size);
        this.subscribers.forEach(cb => cb(this.currentRegion));
    }
}

export const mapViewportStore = new MapViewportStore();
