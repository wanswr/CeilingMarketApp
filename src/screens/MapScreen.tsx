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
import MapView, { Marker, PROVIDER_GOOGLE, Circle } from 'react-native-maps';
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS } from '../constants/theme';
import { apiService } from '../services/ApiService';
import { formatDate } from '../utils/date';
import i18n from '../constants/i18n';

const MapScreen = ({ navigation }: any) => {
  const mapRef = useRef<MapView>(null);
  const [showGas, setShowGas] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [radius, setRadius] = useState('10');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [sortBy, setSortBy] = useState<'distance' | 'price-desc' | 'price-asc'>('distance');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation(loc);
          fetchOrders(loc);
        } else {
          setLoading(false);
        }
      })();
    }, [radius, budgetMin])
  );

  const fetchOrders = async (currentLocation: any) => {
    if (!currentLocation) return;
    try {
      const params = {
        lat: currentLocation.coords.latitude,
        lng: currentLocation.coords.longitude,
        radius: Number(radius),
        minPrice: budgetMin ? Number(budgetMin) : undefined,
        status: 'PENDING'
      };
      console.log("[MapScreen] Fetching orders with params:", params);
      const response = await apiService.getOrders(params);
      console.log("[MapScreen] Orders received:", response.data.length);
      setOrders(response.data);
    } catch (e) {
      console.error("Error fetching orders:", e);
    } finally {
      setLoading(false);
    }
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
            customMapStyle={mapStyle}
          >
            {orders.map(order => (
              <Marker
                key={order.id}
                coordinate={{
                  latitude: order.latitude,
                  longitude: order.longitude
                }}
                onPress={() => setSelectedOrder(order)}
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
        <BlurView intensity={95} tint="light" style={styles.previewCard}>
           <View style={styles.previewRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTitle} numberOfLines={1}>{selectedOrder.title || selectedOrder.address}</Text>
                <View style={styles.previewMeta}>
                  <Ionicons name="location" size={14} color={COLORS.primary} />
                  <Text style={styles.previewAddress} numberOfLines={1}>{selectedOrder.address}</Text>
                </View>
              </View>
              <View style={styles.priceBadge}>
                <Text style={styles.previewPrice}>{selectedOrder.price} ₽</Text>
              </View>
           </View>

           <View style={styles.previewFooter}>
             <View style={styles.employerInfo}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{(selectedOrder.employer?.name || 'U')[0]}</Text>
                </View>
                <Text style={styles.employerName}>{selectedOrder.employer?.name || 'Заказчик'}</Text>
                <Ionicons name="star" size={14} color={COLORS.warning} style={{ marginLeft: 4 }} />
                <Text style={styles.ratingText}>{selectedOrder.employer?.rating?.toFixed(1) || '5.0'}</Text>
             </View>

             <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('OrderDetail', { orderId: selectedOrder.id })}
              >
                <Text style={styles.actionBtnText}>Откликнуться</Text>
              </TouchableOpacity>
           </View>
        </BlurView>
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
  previewCard: {
    position: 'absolute',
    bottom: 40,
    left: 15,
    right: 15,
    borderRadius: 24,
    padding: 20,
    ...SHADOWS.heavy,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden'
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  previewTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 4 },
  previewMeta: { flexDirection: 'row', alignItems: 'center' },
  previewAddress: { fontSize: 13, color: COLORS.gray, marginLeft: 4, flex: 1 },
  priceBadge: { backgroundColor: 'rgba(45, 91, 255, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  previewPrice: { fontSize: 18, color: COLORS.primary, fontWeight: '800' },
  previewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 15 },
  employerInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  employerName: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  ratingText: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  actionBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, ...SHADOWS.soft },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  listItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  listTitle: { fontSize: 16, fontWeight: 'bold' },
  listPrice: { fontSize: 16, color: COLORS.success, fontWeight: 'bold' },
  listFooter: { marginTop: 5 },
  distanceValue: { color: COLORS.primary, fontWeight: 'bold' }
});

export default MapScreen;
