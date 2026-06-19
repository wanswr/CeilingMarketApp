import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  ActivityIndicator, 
  TouchableOpacity, 
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS } from '../constants/theme';
import { mapEngine } from '../services/MapEngine';
import { mapViewportStore } from '../services/MapViewportStore';
import { formatDate } from '../utils/date';
import { Order } from '../types';
import ErrorBoundary from '../components/common/ErrorBoundary';

const MapScreen = ({ navigation }: any) => {
  const mapRef = useRef<MapView>(null);
  const [allOrders, setAllOrders] = useState<Order[]>(mapEngine.getOrders());
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>(mapViewportStore.getRegion());
  const [isMoving, setIsMoving] = useState(false);
  const movingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 0. Lifecycle Logging
  useEffect(() => {
    console.log('MAP_SCREEN_MOUNT');
    return () => console.log('MAP_SCREEN_UNMOUNT');
  }, []);

  // 1. Subscriptions
  useEffect(() => {
    const unsubscribeOrders = mapEngine.subscribe((newOrders) => {
      setAllOrders([...newOrders]);
      setLoading(false);
    }, 'MapScreen');

    const unsubscribeViewport = mapViewportStore.subscribe((newRegion) => {
      setRegion(newRegion);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeViewport();
    };
  }, []);

  const fitToOrders = useCallback((orders: Order[]) => {
    if (!orders || orders.length === 0 || !mapRef.current) return;

    const coords = orders
      .map(o => mapEngine.getOrderCoords(o))
      .filter(Boolean) as { latitude: number, longitude: number }[];

    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: {
            top: 80,
            right: 80,
            bottom: selectedOrder ? 300 : 250,
            left: 80
        },
        animated: true,
      });
    }
  }, [selectedOrder]);

  // 2. Focus Logic
  useFocusEffect(
    useCallback(() => {
      console.log('MAP_FOCUS');

      const orders = mapEngine.getOrders();
      if (orders.length > 0) {
          console.log('[MapScreen] Focus: using cached state');
          mapRef.current?.animateToRegion(mapViewportStore.getRegion(), 500);
          return;
      }

      (async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({});
              setLocation(loc);
              const userRegion = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.25,
                longitudeDelta: 0.25
              };
              mapViewportStore.setRegion(userRegion);
              await mapEngine.initialLoad(loc.coords.latitude, loc.coords.longitude);
              mapRef.current?.animateToRegion(userRegion, 500);

              const currentOrders = mapEngine.getOrders();
              if (currentOrders.length > 0) {
                  setTimeout(() => fitToOrders(currentOrders), 1500);
              }
            } else {
              const fallback = mapViewportStore.getRegion();
              await mapEngine.initialLoad(fallback.latitude, fallback.longitude);
              const currentOrders = mapEngine.getOrders();
              if (currentOrders.length > 0) {
                  setTimeout(() => fitToOrders(currentOrders), 1000);
              }
            }
        } catch (e) {
            console.error('[MapScreen] Init Error:', e);
        }
      })();

      return () => console.log('MAP_BLUR');
    }, [fitToOrders])
  );

  const handleRegionChangeComplete = (newRegion: Region) => {
    if (!newRegion || !newRegion.latitude || !newRegion.longitude) return;

    if (movingTimeoutRef.current) clearTimeout(movingTimeoutRef.current);
    movingTimeoutRef.current = setTimeout(() => setIsMoving(false), 300);

    mapViewportStore.setRegion(newRegion);
    mapEngine.triggerMapUpdate(newRegion);
  };

  // 3. UI Clustering
  const displayedItems = useMemo(() => {
    const padding = region.latitudeDelta * 0.2;
    const candidates = mapEngine.getOrdersInBounds(
        region.latitude - region.latitudeDelta - padding,
        region.latitude + region.latitudeDelta + padding,
        region.longitude - region.longitudeDelta - padding,
        region.longitude + region.longitudeDelta + padding
    );

    let result = mapEngine.clusterOrders(candidates, region.latitudeDelta);
    if (region.latitudeDelta > 2) {
        result = result.filter((item: any) => item.isCluster);
    }
    return result;
  }, [allOrders, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  const safeItems = useMemo(() => {
      return displayedItems.filter(item => {
          const coords = mapEngine.getOrderCoords(item as any);
          return coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
      });
  }, [displayedItems]);

  const centerToUser = async () => {
    if (location && mapRef.current) {
      const userRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
      };
      mapRef.current.animateToRegion(userRegion, 1000);
      mapViewportStore.setRegion(userRegion);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  useEffect(() => {
      if (!isMoving) {
          console.log('MAP_RENDER', {
              count: allOrders.length,
              visible: safeItems.length,
              loading,
              source: 'entityStore',
              region: {
                  lat: region.latitude.toFixed(3),
                  lng: region.longitude.toFixed(3),
                  delta: region.latitudeDelta.toFixed(3)
              }
          });
      }
  }, [allOrders.length, safeItems.length, loading, isMoving, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={styles.map}
          initialRegion={region}
          showsUserLocation={true}
          onPress={() => setSelectedOrder(null)}
          onRegionChange={() => { if (!isMoving) setIsMoving(true); }}
          onRegionChangeComplete={handleRegionChangeComplete}
          onPanDrag={() => { if (!isMoving) setIsMoving(true); console.log('[MAP] PAN_DRAG'); }}
          onMapReady={() => console.log('[MAP] READY')}
          customMapStyle={mapStyle}
          mapPadding={{ top: 0, right: 0, bottom: selectedOrder ? 250 : 0, left: 0 }}
        >
          {!isMoving && safeItems.map((item: any) => {
            const coords = mapEngine.getOrderCoords(item);
            if (!coords) return null;

            if (item.isCluster) {
              return (
                <Marker
                  key={item.id}
                  coordinate={coords}
                  onPress={() => {
                      mapRef.current?.animateToRegion({
                          latitude: coords.latitude,
                          longitude: coords.longitude,
                          latitudeDelta: region.latitudeDelta / 4,
                          longitudeDelta: region.longitudeDelta / 4,
                      }, 500);
                  }}
                >
                  <View style={[styles.clusterMarker, item.type === 'strong' && styles.clusterMarkerStrong]}>
                    <Text style={styles.clusterText}>{item.count}</Text>
                  </View>
                </Marker>
              );
            }

            return (
              <Marker
                key={item.id}
                coordinate={coords}
                onPress={(e) => {
                  e.stopPropagation();
                  setSelectedOrder(item);
                }}
                tracksViewChanges={false}
              >
                <View style={[
                  styles.customMarker,
                  selectedOrder?.id === item.id && styles.customMarkerActive,
                  item.status === 'HAS_RESPONSES' && !selectedOrder?.id && { borderColor: '#F59E0B' }
                ]}>
                  <Text style={[
                    styles.markerPrice,
                    selectedOrder?.id === item.id && styles.markerPriceActive,
                    item.status === 'HAS_RESPONSES' && !selectedOrder?.id && { color: '#F59E0B' }
                  ]}>
                    {Number(item.price) >= 1000 ? `${(Number(item.price) / 1000).toFixed(1)}k` : item.price}
                  </Text>
                </View>
              </Marker>
            );
          })}
        </MapView>

        <SafeAreaView style={styles.headerOverlay} pointerEvents="box-none">
          <BlurView intensity={80} tint="light" style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.gray} style={{ marginLeft: 15 }} />
            <TextInput
              placeholder="Поиск заказов..."
              style={styles.searchInput}
              placeholderTextColor={COLORS.gray}
            />
            <TouchableOpacity style={styles.filterBtn} onPress={() => mapEngine.forceRefresh()}>
              <Ionicons name="refresh-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </BlurView>
        </SafeAreaView>

        <TouchableOpacity style={styles.myLocationBtn} onPress={centerToUser}>
           <Ionicons name="locate" size={24} color={COLORS.primary} />
        </TouchableOpacity>

        {selectedOrder && (
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => navigation.navigate('OrderDetail', { orderId: selectedOrder.id })}
            style={styles.previewCardContainer}
          >
            <BlurView intensity={100} tint="light" style={styles.previewCard}>
              <View style={styles.previewContent}>
                  <View style={styles.previewHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewTitle} numberOfLines={1}>{selectedOrder.title || selectedOrder.address}</Text>
                      <View style={styles.previewInfoRow}>
                        <View style={styles.infoBadge}>
                          <Ionicons name="calendar-outline" size={12} color={COLORS.gray} />
                          <Text style={styles.infoBadgeText}>{formatDate(selectedOrder.date)}</Text>
                        </View>
                        <View style={styles.infoBadge}>
                          <Ionicons name="navigate-outline" size={12} color={COLORS.primary} />
                          <Text style={[styles.infoBadgeText, { color: COLORS.primary }]}>{selectedOrder.distance?.toFixed(1) || '0.0'} км</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.priceBadge}>
                      <Text style={styles.previewPrice}>{selectedOrder.price} ₽</Text>
                    </View>
                  </View>

                  {selectedOrder.details && (
                    <Text style={styles.previewDetails} numberOfLines={2}>
                      {selectedOrder.details}
                    </Text>
                  )}

                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      style={styles.employerLink}
                      onPress={(e) => {
                        e.stopPropagation();
                        navigation.navigate('Profile', { userId: selectedOrder.employerId });
                      }}
                    >
                      <View style={styles.avatarSmall}>
                        <Text style={styles.avatarTextSmall}>{(selectedOrder.employer?.name || 'U')[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.employerNameSmall}>{selectedOrder.employer?.name || 'Заказчик'}</Text>
                        <View style={styles.ratingRowSmall}>
                          <Ionicons name="star" size={10} color={COLORS.warning} />
                          <Text style={styles.ratingTextSmall}>{selectedOrder.employer?.rating?.toFixed(1) || '5.0'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.previewActions}>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          navigation.navigate('MainTabs', { screen: 'Chats', params: { orderId: selectedOrder.id } });
                        }}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.primary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.mainActionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          navigation.navigate('OrderDetail', { orderId: selectedOrder.id });
                        }}
                      >
                        <Text style={styles.mainActionText}>Отклик</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
              </View>
            </BlurView>
          </TouchableOpacity>
        )}

        {loading && allOrders.length === 0 && (
            <View style={styles.loaderOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        )}
      </View>
    </ErrorBoundary>
  );
};

const mapStyle = [
  { "featureType": "poi", "elementType": "labels.text", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "elementType": "labels.text", "stylers": [{ "visibility": "off" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  map: { flex: 1, ...StyleSheet.absoluteFillObject },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  searchBar: {
    marginHorizontal: 20,
    marginTop: 10,
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.medium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)'
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.dark, paddingHorizontal: 10 },
  filterBtn: { padding: 10, marginRight: 5 },
  myLocationBtn: {
    position: 'absolute',
    right: 20,
    bottom: 220,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    zIndex: 5
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100
  },
  clusterMarker: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    ...SHADOWS.medium
  },
  clusterMarkerStrong: {
    backgroundColor: '#1E3A8A',
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  clusterText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  customMarker: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.soft
  },
  customMarkerActive: { backgroundColor: COLORS.primary, borderColor: '#fff', transform: [{ scale: 1.1 }] },
  markerPrice: { fontSize: 13, fontWeight: '900', color: COLORS.primary },
  markerPriceActive: { color: '#fff' },
  previewCardContainer: { position: 'absolute', bottom: 10, left: 12, right: 12, zIndex: 1000 },
  previewCard: {
    borderRadius: 24,
    ...SHADOWS.heavy,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
    elevation: 10,
  },
  previewContent: { padding: 16 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  previewTitle: { fontSize: 18, fontWeight: '900', color: COLORS.dark, marginBottom: 6, letterSpacing: -0.5 },
  previewInfoRow: { flexDirection: 'row', gap: 10 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.gray },
  priceBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, ...SHADOWS.soft },
  previewPrice: { fontSize: 16, color: '#fff', fontWeight: '900' },
  previewDetails: { fontSize: 13, color: COLORS.gray, marginBottom: 12, lineHeight: 18 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  employerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 8,
    borderRadius: 14,
    flex: 1,
    marginRight: 12
  },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarTextSmall: { color: '#fff', fontSize: 13, fontWeight: '800' },
  employerNameSmall: { fontSize: 12, fontWeight: '700', color: COLORS.dark },
  ratingRowSmall: { flexDirection: 'row', alignItems: 'center' },
  ratingTextSmall: { fontSize: 10, color: COLORS.gray, fontWeight: '600', marginLeft: 2 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mainActionBtn: {
    backgroundColor: COLORS.primary,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  mainActionText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});

export default MapScreen;
