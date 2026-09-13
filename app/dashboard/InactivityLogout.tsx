"use client";

import { useEffect, useRef } from "react";
import { logout } from "./actions";

const MINUTOS_INACTIVIDAD = 10;
const MS_INACTIVIDAD = MINUTOS_INACTIVIDAD * 60 * 1000;

// Aplica a todos los perfiles por igual — se monta una sola vez en el
// layout del panel, así que cubre cualquier pantalla dentro del sistema.
export default function InactivityLogout() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reiniciarTemporizador() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        void logout();
      }, MS_INACTIVIDAD);
    }

    const eventos = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    eventos.forEach((evento) => window.addEventListener(evento, reiniciarTemporizador));

    reiniciarTemporizador();

    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, reiniciarTemporizador));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return null;
}
