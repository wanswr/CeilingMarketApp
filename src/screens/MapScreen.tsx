import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  ActivityIndicator, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS } from '../constants/theme';
import { OrderService } from '../services/OrderService';
import { formatDate } from '../utils/date';
import i18n from '../constants/i18n';

const MapScreen = ({ navigation }: any) => {
  const mapRef = useRef<MapView>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [radius, setRadius] = useState('10');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Unified fetch emitter
  const emitFetchOrders = async (lat: number, lng: number, latDelta?: number) => {
    try {
      const data = await OrderService.getNearbyOrders({
        lat,
        lng,
        radius: Number(radius),
        minPrice: budgetMin ? Number(budgetMin) : undefined,
        latDelta
      });
      setOrders(data);
    } catch (e) {
      console.error("MapScreen fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation(loc);
          // Initial fetch from current position
          emitFetchOrders(loc.coords.latitude, loc.coords.longitude);
        } else {
          setLoading(false);
        }
      })();
    }, [radius, budgetMin])
  );

  // Thin client: only emits events when movement STOPS
  const handleRegionChangeComplete = (region: Region) => {
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);

    // Debounce to ensure stability
    fetchTimeout.current = setTimeout(() => {
      emitFetchOrders(region.latitude, region.longitude, region.latitudeDelta);
    }, 800);
  };

  const centerToUser = async () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  if (loading) return (
    <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: '#fff'}}>
      <ActivityIndicator size={50} color={COLORS.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      {viewMode === 'map' ? (
        <>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: location?.coords.latitude || 55.751244,
              longitude: location?.coords.longitude || 37.618423,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
            showsUserLocation={true}
            onPress={() => setSelectedOrder(null)}
            onRegionChangeComplete={handleRegionChangeComplete}
            customMapStyle={mapStyle}
            mapPadding={{ top: 0, right: 0, bottom: selectedOrder ? 250 : 0, left: 0 }}
          >
            {orders.map(order => (
              <Marker
                key={order.id}
                coordinate={{
                  latitude: order.latitude,
                  longitude: order.longitude
                }}
                onPress={(e) => {
                  e.stopPropagation();
                  setSelectedOrder(order);
                }}
                tracksViewChanges={false}
              >
                <View style={[styles.customMarker, selectedOrder?.id === order.id && styles.customMarkerActive]}>
                  <Text style={[styles.markerPrice, selectedOrder?.id === order.id && styles.markerPriceActive]}>
                    {order.price >= 1000 ? `${(order.price / 1000).toFixed(1)}k` : order.price}
                  </Text>
                </View>
              </Marker>
            ))}
          </MapView>

          <SafeAreaView style={styles.headerOverlay}>
            <BlurView intensity={80} tint="light" style={styles.searchBar}>
              <Ionicons name="search" size={20} color={COLORS.gray} style={{ marginLeft: 15 }} />
              <TextInput
                placeholder="Поиск заказов..."
                style={styles.searchInput}
                placeholderTextColor={COLORS.gray}
              />
              <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
                <Ionicons name="options-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </BlurView>
          </SafeAreaView>

          <TouchableOpacity style={styles.myLocationBtn} onPress={centerToUser}>
             <Ionicons name="locate" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </>
      ) : (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
           <FlatList
            data={orders}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
              >
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle} numberOfLines={1}>{item.address}</Text>
                  <Text style={styles.listPrice}>{item.price} ₽</Text>
                </View>
                <View style={styles.listFooter}>
                    <Text style={styles.distanceValue}>{item.distance?.toFixed(1)} км</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      )}

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
                        navigation.navigate('Chats', { orderId: selectedOrder.id });
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
    </View>
  );
};

const mapStyle = [
  {
    "featureType": "poi",
    "elementType": "labels.text",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "transit",
    "elementType": "labels.text",
    "stylers": [{ "visibility": "off" }]
  }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  map: { width: '100%', height: '100%' },
  headerOverlay: { position: 'absolute', top: 10, left: 0, right: 0, zIndex: 10 },
  searchBar: {
    marginHorizontal: 20,
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
    ...SHADOWS.medium
  },
  customMarker: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.soft
  },
  customMarkerActive: {
    backgroundColor: COLORS.primary,
    borderColor: '#fff',
    transform: [{ scale: 1.1 }]
  },
  markerPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  markerPriceActive: {
    color: '#fff'
  },
  previewCardContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 10 : 10,
    left: 12,
    right: 12,
    zIndex: 1000,
  },
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
  previewTitle: { fontSize: 17, fontWeight: '900', color: COLORS.dark, marginBottom: 4, letterSpacing: -0.5 },
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
  listItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  listTitle: { fontSize: 16, fontWeight: 'bold' },
  listPrice: { fontSize: 16, color: COLORS.success, fontWeight: 'bold' },
  listFooter: { marginTop: 5 },
  distanceValue: { color: COLORS.primary, fontWeight: 'bold' }
});

export default MapScreen;
