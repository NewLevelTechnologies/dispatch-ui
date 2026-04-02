// Notification Service API Client
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

// Create separate axios instance for notification service
const notificationClient = axios.create({
  baseURL: import.meta.env.VITE_NOTIFICATION_SERVICE_URL ||
           'https://notification-service.dev.dispatch.newleveltech.com/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to all requests
notificationClient.interceptors.request.use(
  async (config) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error fetching auth session:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default notificationClient;
