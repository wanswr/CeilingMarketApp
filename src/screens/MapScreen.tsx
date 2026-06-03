import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  ActivityIndicator, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform,
  Dimensions,
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
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [radius, setRadius] = useState('');
  const [filterByArea, setFilterByArea] = useState(false);
  const [mapRegion, setMapRegion] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const role = orderService.getCurrentRole();

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
      setOrders(newOrders);
    };

    orderService.on('ordersUpdated', updateOrders);
    const initialOrders = orderService.getOrders();
    if (initialOrders.length > 0) {
      setOrders(initialOrders);
    }

    return () => { orderService.off('ordersUpdated', updateOrders); };
  }, []);

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(o => ['pending', 'new', 'accepted', 'in_work', 'executing'].includes(o.status));

    if (budgetMin) {
      filtered = filtered.filter(o => Number(o.price) >= Number(budgetMin));
    }

    if (filterByArea && mapRegion) {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
      const minLat = latitude - latitudeDelta / 2;
      const maxLat = latitude + latitudeDelta / 2;
      const minLng = longitude - longitudeDelta / 2;
      const maxLng = longitude + longitudeDelta / 2;

      filtered = filtered.filter(o => {
        const coord = o.coordinates || o.location;
        if (!coord) return false;
        const lat = Number(coord.latitude);
        const lng = Number(coord.longitude);
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });
    }

    if (radius && location && !filterByArea) {
      filtered = filtered.filter(o => {
        const coord = o.coordinates || o.location;
        if (!coord) return false;
        const dist = calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          Number(coord.latitude),
          Number(coord.longitude)
        );
        return dist <= Number(radius);
      });
    }

    return filtered;
  }, [orders, budgetMin, radius, location, filterByArea, mapRegion]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

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
        onPress={handleMapPress}
        onRegionChangeComplete={setMapRegion}
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
        
        {location && radius && (
          <Circle
            center={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            }}
            radius={Number(radius) * 1000}
            strokeColor="rgba(0,122,255,0.3)"
            fillColor="rgba(0,122,255,0.1)"
          />
        )}

        {filteredOrders.map(order => {
          const coord = order.coordinates || order.location;
          const key = `${order.id}-${order.updatedAt || order.createdAt || Date.now()}`;
          if (!coord) return null;

          const lat = Number(coord.latitude);
          const lng = Number(coord.longitude);

          if (isNaN(lat) || isNaN(lng)) return null;

          return (
            <Marker
              key={key}
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
      ) : (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <FlatList
            data={filteredOrders}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
              >
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle} numberOfLines={1}>{item.address}</Text>
                  <Text style={styles.listPrice}>{item.price} ₽</Text>
                </View>
                <Text style={styles.listDetails} numberOfLines={2}>{item.details}</Text>
                <View style={styles.listFooter}>
                  <Text style={styles.listDate}>{formatDate(item.date || item.timestamp)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gray} />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={48} color={COLORS.border} />
                <Text style={styles.emptyText}>Заказы не найдены</Text>
              </View>
            )}
          />
        </SafeAreaView>
      )}

      <SafeAreaView style={styles.controlsContainer}>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
          >
            <Ionicons name={viewMode === 'map' ? 'list' : 'map'} size={18} color={COLORS.primary} />
            <Text style={styles.btnText}>{viewMode === 'map' ? 'Список' : 'Карта'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btn}
            onPress={() => setFilterModalVisible(true)}
          >
            <Ionicons name="filter" size={18} color={COLORS.primary} />
            <Text style={styles.btnText}>Фильтр</Text>
            {(budgetMin || radius || filterByArea) && <View style={styles.filterDot} />}
          </TouchableOpacity>

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

      <Modal visible={filterModalVisible} animationType="slide" transparent={true}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalContent}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Фильтры заказов</Text>
                <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                  <Ionicons name="close" size={24} color={COLORS.dark} />
                </TouchableOpacity>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Минимальный бюджет (₽)</Text>
                <TextInput
                  style={styles.filterInput}
                  keyboardType="numeric"
                  placeholder="Напр: 5000"
                  value={budgetMin}
                  onChangeText={setBudgetMin}
                />
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Радиус поиска (км)</Text>
                <TextInput
                  style={[styles.filterInput, filterByArea && { opacity: 0.5 }]}
                  keyboardType="numeric"
                  placeholder="Напр: 10"
                  value={radius}
                  onChangeText={setRadius}
                  editable={!filterByArea}
                />
              </View>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setFilterByArea(!filterByArea)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Искать в видимой области</Text>
                  <Text style={styles.toggleSub}>Показывать только те заказы на экране</Text>
                </View>
                <View style={[styles.toggleSwitch, filterByArea && styles.toggleActive]}>
                  <View style={[styles.toggleDot, filterByArea && styles.toggleDotActive]} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => { setBudgetMin(''); setRadius(''); setFilterByArea(false); }}
              >
                <Text style={styles.resetBtnText}>Сбросить все</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.applyBtnText}>Применить</Text>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {selectedOrder && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{selectedOrder.address}</Text>
            <Text style={styles.previewPrice}>{selectedOrder.price} ₽</Text>
          </View>
          <Text style={styles.previewDetails} numberOfLines={2}>{selectedOrder.details}</Text>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.light }]}
              onPress={() => navigation.navigate('OrderDetail', { orderId: selectedOrder.id })}
            >
              <Ionicons name="information-circle-outline" size={18} color={COLORS.dark} />
              <Text style={styles.actionBtnText}>Детали</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.light }]}
              onPress={() => navigation.navigate('Chats')}
            >
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.secondary} />
              <Text style={[styles.actionBtnText, { color: COLORS.secondary }]}>Чат</Text>
            </TouchableOpacity>

            {role === 'worker' && selectedOrder.status === 'pending' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                onPress={async () => {
                  const hasSub = await orderService.checkSubscription();
                  if (hasSub) {
                    orderService.applyForOrder(selectedOrder.id, 'me');
                    Alert.alert("Успех", "Вы откликнулись на заказ!");
                  } else {
                    Alert.alert("Подписка", "Для отклика требуется активная подписка.");
                  }
                }}
              >
                <Ionicons name="flash-outline" size={16} color="#fff" />
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Отклик</Text>
              </TouchableOpacity>
            )}

            {role === 'employer' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => navigation.navigate('Orders')}
              >
                <Ionicons name="list-outline" size={16} color="#fff" />
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Заказы</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
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
  filterDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
  },
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
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  actionBtnText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.dark,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray,
    marginBottom: 10,
  },
  filterInput: {
    backgroundColor: COLORS.light,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: COLORS.dark,
    fontWeight: '600',
  },
  resetBtn: {
    alignItems: 'center',
    marginBottom: 15,
    marginTop: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: COLORS.light,
    padding: 15,
    borderRadius: 16,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.dark,
  },
  toggleSub: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D1D6',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: COLORS.success,
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleDotActive: {
    alignSelf: 'flex-end',
  },
  resetBtnText: {
    color: COLORS.danger,
    fontWeight: '700',
  },
  applyBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  listItem: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.light,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark,
    flex: 1,
    marginRight: 10,
  },
  listPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  listDetails: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 12,
  },
  listFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listDate: {
    fontSize: 12,
    color: COLORS.gray,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: 15,
    fontSize: 16,
    color: COLORS.gray,
    fontWeight: '500',
  },
});

export default MapScreen;