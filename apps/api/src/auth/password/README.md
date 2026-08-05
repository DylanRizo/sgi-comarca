# Recurso local de contraseñas comunes

Este recurso se deriva de `Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt` de SecLists 2026.1.

- Repositorio: `https://github.com/danielmiessler/SecLists`
- Licencia del proyecto de origen: MIT
- Tag: `2026.1`
- Commit fijado: `190c6f7bd58c847ceadfe57d9853592737f059e8`
- SHA-256 del archivo de origen: `1472aafa2561df5e3293aee252aee3ca660c12b399a283cf808bb01b39be388b`
- SHA-256 del contenido normalizado generado: `39dc5b329c811578d72f3788626743778b34c4333bd2508e8fa2bf549ce88460`
- Entradas generadas: 483

El subconjunto conserva, en el orden original, todas las entradas únicas cuya forma NFC en minúsculas tiene entre 12 y 128 puntos de código. El archivo original de 100 000 entradas no se incorpora al repositorio.

Para reproducirlo, descarga manualmente el archivo del commit fijado a una ruta temporal y ejecuta:

```powershell
node apps/api/src/auth/password/generate-common-passwords.mjs <ruta-al-archivo-temporal>
pnpm format
```

El generador rechaza un archivo cuyo checksum o número de entradas resultante no coincida. La aplicación importa únicamente el módulo generado; no descarga contenido durante login, build o ejecución.
