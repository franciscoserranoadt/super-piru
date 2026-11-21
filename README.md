# Súper Piru

Juego de plataformas para Android protagonizado por Piru, la piruleta de La Piruleta Café Pan.

- 4 mundos: Pradera Dulce, Cueva de Cristal, Reino de las Nubes y Castillo de Chicle (con jefe final).
- Gráficos vectoriales dibujados a la resolución nativa de la pantalla.
- Controles táctiles, mando Bluetooth o teclado.

## Cómo se genera la APK
Cada vez que se sube un cambio a `main`, GitHub Actions compila la APK firmada
y la publica en **Releases → "Súper Piru (última versión)"**.

La firma es siempre la misma (`superpiru.jks` + secreto `KEYSTORE_PASS`),
así que cada versión nueva se instala encima de la anterior sin perder el progreso.
