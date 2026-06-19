
import { Region } from 'react-native-maps';

class MapViewportStore {
    private currentRegion: Region = {
        latitude: 55.751244,
        longitude: 37.618423,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
    };

    private subscribers: Set<(region: Region) => void> = new Set();

    setRegion(region: Region) {
        if (this.currentRegion.latitude === region.latitude &&
            this.currentRegion.longitude === region.longitude &&
            this.currentRegion.latitudeDelta === region.latitudeDelta &&
            this.currentRegion.longitudeDelta === region.longitudeDelta) {
            return;
        }

        this.currentRegion = region;
        console.log('MAP_VIEWPORT_CHANGED', {
            lat: region.latitude.toFixed(3),
            lng: region.longitude.toFixed(3),
            delta: region.latitudeDelta.toFixed(3)
        });
        this.notify();
    }

    getRegion(): Region {
        return { ...this.currentRegion };
    }

    subscribe(callback: (region: Region) => void) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    private notify() {
        this.subscribers.forEach(cb => cb(this.currentRegion));
    }
}

export const mapViewportStore = new MapViewportStore();
