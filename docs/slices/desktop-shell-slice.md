---
id: desktop-shell-slice
category: slices
tags:
- slice
- generality
aliases:
- Desktop Shell slice
related:
- slices-index
version: 1.0
status: active
---

# Desktop Shell — Slice Generalities

## What this slice is

Shell Electron que hospeda la aplicación de escritorio: proceso main, preload, IPC tipado, supervisor del core Go, ventana, menú y política CSP.

## Boundaries

- **IN:** `apps/electron/**`.
- **OUT:** core Go, renderer Angular y contratos.

## Entry points

- `apps/electron/src/main/main.ts` — arranque del proceso main.
- `apps/electron/src/main/supervisor.ts` — gestión del ciclo de vida del core Go.
- `apps/electron/src/main/go-core-client.ts` — cliente gRPC.
- `apps/electron/src/preload/preload.ts` — preload único.
- `apps/electron/src/ipc/` — canales, handlers y eventos.

## How it works

- El supervisor lanza y vigila el core Go: espera `GO_CORE_READY`, hace `Ping` cada 5s y rota el token de sesión.
- El cliente gRPC habla con el core por el socket/named pipe.
- Un único preload con `contextIsolation`.
- CSP definida en `apps/electron/src/window/csp.ts`.

## Conventions of this slice

- El IPC usa canales tipados definidos en `apps/electron/src/ipc/channels.ts`.
- Un solo preload.
- `MOCK_GO_CORE=1` habilita el desarrollo sin core real.

## Dependencies

- **Upstream:** core Go (gRPC) y contratos.
- **Downstream:** renderer Angular.

## Known gaps & accepted debt

- e2e apoyado en mocks.
- Packaging (`electron-builder`) aún sin configurar.
