# SenéMarché — Backend API

## Stack
- **Runtime** : Node.js 18+
- **Framework** : Express.js
- **Base de données** : Supabase (PostgreSQL)
- **Emails OTP** : EmailJS
- **Déploiement** : Railway.app (gratuit)

---

## Déploiement en 4 étapes

### 1. Supabase (base de données)
1. Va sur [supabase.com](https://supabase.com) → New Project
2. Note l'**URL** et la **service_role key** (Settings → API)
3. Dans SQL Editor → colle le contenu de `schema.sql` → Run

### 2. Variables d'environnement
Copie `.env.example` → `.env` et remplis les valeurs :
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
EMAILJS_SERVICE_ID=service_xxx
EMAILJS_TEMPLATE_ID=template_xxx
EMAILJS_PRIVATE_KEY=votre_private_key
PORT=3000
FRONTEND_URL=https://ton-app.netlify.app
```

### 3. Railway.app (serveur)
1. Va sur [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Connecte ce dossier
3. Ajoute les variables d'environnement dans Railway → Variables
4. Railway te donne une URL publique ex: `https://senemarche-api.railway.app`

### 4. Connecter le frontend
Dans le fichier HTML de l'app, remplace :
```javascript
const API_URL = 'https://senemarche-api.railway.app';
```

---

## Routes disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/otp/send` | Envoyer code OTP par email |
| POST | `/api/otp/verify` | Vérifier le code OTP |
| POST | `/api/auth/register` | Créer un compte |
| POST | `/api/auth/login` | Se connecter |
| GET | `/api/annonces` | Lister les annonces |
| POST | `/api/annonces` | Créer une annonce (auth) |
| POST | `/api/annonces/:id/vue` | Incrémenter les vues |
| GET | `/api/favs` | Mes favoris (auth) |
| POST | `/api/favs/:annId` | Toggle favori (auth) |
| GET | `/api/wallet` | Mon portefeuille (auth) |
| POST | `/api/wallet/recharge` | Recharger (auth) |
| POST | `/api/paiement` | Payer une annonce (auth) |
| GET | `/api/messages` | Mes messages (auth) |
| POST | `/api/messages` | Envoyer un message (auth) |

---

## Prochaine étape : PayDunya (vrais paiements)
Remplace les sections commentées dans `server.js` par les appels API PayDunya
une fois ton compte marchand validé (NINEA + compte bancaire requis).
