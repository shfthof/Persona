import { initializeApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  // Metro selects Firebase's native entry; the web type entry omits this adapter.
  // @ts-expect-error Native-only Firebase export.
  getReactNativePersistence,
} from "firebase/auth";
import { getDatabase } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
const config = {
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
const app = configured ? initializeApp(config) : null;
export const auth = app
  ? Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      })
  : null;
export const db = app ? getDatabase(app) : null;
