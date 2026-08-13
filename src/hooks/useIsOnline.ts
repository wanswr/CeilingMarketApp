import { useState, useEffect } from 'react';
import { networkService } from '../services/NetworkService';

export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(networkService.isOnline());

  useEffect(() => {
    const unsubscribe = networkService.subscribe((status) => {
      setIsOnline(status);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return isOnline;
}
