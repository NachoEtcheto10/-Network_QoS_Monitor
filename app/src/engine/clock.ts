// Hermes expone performance.now(), pero los tipos de React Native no lo declaran.
declare const performance: { now(): number };

/** Reloj monotónico en ms: inmune a los ajustes de hora del sistema. */
export const now = (): number => performance.now();
