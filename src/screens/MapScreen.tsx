import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  ActivityIndicator, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform,
  Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/theme';
import { orderService, Order } from '../services/OrderService';
import { formatDate } from '../utils/date';

const MapScreen = ({ navigation }: any) => {
  const mapRef = useRef<MapView>(null);
  const [showGas, setShowGas] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [orders, setOrders] = useState<Order[]>(orderService.getOrders());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      }
      setLoading(false);
    })();

    const updateOrders = (newOrders: Order[]) => {
      console.log('MapScreen: Orders updated', newOrders.length);
      setOrders([...newOrders]);
    };

    orderService.on('ordersUpdated', updateOrders);
    // Explicitly fetch current orders in case listener hasn't fired yet
    setOrders(orderService.getOrders());

    return () => { orderService.off('ordersUpdated', updateOrders); };
  }, []);

  const toggleGas = () => {
    setShowGas(!showGas);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleProd = () => {
    setShowProd(!showProd);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const centerToUser = () => {
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

  const onMarkerPress = (order: Order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedOrder(order);
  };

  const handleMapPress = (e: any) => {
    // If we click on the map itself (not a marker), deselect
    if (e.nativeEvent.action !== 'marker-press') {
      setSelectedOrder(null);
    }
  };

  if (loading) return (
    <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: '#fff'}}>
      <ActivityIndicator size={50} color={COLORS.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
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
        onPress={handleMapPress}
      >
        {showGas && (
          <Marker 
            coordinate={{latitude: 55.765244, longitude: 37.638423}} 
            title="АГЗС" 
            pinColor="green" 
          />
        )}
        {showProd && (
          <Marker 
            coordinate={{latitude: 55.741244, longitude: 37.598423}} 
            title="Цех Производства" 
            pinColor="blue" 
          />
        )}
        
        {orders.filter(o => ['pending', 'new', 'accepted', 'in_work', 'executing'].includes(o.status)).map(order => {
          const coord = order.coordinates || order.location;
          if (!coord) return null;

          const lat = Number(coord.latitude);
          const lng = Number(coord.longitude);

          if (isNaN(lat) || isNaN(lng)) return null;

          return (
            <Marker
              key={order.id}
              coordinate={{
                latitude: lat,
                longitude: lng
              }}
              onPress={() => onMarkerPress(order)}
              pinColor={COLORS.primary}
            />
          );
        })}
      </MapView>

      <SafeAreaView style={styles.controlsContainer}>
        <View style={styles.controls}>
          <TouchableOpacity 
            style={styles.btn}
            onPress={() => setShowLayers(!showLayers)}
          >
            <Ionicons name="layers" size={18} color={COLORS.primary} />
            <Text style={styles.btnText}>Слои</Text>
          </TouchableOpacity>

          {showLayers && (
            <View style={styles.layersMenu}>
              <TouchableOpacity
                style={[styles.layerItem, showGas && styles.activeLayer]}
                onPress={toggleGas}
              >
                <Ionicons name="flame" size={16} color={showGas ? "#fff" : "#000"} />
                <Text style={[styles.layerText, {color: showGas ? "#fff" : "#000"}]}>АГЗС</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.layerItem, showProd && styles.activeLayer]}
                onPress={toggleProd}
              >
                <Ionicons name="business" size={16} color={showProd ? "#fff" : "#000"} />
                <Text style={[styles.layerText, {color: showProd ? "#fff" : "#000"}]}>Цех</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.btn}
            onPress={centerToUser}
          >
            <Ionicons name="locate" size={18} color="#000" />
            <Text style={styles.btnText}>Где я</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {selectedOrder && (
        <TouchableOpacity 
          style={styles.previewCard} 
          activeOpacity={0.9}
          onPress={() => navigation.navigate('OrderDetail', { orderId: selectedOrder.id })}
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{selectedOrder.address}</Text>
            <Text style={styles.previewPrice}>{selectedOrder.price} ₽</Text>
          </View>
          <Text style={styles.previewDetails} numberOfLines={2}>{selectedOrder.details}</Text>
          <View style={styles.previewFooter}>
            <View style={styles.previewTag}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.gray} />
              <Text style={styles.previewTagText}>
                {formatDate(selectedOrder.date || selectedOrder.timestamp)}
              </Text>
            </View>
            <Text style={styles.tapHint}>Нажмите, чтобы открыть</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  controlsContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 15 },
  controls: { 
    backgroundColor: 'rgba(255,255,255,0.95)', 
    padding: 6, 
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8
  },
  btn: { 
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 5, borderRadius: 15, backgroundColor: '#fff'
  },
  activeGas: { backgroundColor: COLORS.success },
  activeLayer: { backgroundColor: COLORS.primary },
  btnText: { marginLeft: 8, fontWeight: '700', fontSize: 12 },
  layersMenu: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 5,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  layerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  layerText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  pinMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

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
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  previewTitle: { fontSize: 17, fontWeight: 'bold', color: '#1C1C1E', flex: 1, marginRight: 10 },
  previewPrice: { fontSize: 18, fontWeight: 'bold', color: COLORS.success },
  previewDetails: { fontSize: 14, color: COLORS.gray, marginBottom: 12 },
  previewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewTag: { flexDirection: 'row', alignItems: 'center' },
  previewTagText: { fontSize: 12, color: COLORS.gray, marginLeft: 4 },
  tapHint: { fontSize: 11, color: COLORS.primary, fontWeight: '600' }
});

export default MapScreen;