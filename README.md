# Truc Valencià

Aplicació web multijugador per jugar al Truc Valencià en línia. 4 jugadors, 2 equips, puntuació fins a 24 pedres.

## Stack

| Capa | Tecnologia |
|------|------------|
| Backend | Node.js + Express + Socket.io |
| Frontend | React + Vite |
| Base de dades | PostgreSQL 16 |
| Infraestructura | Docker Compose |

## Requisits

- Docker i Docker Compose
- Un servidor PostgreSQL accessible (o un contenidor Docker)
- Node.js 18+ (només per a desenvolupament local sense Docker)

## Posada en marxa

### 1. Clona el repositori

```bash
git clone https://github.com/jeroam92/truc-game.git
cd truc-game
```

### 2. Configura les variables d'entorn

```bash
cp .env.example .env
```

Edita `.env` amb els teus valors:

```env
# Base de dades PostgreSQL
DB_HOST=172.21.0.2          # IP o hostname del servidor PostgreSQL
DB_PORT=5432
DB_NAME=truc
DB_USER=postgres
DB_PASSWORD=la_teua_contrasenya

# JWT — canvia-ho per una cadena llarga i aleatòria
JWT_SECRET=canvia_aixo_per_un_secret_llarg_i_aleatori

# URL pública del frontend (s'usa en els correus d'invitació)
FRONTEND_URL=http://localhost:8081

# SMTP per a correus (invitacions i restabliment de contrasenya)
SMTP_HOST=smtp.exemple.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=correu@exemple.com
SMTP_PASS=contrasenya_smtp
SMTP_FROM=correu@exemple.com
```

### 3. Arrenca amb Docker Compose

```bash
docker compose up -d
```

Serveis arrencats:
- **Frontend**: http://localhost:8081
- **Backend**: port 3001 (intern, no exposat directament)

### 4. Migracions de la base de dades

Les migracions s'executen automàticament a l'arrancar el backend. El fitxer de migració es troba a `backend/migrations/001_schema.sql`.

Si vols executar-les manualment:

```bash
docker compose exec truc-backend node src/config/migrate.js
```

## Estructura del projecte

```
truc/
├── backend/
│   ├── src/
│   │   ├── config/         # DB, email, migracions
│   │   ├── controllers/    # Auth, sales
│   │   ├── game/
│   │   │   ├── deck.js     # Mazo de 22 cartes i càlcul de l'envit
│   │   │   └── engine.js   # Lògica completa del joc
│   │   ├── middleware/     # Autenticació JWT
│   │   ├── routes/         # Auth, sales
│   │   └── sockets/
│   │       └── gameSocket.js  # Events Socket.io i temporizador de torn
│   └── migrations/
│       └── 001_schema.sql
├── frontend/
│   └── src/
│       ├── components/     # Card, LangToggle
│       ├── contexts/       # AuthContext
│       ├── i18n/           # Traduccions (es / va)
│       ├── pages/          # Login, Register, Lobby, Game, ...
│       └── styles/         # global.css
├── docker-compose.yml
├── .env.example
└── README.md
```

## Regles implementades

### Mazo
22 cartes: as d'espases, as de bastons, 3–7 de tots els pals (sense 8/9/10/11/12, sense 2s, sense as d'ors ni as de copes).

### Jerarquia de cartes
```
1-espases > 1-bastons > 7-espases > 7-oros > 3 > 7-copes/bastons > 6 > 5 > 4
```

### Truc
| Cridada | Valor | Si es plega |
|---------|-------|-------------|
| Truc | 2 pts | 1 pt |
| Retruc | 3 pts | 2 pts |
| Quatre Val | 4 pts | 3 pts |
| Joc Fora | 24 pts | 4 pts |

### Envit
| Cridada | Valor | Si es plega |
|---------|-------|-------------|
| Envit | 2 pts | 1 pt |
| Torne | 4 pts | 2 pts |

Càlcul de l'envit: les 2 cartes del mateix pal amb valor més alt + 20. Si no hi ha parella de pal, la carta de major valor.

### Guanyador
El primer equip que arribe a **24 pedres** guanya la partida.

### Equips
- **Equip 1**: jugadors en posicions 0 i 2
- **Equip 2**: jugadors en posicions 1 i 3

## Temporizador de torn

Cada jugador té **2 minuts** per realitzar el seu moviment (jugar una carta, acceptar/declinar un desafiament). Si el temps s'esgota:

- L'equip que havia d'actuar perd la mà
- L'equip contrari guanya **3 pedres**

El temporizador es mostra com una barra de progrés sota el marcador d'estat:
- **Groc** (or): temps normal
- **Taronja**: menys de 30 segons
- **Roig**: menys de 10 segons

## Flux d'una partida

1. Un jugador crea una sala des del Lobby
2. Comparteix el codi o l'enllaç d'invitació
3. Quan hi ha 4 jugadors, l'amfitrió inicia la partida
4. Els jugadors es distribueixen automàticament en 2 equips
5. Les mans es reparteixen, el joc comença

## Desenvolupament local (sense Docker)

### Backend

```bash
cd backend
npm install
# Configura .env a la carpeta arrel
node src/index.js
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend en mode dev apunta al backend a través del proxy de Vite (vegeu `vite.config.js`).

## Variables d'entorn de referència

Totes les variables necessàries estan documentades a `.env.example`.

| Variable | Descripció |
|----------|------------|
| `DB_HOST` | Hostname o IP del servidor PostgreSQL |
| `DB_PORT` | Port PostgreSQL (per defecte 5432) |
| `DB_NAME` | Nom de la base de dades |
| `DB_USER` | Usuari PostgreSQL |
| `DB_PASSWORD` | Contrasenya PostgreSQL |
| `JWT_SECRET` | Secret per signar tokens JWT |
| `FRONTEND_URL` | URL pública del frontend |
| `SMTP_HOST` | Servidor SMTP per a correus |
| `SMTP_PORT` | Port SMTP |
| `SMTP_SECURE` | `true` per SSL, `false` per STARTTLS |
| `SMTP_USER` | Usuari SMTP |
| `SMTP_PASS` | Contrasenya SMTP |
| `SMTP_FROM` | Adreça remitent dels correus |
