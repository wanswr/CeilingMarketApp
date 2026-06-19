
import { mapEngine } from './src/services/MapEngine';
import { entityStore } from './src/services/EntityStore';
import { socketService } from './src/services/SocketService';

async function simulateSession() {
    console.log('--- STARTING SIMULATED SESSION ---');

    // 1. Initial State
    console.log('MAP_SCREEN_MOUNT');
    const unsubscribe1 = mapEngine.subscribe((orders) => {
        console.log('MAP_RENDER', {
            count: orders.length,
            source: 'entityStore',
            region: { lat: "55.751", lng: "37.618", delta: "0.100" }
        });
    }, 'MapScreen');

    console.log('MAP_FOCUS');

    // 2. Hydration
    await entityStore.hydrate(); // This will log MAP_DATA_SOURCE: STORAGE

    // 3. Initial Load
    await mapEngine.initialLoad(55.751, 37.618); // Logs SPATIAL_FETCH_START/END and MAP_DATA_SOURCE: API

    // 4. Map Interaction
    console.log('MAP_REGION_CHANGED', { lat: "55.755", lng: "37.620", delta: "0.050" });
    await mapEngine.syncMap(false, { latitude: 55.755, longitude: 37.620, latitudeDelta: 0.05, longitudeDelta: 0.05 });

    // 5. Navigation to Orders
    console.log('MAP_BLUR');
    console.log('[NAVIGATION] current route: Orders');
    console.log('[NAVIGATION] previous route: Map');

    // Simulate OrdersListScreen subscription
    const unsubscribe2 = mapEngine.subscribe((orders) => {
        // ...
    }, 'OrdersListScreen');

    // 6. Navigation back to Map
    console.log('MAP_FOCUS');
    console.log('[NAVIGATION] current route: Map');
    console.log('[NAVIGATION] previous route: Orders');

    // 7. Cleanup (Unmount)
    console.log('MAP_SCREEN_UNMOUNT');
    unsubscribe1();

    console.log('--- SESSION END ---');
}

// We can't easily run this because of React Native dependencies (AsyncStorage, etc.)
// But I can provide this as a "Scenario script" for the user.
