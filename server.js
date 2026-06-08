// ═══════════════════════════════════════════════════════════════
//  SenéMarché — Backend API
//  Node.js + Express + Supabase
//  Déploiement : Railway.app ou Render.com (gratuit)
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// ── Supabase client ──────────────────────────────────────────
// Compatible Node.js 18+ avec ws pour WebSocket
const ws = require('ws');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    global: {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: ws,
    }
  }
);

// ── OTP store en mémoire (TTL 5 min) ────────────────────────
const otpStore = new Map();
function genOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }
function saveOTP(email, code) {
  otpStore.set(email, { code, exp: Date.now() + 5 * 60 * 1000 });
}
function checkOTP(email, code) {
  const entry = otpStore.get(email);
  if (!entry) return 'expired';
  if (Date.now() > entry.exp) { otpStore.delete(email); return 'expired'; }
  if (String(code).trim() !== entry.code) return 'wrong';
  otpStore.delete(email); return 'ok';
}

// ── Envoi OTP via EmailJS REST API ───────────────────────────
async function sendOTPEmail(email, name, context) {
  const code = genOTP();
  saveOTP(email, code);
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id:     process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: email,
          to_name:  name || email.split('@')[0],
          otp_code: code,
          context:  context || 'SenéMarché',
        },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return { ok: true };
  } catch (err) {
    console.error('EmailJS error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════

// ── Santé ─────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'SenéMarché API — OK' }));

// ── OTP : envoyer (le frontend se charge d'envoyer l'email via EmailJS) ───────
app.post('/api/otp/send', async (req, res) => {
  const { email, name, context } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return res.status(400).json({ error: 'Email invalide' });
  const code = genOTP();
  saveOTP(email, code);
  // On renvoie le code au frontend qui se charge de l'envoyer via EmailJS
  // (EmailJS fonctionne uniquement depuis le navigateur)
  res.json({ ok: true, code, message: 'Code généré' });
});

// ── OTP : vérifier ────────────────────────────────────────────
app.post('/api/otp/verify', (req, res) => {
  const { email, code } = req.body;
  const result = checkOTP(email, String(code));
  if (result === 'expired') return res.status(400).json({ error: 'Code expiré', code: 'expired' });
  if (result === 'wrong')   return res.status(400).json({ error: 'Code incorrect', code: 'wrong' });
  res.json({ ok: true });
});

// ── AUTH : inscription ────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Champs manquants' });

  // Créer l'utilisateur dans Supabase Auth
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  // Créer le profil dans la table users
  const { error: profErr } = await supabase.from('users').insert({
    id:         authData.user.id,
    email:      email,
    name:       name,
    wallet:     0,
    created_at: new Date().toISOString(),
  });
  if (profErr) return res.status(500).json({ error: profErr.message });

  res.json({ ok: true, userId: authData.user.id, name });
});

// ── AUTH : connexion ──────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const { data: profile } = await supabase
    .from('users').select('*').eq('id', data.user.id).single();

  res.json({ ok: true, token: data.session.access_token, user: profile });
});

// ── ANNONCES : lister ─────────────────────────────────────────
app.get('/api/annonces', async (req, res) => {
  const { cat, region, q, limit = 40, offset = 0 } = req.query;
  let query = supabase.from('annonces')
    .select('*, users(name)')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (cat && cat !== 'all') query = query.eq('cat', cat);
  if (region)               query = query.eq('region', region);
  if (q)                    query = query.ilike('titre', `%${q}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// ── ANNONCES : créer ──────────────────────────────────────────
app.post('/api/annonces', requireAuth, async (req, res) => {
  const { titre, prix, cat, region, desc, tel } = req.body;
  if (!titre || !prix || !tel)
    return res.status(400).json({ error: 'Champs obligatoires manquants' });

  const EMOJIS = { immobilier:'🏠',vehicules:'🚗',electronique:'📱',mode:'👗',
    maison:'🛋️',services:'🔧',agriculture:'🌾',loisirs:'⚽',autres:'📦' };

  const { data, error } = await supabase.from('annonces').insert({
    titre, prix: Number(prix), cat, region, desc, tel,
    emoji: EMOJIS[cat] || '📦',
    vendeur_id:   req.userId,
    vendeur_name: req.userName,
    active: true,
    vues:   0,
    created_at: new Date().toISOString(),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// ── ANNONCES : incrémenter vues ───────────────────────────────
app.post('/api/annonces/:id/vue', async (req, res) => {
  await supabase.rpc('increment_vues', { ann_id: req.params.id });
  res.json({ ok: true });
});

// ── FAVORIS ───────────────────────────────────────────────────
app.get('/api/favs', requireAuth, async (req, res) => {
  const { data } = await supabase.from('favs')
    .select('annonce_id').eq('user_id', req.userId);
  res.json({ ok: true, data: (data || []).map(f => f.annonce_id) });
});

app.post('/api/favs/:annId', requireAuth, async (req, res) => {
  const { annId } = req.params;
  const { data: existing } = await supabase.from('favs')
    .select('id').eq('user_id', req.userId).eq('annonce_id', annId).single();

  if (existing) {
    await supabase.from('favs').delete().eq('id', existing.id);
    res.json({ ok: true, action: 'removed' });
  } else {
    await supabase.from('favs').insert({ user_id: req.userId, annonce_id: annId });
    res.json({ ok: true, action: 'added' });
  }
});

// ── WALLET : solde ────────────────────────────────────────────
app.get('/api/wallet', requireAuth, async (req, res) => {
  const { data } = await supabase.from('users')
    .select('wallet').eq('id', req.userId).single();
  const { data: txs } = await supabase.from('transactions')
    .select('*').eq('user_id', req.userId)
    .order('created_at', { ascending: false }).limit(20);
  res.json({ ok: true, balance: data?.wallet || 0, transactions: txs || [] });
});

// ── WALLET : recharge ─────────────────────────────────────────
app.post('/api/wallet/recharge', requireAuth, async (req, res) => {
  const { montant, methode } = req.body;
  if (!montant || montant < 500 || montant > 500000)
    return res.status(400).json({ error: 'Montant invalide (500–500 000 FCFA)' });

  // En production : appel API PayDunya/InTouch ici
  // Pour l'instant : crédit direct simulé (à remplacer par webhook de confirmation)
  const { data: user } = await supabase.from('users')
    .select('wallet').eq('id', req.userId).single();

  const newBalance = (user?.wallet || 0) + Number(montant);
  await supabase.from('users').update({ wallet: newBalance }).eq('id', req.userId);
  await supabase.from('transactions').insert({
    user_id:    req.userId,
    type:       'recharge',
    montant:    Number(montant),
    methode,
    label:      'Recharge ' + methode,
    created_at: new Date().toISOString(),
  });
  res.json({ ok: true, newBalance });
});

// ── PAIEMENT annonce ──────────────────────────────────────────
app.post('/api/paiement', requireAuth, async (req, res) => {
  const { annonce_id, methode } = req.body;
  const COMM = 0.03;

  const { data: ann } = await supabase.from('annonces')
    .select('*').eq('id', annonce_id).single();
  if (!ann) return res.status(404).json({ error: 'Annonce introuvable' });

  const commission = Math.round(ann.prix * COMM);

  // Log transaction
  await supabase.from('transactions').insert({
    user_id:     req.userId,
    type:        'paiement',
    montant:     -ann.prix,
    commission,
    methode,
    annonce_id,
    label:       'Achat : ' + ann.titre.slice(0, 40),
    created_at:  new Date().toISOString(),
  });

  // En production : déclencher paiement Wave/OM via PayDunya ici
  res.json({ ok: true, commission, message: 'Paiement enregistré' });
});

// ── MESSAGES ──────────────────────────────────────────────────
app.get('/api/messages', requireAuth, async (req, res) => {
  const { data } = await supabase.from('messages')
    .select('*').or(`from_id.eq.${req.userId},to_id.eq.${req.userId}`)
    .order('created_at', { ascending: false });
  res.json({ ok: true, data: data || [] });
});

app.post('/api/messages', requireAuth, async (req, res) => {
  const { to_id, annonce_id, texte } = req.body;
  if (!texte?.trim()) return res.status(400).json({ error: 'Message vide' });
  const { data, error } = await supabase.from('messages').insert({
    from_id:    req.userId,
    from_name:  req.userName,
    to_id,
    annonce_id,
    texte:      texte.slice(0, 1000),
    lu:         false,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// ════════════════════════════════════════════════════════════════
//  MIDDLEWARE AUTH
// ════════════════════════════════════════════════════════════════
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token invalide' });
  const { data: profile } = await supabase.from('users')
    .select('name').eq('id', user.id).single();
  req.userId   = user.id;
  req.userEmail = user.email;
  req.userName  = profile?.name || user.email;
  next();
}

// ── Démarrage ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ SenéMarché API démarrée sur le port ${PORT}`));
