import { GeoClusterService } from './GeoClusterService';
import { Order } from '../types';

describe('GeoClusterService', () => {
  const createMockOrder = (id: string, lat: number, lng: number): Order => ({
    id,
    employerId: 'e1',
    title: `Order ${id}`,
    address: 'Moscow',
    date: '2026-08-16',
    time: '12:00',
    price: 1000,
    squareMeters: 20,
    perimeter: 18,
    fixturesCount: 4,
    chandeliersCount: 1,
    curtainRodsCount: 2,
    workType: 'INSTALLATION',
    status: 'PUBLISHED',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    latitude: lat,
    longitude: lng,
  });

  const orders = Array.from({ length: 6 }, (_, i) =>
    createMockOrder(`o${i + 1}`, 55.75124 + i * 0.0001, 37.61842 + i * 0.0001)
  );

  it('returns individual markers for small latDelta (high zoom)', () => {
    const result = GeoClusterService.clusterOrders(orders, 0.005);
    expect(result).toHaveLength(6);
    expect(result.every((item) => !('isCluster' in item && item.isCluster))).toBe(true);
  });

  it('clusters orders for larger latDelta (low zoom)', () => {
    const result = GeoClusterService.clusterOrders(orders, 1.5);
    expect(result.length).toBeLessThan(orders.length);
    const cluster = result.find((item) => 'isCluster' in item && item.isCluster);
    expect(cluster).toBeDefined();
  });

  it('handles invalid or non-finite latDelta safely', () => {
    const resultNaN = GeoClusterService.clusterOrders(orders, NaN);
    expect(resultNaN).toBeDefined();
    expect(resultNaN.length).toBeGreaterThan(0);

    const resultInf = GeoClusterService.clusterOrders(orders, Infinity);
    expect(resultInf).toBeDefined();

    const resultNeg = GeoClusterService.clusterOrders(orders, -1);
    expect(resultNeg).toBeDefined();
  });
});
