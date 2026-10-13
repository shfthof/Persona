import { Slot } from "expo-router";
import App from "../../App";
export default function Layout() {
  return (
    <>
      <App />
      <Slot />
    </>
  );
}
