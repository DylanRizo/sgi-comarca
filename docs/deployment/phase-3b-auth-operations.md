# Runbook operativo de autenticación — FASE 3B

## Propósito y seguridad

Este runbook cubre operaciones manuales de bootstrap, invitación inicial,
recuperación break-glass y administración HTTP. Ejecútelas solo desde un
entorno local controlado, con backup verificado y `DATABASE_URL` apuntando al
ambiente intencionado. No imprima la URL, contraseña o cadena de conexión.

No ejecute estas CLI durante build, deploy o migraciones. No copie tokens a
logs, archivos, argumentos de proceso, historial o tickets. La entrega es
manual mediante un canal privado.

## Bootstrap estructural

Use el bootstrap después de aplicar las migraciones aprobadas y antes de emitir
la primera invitación:

```powershell
pnpm db:bootstrap
```

Es manual, transaccional, Serializable e idempotente. Espera exactamente seis
roles, 14 permisos, cuatro usuarios, 11 `UserRole`, 12 `RolePermission`, un
`UserPermission` directo y tres almacenes. Dylan es el único ADMIN asignado.
No crea contraseñas, sesiones o invitaciones, no reactiva grants revocados y se
niega a sobrescribir una matriz incompatible.

Antes de ejecutarlo:

1. confirme el ambiente sin imprimir secretos;
2. valide backup y estado de migraciones;
3. confirme que no se está ejecutando un bootstrap concurrente;
4. revise el resultado sanitizado y los conteos esperados.

Después de activar al primer ADMIN, el bootstrap puede verificar idempotencia,
pero no sustituye las operaciones administrativas ni modifica credenciales.

## Invitación inicial del ADMIN

Use exclusivamente antes de que exista un ADMIN activo:

```powershell
pnpm auth:bootstrap-admin-invitation
```

La CLI requiere stdin/stdout TTY, no acepta argumentos y solicita confirmación.
Comprueba la matriz y que exista exactamente un ADMIN asignado no deshabilitado
y ninguno activo. Invalida invitaciones pendientes anteriores, guarda solo el
SHA-256 de un token de 32 bytes y muestra el token una sola vez después del
commit.

Mantenga `DATABASE_URL` en el entorno de la sesión; no pase secretos como
argumentos ni escriba comandos que los incorporen al historial. Para entrega
manual, el operador puede construir fuera de logs:

```text
/activate#token=<TOKEN>
```

No guarde ni registre el token o la URL resultante. El token vence exactamente
24 horas después de crearse y es de un solo uso.

## Recuperación break-glass

Uso excepcional cuando se perdió la credencial del único ADMIN:

```powershell
pnpm auth:recover-admin
```

Requiere acceso local directo, TTY, confirmación, exactamente un ADMIN asignado
y una matriz compatible. No acepta argumentos ni opera sobre un ADMIN
deshabilitado. En una transacción revoca sesiones, invalida invitaciones,
revoca la credencial cuando existe, devuelve el usuario a
`PENDING_ACTIVATION`, limpia `activatedAt` y crea una invitación nueva de 24
horas. El token se muestra una sola vez después del commit.

La recuperación no crea otro ADMIN, no cambia roles/permisos y no es un
endpoint HTTP. Registre el incidente sin secretos y entregue el token mediante
un canal privado.

## Administración HTTP

Todas las rutas requieren sesión vigente, Host/Origin válidos, CSRF y permiso
efectivo; las respuestas usan `Cache-Control: no-store`.

| Endpoint | Permiso | Efecto |
|---|---|---|
| `POST /api/v1/users/:id/invitations` | `users.invitations.create` | Invitación para `PENDING_ACTIVATION`; token una vez |
| `POST /api/v1/users/:id/credentials/revoke` | `users.credentials.revoke` | Revoca credencial/sesiones y pasa `ACTIVE` a `PENDING_ACTIVATION` |
| `POST /api/v1/users/:id/sessions/revoke` | `users.sessions.revoke` | Revoca todas las sesiones del objetivo |
| `POST /api/v1/users/:id/deactivate` | `users.status.manage` | Pasa `ACTIVE` o `PENDING_ACTIVATION` a `DISABLED` |

El último ADMIN habilitado no puede ser desactivado ni sufrir revocación
administrativa de credencial. Sí se pueden revocar sus sesiones. Crear una
invitación es una operación separada de revocar credencial.

## Checklist previo a Railway

- [ ] `API_PUBLIC_URL` es el origen HTTPS exacto de la API.
- [ ] `WEB_ORIGINS` contiene únicamente orígenes web aprobados.
- [ ] `TRUST_PROXY_HOPS` es un entero positivo validado para la topología.
- [ ] `AUTH_CSRF_HMAC_SECRET_BASE64` contiene un secreto independiente de al
      menos 32 bytes, fuera de Git.
- [ ] `AUTH_ORIGIN_HMAC_SECRET_BASE64` usa otro secreto de al menos 32 bytes.
- [ ] La cookie efectiva es `__Host-sgi_session`, `Secure`, `HttpOnly`,
      `SameSite=Lax`, `Path=/` y sin `Domain`.
- [ ] HTTPS está forzado de extremo a extremo.
- [ ] Argon2id fue recalibrado en el ambiente objetivo sin bajar del piso
      aprobado.
- [ ] Backups y restauración fueron ensayados.
- [ ] Migraciones se aplican con `prisma migrate deploy`; no ejecutan bootstrap.
- [ ] `GET /api/v1/health` y `GET /api/v1/ready` pasan.
- [ ] Swagger permanece sin montar.
- [ ] Logs y plataforma no capturan cookies, tokens, passwords, hashes u
      orígenes completos.

La rotación de secretos HMAC requiere invalidar de manera controlada los
artefactos derivados que dependan de ellos y volver a ejecutar smoke tests. No
invente valores de producción ni los copie a este documento.
