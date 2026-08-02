# Mapa de dependencias de módulos

## Capas

```mermaid
flowchart TB
    HTTP["Controladores REST"] --> APP["Servicios de aplicación"]
    APP --> DOMAIN["Dominio y políticas"]
    APP --> PORTS["Puertos/repositorios"]
    INFRA["Prisma, cookies, hashing, exportación"] --> PORTS
    DOMAIN -. "sin depender" .-> INFRA
```

El dominio no importa NestJS, Prisma, Next.js ni tipos HTTP. Los adaptadores implementan puertos definidos por los módulos.

## Dependencias principales

```mermaid
flowchart LR
    AUTH[auth] --> USERS[users]
    AUTH --> ROLES[roles]
    USERS --> ROLES
    PRODUCTS[products] --> UNITS[units]
    PRODUCTS --> GROUPS[product-groups]
    INV[inventory] --> PRODUCTS
    INV --> WH[warehouses]
    MOV[stock-movements] --> PRODUCTS
    MOV --> WH
    RECEIPTS[stock-receipts] --> INV
    RECEIPTS --> MOV
    TRANSFERS[transfers] --> INV
    TRANSFERS --> MOV
    SALES[sales] --> INV
    SALES --> MOV
    FIN[finances] --> SALES
    CLOSE[daily-closings] --> SALES
    CLOSE --> FIN
    AUDITS[inventory-audits] --> INV
    AUDITS --> MOV
    REPORTS[reports] --> PRODUCTS
    REPORTS --> MOV
    REPORTS --> SALES
    ANALYTICS[analytics] --> INV
    ANALYTICS --> SALES
    ANALYTICS --> FIN
    IMPORTS[imports] --> PRODUCTS
    IMPORTS --> INV
    IMPORTS --> MOV
    IMPORTS --> SALES
    IMPORTS --> FIN
    IMPORTS --> CLOSE
    ALL["módulos mutadores"] --> LOGS[audit-logs]
```

## Reglas anti-ciclo

1. Catálogos no dependen de módulos operacionales.
2. `inventory` no depende de ventas, entradas o transferencias; recibe comandos con una referencia de origen.
3. `stock-movements` no modifica balances y no llama al origen.
4. `sales` puede leer productos y aplicar inventario, pero Finanzas consume ventas como lectura derivada; ventas no depende de Finanzas.
5. `reports`/`analytics` dependen de contratos de lectura, nunca de servicios mutadores.
6. `imports` es un orquestador offline/CLI; los módulos no dependen de él.
7. `audit-logs` es una dependencia terminal.

## Contratos entre módulos

Los módulos se comunican dentro del proceso mediante comandos/puertos tipados, por ejemplo:

- `InventoryPort.lockBalances(keys)`;
- `InventoryPort.applyDelta(source, productId, warehouseId, quantity)`;
- `StockMovementPort.append(movement)`;
- `SalesReadPort.completedSalesForDate(localDate)`;
- `AuditLogPort.append(entry)`.

No se introducen RPC internas, eventos asíncronos ni colas. Si un flujo requiere varias escrituras, comparte el cliente de transacción Prisma proporcionado por el coordinador.
