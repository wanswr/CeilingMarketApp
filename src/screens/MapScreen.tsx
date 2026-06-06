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
import MapView, { Marker, PROVIDER_GOOGLE, Circle } from 'react-native-maps';
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/theme';
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

  useEffect(() => {
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
  }, []);

  const fetchOrders = async (currentLocation: any) => {
    try {
      const params = {
        lat: currentLocation.coords.latitude,
        lng: currentLocation.coords.longitude,
        radius: radius,
        minPrice: budgetMin,
      };
      const response = await apiService.getOrders(params);
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
        >
          {orders.map(order => (
            <Marker
              key={order.id}
              coordinate={{
                latitude: order.latitude,
                longitude: order.longitude
              }}
              onPress={() => setSelectedOrder(order)}
              pinColor={COLORS.primary}
            />
          ))}
        </MapView>
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
        <View style={styles.previewCard}>
           <Text style={styles.previewTitle}>{selectedOrder.address}</Text>
           <Text style={styles.previewPrice}>{selectedOrder.price} ₽</Text>
           <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('OrderDetail', { orderId: selectedOrder.id })}
            >
              <Text style={styles.actionBtnText}>Детали</Text>
            </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  previewCard: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 15
  },
  previewTitle: { fontSize: 17, fontWeight: 'bold' },
  previewPrice: { fontSize: 18, color: COLORS.success, fontWeight: 'bold' },
  actionBtn: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: 'bold' },
  listItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  listTitle: { fontSize: 16, fontWeight: 'bold' },
  listPrice: { fontSize: 16, color: COLORS.success, fontWeight: 'bold' },
  listFooter: { marginTop: 5 },
  distanceValue: { color: COLORS.primary, fontWeight: 'bold' }
});

export default MapScreen;
